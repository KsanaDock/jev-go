import {newGame,play,replay,legalMoves,coord,group,areaScore} from './go.js';
import {MODELS,JEV,DEEPSEEK,modelName} from './models.js';
import {costEntry,summarizeCosts} from './costs.js';
const $=id=>document.getElementById(id);
let game=newGame(), apiKey='', hasServerKey=false, busy=false, failure='', latest=null, decisions=[], dead=new Set(), finished=false, version=0, controller=null, focusIndex=40;
let selectedModel=DEEPSEEK;
let charges=[];
const connected=()=>Boolean(apiKey||hasServerKey);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moveLabel=m=>m==='pass'?'停一手':m;
function makeBoard(){
  let svg='<svg class="grid" viewBox="0 0 100 100" aria-hidden="true"><g stroke="#715e41" stroke-width=".17">';
  for(let n=0;n<9;n++){const p=10+n*10;svg+=`<path d="M10 ${p}H90 M${p} 10V90"/>`;}
  svg+='</g><g fill="#715e41">';for(const [x,y] of [[30,30],[70,30],[50,50],[30,70],[70,70]])svg+=`<circle cx="${x}" cy="${y}" r=".6"/>`;
  svg+='</g><g font-size="2.1" font-family="Arial" fill="#7e6a4d" text-anchor="middle" dominant-baseline="middle">';
  for(let n=0;n<9;n++){const p=10+n*10;svg+=`<text x="${p}" y="4.2">${'ABCDEFGHJ'[n]}</text><text x="${p}" y="96">${'ABCDEFGHJ'[n]}</text><text x="4" y="${p}">${9-n}</text><text x="96" y="${p}">${9-n}</text>`;}
  svg+='</g></svg>';
  $('board').className='board-surface';$('board').innerHTML=svg+Array.from({length:81},(_,i)=>`<button class="intersection" data-index="${i}" style="left:${10+(i%9)*10}%;top:${10+Math.floor(i/9)*10}%" tabindex="${i===focusIndex?0:-1}" aria-label="${coord(i)} 空位"></button>`).join('');
}
function render(){
  const opponent=MODELS[selectedModel].shortName;
  $('opponent-name').textContent=modelName(selectedModel);
  $('opponent-model').value=selectedModel;$('opponent-model').disabled=busy;
  $('model-note').textContent=selectedModel===DEEPSEEK?'已请求关闭思考 · 只输出落点；切换从下一次白方落子生效。':'直接选择合法落点 · 切换从下一次白方落子生效。';
  $('retry').textContent=`让 ${opponent} 落子 / 重试`;
  const scoring=game.passes>=2, legal=new Set(scoring?[]:legalMoves(game)), last=game.moves.at(-1)?.move, score=scoring?areaScore(game,[...dead]):null;
  for(const el of $('board').querySelectorAll('button')){
    const i=Number(el.dataset.index), stone=game.board[i];
    const canPlay=!busy&&!finished&&!scoring&&game.turn===1&&legal.has(coord(i));
    el.classList.toggle('legal',canPlay);el.setAttribute('aria-disabled',String(scoring?!stone||finished:!canPlay));
    el.setAttribute('aria-label',`${coord(i)} ${stone===1?'黑子':stone===2?'白子':'空位'}${dead.has(i)?'，已标记死子':''}${last===coord(i)?'，上一手':''}`);
    el.innerHTML=stone?`<span class="piece ${stone===1?'black':'white'} ${last===coord(i)?'last':''} ${dead.has(i)?'dead':''}"></span>`:score?.territory[i]?`<span class="territory ${score.territory[i]===1?'black':'white'}"></span>`:'';
  }
  $('connection').className=`connection ${connected()?'ready':''} ${busy?'thinking':''}`;
  $('connection-label').textContent=connected()?'已配置密钥':'连接 OpenRouter';
  $('black-captures').textContent=game.captures[1];$('white-captures').textContent=game.captures[2];$('move-number').textContent=`第 ${game.moves.length+1} 手`;
  $('turn-title').textContent=finished?'本局结束':scoring?'一起数数子':busy?`${opponent} 正在选招`:game.turn===1?'轮到你落子':`轮到 ${opponent} 落子`;
  $('turn-description').textContent=finished?resultText(score):scoring?'双方已停一手。请标记死子，或继续下完争议局部。':busy?(selectedModel===DEEPSEEK?'DeepSeek 正在直接选招，已请求关闭思考。':'它正在所有合法落点中做选择。'):game.turn===1?(game.moves.at(-1)?.move==='pass'?`${modelName(latest?.requestedModel||latest?.model)} 停了一手。你可以继续落子，或停一手进入数子。`:connected()?'你执黑，点击交叉点落子。':`你执黑先行。连接 OpenRouter 后，落下第一颗棋子。`):`等待 ${opponent} 的下一手。`;
  $('error').hidden=!failure;$('error').textContent=failure;$('retry').hidden=busy||scoring||finished||game.turn!==2;
  $('pass').disabled=busy||scoring||finished||game.turn!==1;$('undo').disabled=busy||!game.moves.length;
  $('score-panel').hidden=!scoring;$('finish').hidden=finished;$('resume').hidden=finished;
  if(score)$('score-preview').textContent=`黑 ${score.black} · 白 ${score.white}（含贴目）`;
  $('board-hint').textContent=scoring?'点击整块棋，切换死子标记':busy?`${opponent} 正在选择下一手…`:'点击交叉点落子 · 方向键与回车也可操作';
  $('export').disabled=!game.moves.length;
  let rows='';for(let i=0;i<game.moves.length;i+=2){const record=decisions.find(d=>d.ply===i+2);const who=record?(MODELS[record.requestedModel]?.shortName||modelName(record.model)):'';rows+=`<div class="history-row"><span>${Math.floor(i/2)+1}</span><span><i class="stone-icon black"></i>${moveLabel(game.moves[i].move)}</span><span>${game.moves[i+1]?`<i class="stone-icon white"></i>${moveLabel(game.moves[i+1].move)} <small>${escape(who)}</small>`:'—'}</span></div>`;}
  $('history').innerHTML=rows||'<p class="empty-history">棋局尚未开始。</p>';$('history').scrollTop=$('history').scrollHeight;
  $('decision-coordinate').textContent=latest?moveLabel(latest.choice):'—';
  $('decision-title').textContent=latest?`${modelName(latest.requestedModel||latest.model)} 的这一手`:'模型的这一手';
  $('probability-note').textContent=latest?.source==='chat'?'本次只返回落点，未提供选招概率。已请求关闭思考；耗时包含网络与服务排队。':'选招概率不是胜率。耗时包含网络与服务排队。';
  if(latest?.source==='chat' && latest.usage.reasoning_tokens>0) $('probability-note').textContent='已请求关闭思考，但服务仍报告了思考 Token。请以本手实际用量与耗时为准。';
  $('latency').innerHTML=`${latest?latest.elapsedMs.toLocaleString():'—'}<small> ms</small>`;
  $('cost').textContent=latest?.usage.cost!=null?`$${latest.usage.cost.toFixed(6)}`:'—';
  const spending=summarizeCosts(charges);
  $('total-cost').textContent=`$${spending.knownTotal.toFixed(6)}`;
  $('total-cost-label').textContent=spending.unknownRequests?'本局已知费用（美元）':'本局总费用（美元）';
  $('total-cost-note').textContent=`已记录 ${spending.requests} 次请求 · 悔棋不扣费${spending.unknownRequests?` · ${spending.unknownRequests} 次费用未确认`:''}`;
  $('probabilities').innerHTML=latest?Object.entries(latest.probabilities).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,p])=>`<div class="prob-row"><span>${escape(moveLabel(m))}</span><div class="prob-track"><span style="width:${p*100}%"></span></div><span>${(p*100).toFixed(0)}%</span></div>`).join('')||'<p>本次未返回概率分布。</p>':'<div class="empty-line"></div><p>等它落子，看看它更倾向哪里。</p>';
  $('raw').textContent=latest?JSON.stringify(latest,null,2):'尚无返回';
  $('usage').textContent=latest?`输入 ${latest.usage.input_tokens??'—'} tokens · 输出 ${latest.usage.output_tokens??'—'} tokens${latest.source==='chat'?`（其中思考 ${latest.usage.reasoning_tokens??'未提供'} tokens）`:''}`:'尚无请求';
  $('model-info').textContent=`模型：${latest?.model??selectedModel} · 来源：OpenRouter ${latest?(latest.source==='chat'?'Chat Completions':'Decisions'):(selectedModel===DEEPSEEK?'Chat Completions':'Decisions')}`;
}
function resultText(score){const diff=score.black-score.white;return `${diff>0?'黑方':'白方'}胜 ${Math.abs(diff)} 目（按当前死子标记计算）。`;}
async function askJev(){
  if(busy||game.turn!==2||game.passes>=2||finished)return;
  if(!connected()){$('connect-dialog').showModal();return;}
  busy=true;failure='';render();const current=version;controller=new AbortController();
  const requestedModel=selectedModel;let recorded=false;
  try{
    const res=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:game.moves.map(m=>m.move),apiKey,model:selectedModel}),signal:controller.signal});
    const data=await res.json();if(current!==version)return;
    charges.push(costEntry(data,requestedModel,res.ok));recorded=true;
    if(!res.ok)throw new Error(data.error||'本次选招没有完成，请重试。');
    game=play(game,data.choice);latest=data;decisions.push({...data,ply:game.moves.length});
  }catch(e){if(current===version&&e.name!=='AbortError'){if(!recorded)charges.push(costEntry(null,requestedModel,false));failure=e.message;}}
  finally{if(current===version){busy=false;controller=null;render();}}
}
function humanMove(move){
  if(busy||finished||game.turn!==1||game.passes>=2)return;
  if(!connected()){$('connect-dialog').showModal();return;}
  try{game=play(game,move);failure='';render();askJev();}catch(e){failure=e.message;render();}
}
$('board').addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;const i=Number(el.dataset.index);focusIndex=i;
  if(game.passes>=2&&!finished&&game.board[i]){const stones=group(game.board,i).stones;const remove=dead.has(i);stones.forEach(s=>remove?dead.delete(s):dead.add(s));render();return;}
  humanMove(coord(i));
});
$('board').addEventListener('keydown',e=>{const el=e.target.closest('button');if(!el)return;let i=Number(el.dataset.index), x=i%9,y=Math.floor(i/9);if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')x=Math.max(0,x-1);if(e.key==='ArrowRight')x=Math.min(8,x+1);if(e.key==='ArrowUp')y=Math.max(0,y-1);if(e.key==='ArrowDown')y=Math.min(8,y+1);focusIndex=y*9+x;for(const b of $('board').querySelectorAll('button'))b.tabIndex=Number(b.dataset.index)===focusIndex?0:-1;$('board').querySelector(`[data-index="${focusIndex}"]`).focus();});
$('pass').onclick=()=>humanMove('pass');$('retry').onclick=askJev;
$('opponent-model').onchange=e=>{if(busy)return;selectedModel=e.target.value;failure='';render();};
$('connection').onclick=()=>{$('connect-dialog').showModal();$('api-key').focus();};
$('connect-form').onsubmit=e=>{e.preventDefault();const value=$('api-key').value.trim();if(!value.startsWith('sk-or-')||value.length<20){$('connect-error').textContent='请输入完整的 OpenRouter API 密钥。';return;}apiKey=value;$('api-key').value='';$('connect-error').textContent='';$('connect-dialog').close();render();askJev();};
document.querySelectorAll('.close-dialog').forEach(el=>el.onclick=()=>el.closest('dialog').close());
$('rules').onclick=()=>$('rules-dialog').showModal();
function reset(){version++;controller?.abort();controller=null;game=newGame();busy=false;failure='';latest=null;decisions=[];charges=[];dead.clear();finished=false;render();}
$('new-game').onclick=()=>game.moves.length?$('reset-dialog').showModal():reset();
$('confirm-reset').onclick=()=>{$('reset-dialog').close();reset();};
$('undo').onclick=()=>{if(busy||!game.moves.length)return;let moves=game.moves.map(m=>m.move);moves.pop();if(moves.length%2===1)moves.pop();game=replay(moves);decisions=decisions.filter(d=>d.ply<=moves.length);latest=decisions.at(-1)||null;finished=false;dead.clear();failure='';render();};
$('resume').onclick=()=>{game=replay(game.moves.slice(0,-2).map(m=>m.move));decisions=decisions.filter(d=>d.ply<=game.moves.length);latest=decisions.at(-1)||null;dead.clear();render();askJev();};
$('finish').onclick=()=>{finished=true;render();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'jev-go-v2',size:9,komi:6.5,rules:'Chinese area; positional superko; no suicide',selectedModel,moves:game.moves,decisions,spending:summarizeCosts(charges),charges,markedDead:[...dead].map(coord),result:finished?areaScore(game,[...dead]):null},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ai-go-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
makeBoard();render();fetch('/api/config').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(c=>{hasServerKey=c.hasKey;render();}).catch(()=>{failure='本机服务没有响应，请重新打开页面。';render();});
