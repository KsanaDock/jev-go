import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildChatRequest,parseChatDecision,CHAT_ENDPOINT} from '../chat.js';
import {buildRequest} from '../decisions.js';
import {replay,legalMoves} from '../public/go.js';
import {DEEPSEEK} from '../public/models.js';
import {createServer} from '../server.js';
test('DEEPSEEK gets the same board, candidates and objective with reasoning explicitly disabled',()=>{
  const game=replay(['E5']),jev=buildRequest(game),glm=buildChatRequest(game),prompt=JSON.parse(glm.messages[1].content);
  assert.deepEqual(prompt.state,jev.state);assert.deepEqual(prompt.legal_moves,jev.questions.move.criteria);
  assert.ok(glm.messages[0].content.startsWith(jev.questions.move.instructions));
  assert.deepEqual(glm.response_format.json_schema.schema.properties.move.enum,legalMoves(game));
  assert.equal(glm.model,DEEPSEEK);assert.deepEqual(glm.reasoning,{enabled:false});assert.equal(glm.max_tokens,128);
});
test('DEEPSEEK normalizes actual usage without inventing a probability distribution',()=>{
  const out=parseChatDecision({model:DEEPSEEK,choices:[{finish_reason:'stop',message:{content:'{"move":"D4"}'}}],usage:{prompt_tokens:100,completion_tokens:42,completion_tokens_details:{reasoning_tokens:0},cost:.000021}},['D4','pass']);
  assert.equal(out.choice,'D4');assert.deepEqual(out.probabilities,{});assert.equal(out.usage.reasoning_tokens,0);assert.equal(out.usage.cost,.000021);
});
test('DEEPSEEK rejects truncated, malformed and illegal answers; pass remains a real choice',()=>{
  for(const content of ['', 'D4', '{}','null','{"move":"A9"}'])assert.throws(()=>parseChatDecision({choices:[{message:{content}}]},['D4','pass']));
  assert.throws(()=>parseChatDecision({choices:[{finish_reason:'length',message:{content:'{"move":"D4"}'}}]},['D4']),/额度/);
  assert.equal(parseChatDecision({choices:[{message:{content:'{"move":"pass"}'}}]},['D4','pass']).choice,'pass');
});
test('server dispatches DEEPSEEK to chat endpoint, validates headers and records attribution',async t=>{
  let calls=0;
  const s=createServer({apiKey:'test',fetchImpl:async(url,options)=>{calls++;new Request(url,options);assert.equal(url,CHAT_ENDPOINT);assert.equal(JSON.parse(options.body).model,DEEPSEEK);return new Response(JSON.stringify({model:DEEPSEEK,choices:[{message:{content:'{"move":"D4"}'},finish_reason:'stop'}],usage:{prompt_tokens:123,completion_tokens:12,cost:.001}}));}});
  await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
  const url=`http://127.0.0.1:${s.address().port}`;
  const call=body=>fetch(url+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let r=await call({model:DEEPSEEK,moves:['E5']});assert.equal(r.status,200);const data=await r.json();assert.equal(data.requestedModel,DEEPSEEK);assert.equal(data.source,'chat');assert.equal(data.choice,'D4');
  r=await call({model:'not-allowed',moves:['E5']});assert.equal(r.status,400);
  r=await call({model:'z-ai/glm-5.3-flash',moves:['E5']});assert.equal(r.status,400);
  r=await call({model:'constructor',moves:['E5']});assert.equal(r.status,400);
  r=await call({model:DEEPSEEK,moves:['pass','pass']});assert.equal(r.status,400);assert.equal(calls,1);
});
