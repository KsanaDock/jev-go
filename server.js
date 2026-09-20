import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {engine} from './public/games.js';
import {buildRequest,parseDecision,MODEL,ENDPOINT} from './decisions.js';
import {buildChatRequest,parseChatDecision,CHAT_ENDPOINT} from './chat.js';
import {MODELS,DEEPSEEK} from './public/models.js';

export function createServer({apiKey=process.env.OPENROUTER_API_KEY||'',fetchImpl=fetch}={}) {
  let busy = false;
  const files = {'/':'index.html','/app.js':'app.js','/go.js':'go.js','/gomoku.js':'gomoku.js','/games.js':'games.js','/models.js':'models.js','/costs.js':'costs.js','/style.css':'style.css'};
  return http.createServer(async(req,res)=>{
    let chargePossible=false;
    const reply = (status,data) => {if(status>=400 && !data.billing)data={...data,billing:{cost:null,chargePossible}};res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    const host = req.headers.host;
    if(!/^127\.0\.0\.1:\d+$/.test(host||'')) return reply(403,{error:'请使用本机地址访问。'});
    if(req.headers.origin && req.headers.origin!==`http://${host}`) return reply(403,{error:'不允许跨站请求。'});
    const path = req.url?.split('?')[0];
    if(req.method==='GET' && path==='/api/config') return reply(200,{hasKey:Boolean(apiKey),model:MODEL,models:MODELS});
    if(req.method==='POST' && path==='/api/decide') {
      if(!req.headers['content-type']?.startsWith('application/json')) return reply(415,{error:'请求格式不正确。'});
      if(busy) return reply(429,{error:'已有一手棋正在请求，请稍后再试。'});
      let body='';
      try {
        for await(const chunk of req) {body+=chunk; if(body.length>65536) return reply(413,{error:'请求过大。'});}
        const input = JSON.parse(body);
        const model=input.model??MODEL;
        if(typeof model!=='string' || !Object.hasOwn(MODELS,model)) return reply(400,{error:'请选择 Jev 或 DeepSeek V4.1 Flash。'});
        const key = typeof input.apiKey==='string' && input.apiKey.trim() ? input.apiKey.trim():apiKey;
        if(!key) return reply(401,{error:'请先连接 OpenRouter 密钥。'});
        if(key.length>512 || /[\r\n]/.test(key)) return reply(400,{error:'密钥格式不正确。'});
        let game,legalMoves;
        try {const rules=engine(input.game??'go');legalMoves=rules.legalMoves;game=rules.replay(input.moves);} catch(e) {return reply(400,{error:e.message});}
        if(game.winner||game.draw) return reply(400,{error:'本局已结束，请重新开局。'});
        if(game.passes>=2) return reply(400,{error:'对局已进入数子，请先继续落子或重新开局。'});
        const isChat=model===DEEPSEEK;
        const request=isChat?buildChatRequest(game):buildRequest(game);
        if(busy) return reply(429,{error:'已有一手棋正在请求，请稍后再试。'});
        busy=true;
        const controller = new AbortController(), timeout=setTimeout(()=>controller.abort(),45000);
        const onClose=()=>{if(!res.writableEnded) controller.abort();}; res.on('close',onClose);
        const start=performance.now();
        try {
          chargePossible=true;
          const upstream=await fetchImpl(isChat?CHAT_ENDPOINT:ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'Jev Go - Local experiment'},body:JSON.stringify(request),signal:controller.signal});
          if(!upstream.ok) {
            const messages={401:'OpenRouter 密钥无效，请重新连接。',402:'OpenRouter 余额不足，请充值后重试。',403:'此密钥没有访问所选模型的权限。',404:'所选模型暂无符合请求条件的可用服务，请稍后重试。',429:'OpenRouter 请求过于频繁，请稍后重试。'};
            return reply(upstream.status>=500?502:upstream.status,{error:messages[upstream.status]||`OpenRouter 暂时无法完成选招（HTTP ${upstream.status}），请重试。`});
          }
          const data=await upstream.json();
          let result;
          try {result=isChat?parseChatDecision(data,legalMoves(game)):parseDecision(data,legalMoves(game));} catch(e) {const cost=data?.usage?.cost;return reply(502,{error:e.message,billing:{cost:typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:null,chargePossible:true}});}
          reply(200,{...result,requestedModel:model,source:isChat?'chat':'decisions',elapsedMs:Math.round(performance.now()-start)});
        } catch(e) {reply(502,{error:controller.signal.aborted?'本次请求超时或已取消，没有自动代下。可以重试。':'无法连接 OpenRouter，请检查网络后重试。'});}
        finally {clearTimeout(timeout);res.off('close',onClose);busy=false;}
      } catch {reply(400,{error:'请求内容无法读取。'});}
      return;
    }
    if(req.method==='GET' && files[path]) {
      const file=files[path];
      const data=await readFile(new URL(`./public/${file}`,import.meta.url));
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"});res.end(data);return;
    }
    reply(404,{error:'页面不存在。'});
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.JEV_GO_PORT||4317);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Jev Go ready: http://127.0.0.1:${port}`));
}
