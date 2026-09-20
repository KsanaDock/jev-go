import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,play,replay,legalMoves,indexOf,hash,areaScore} from '../public/go.js';
import {buildRequest,parseDecision,ENDPOINT} from '../decisions.js';
import {createServer} from '../server.js';

function position(black,white,turn=1){const s=newGame();for(const m of black)s.board[indexOf(m)]=1;for(const m of white)s.board[indexOf(m)]=2;s.turn=turn;s.positions=[hash(s.board)];return s;}
test('capture a group; input stays immutable; occupied move rejected',()=>{
  const s=position(['A2','C2','B1'],['B2']);const next=play(s,'B3');
  assert.equal(next.board[indexOf('B2')],0);assert.equal(next.captures[1],1);assert.equal(s.board[indexOf('B2')],2);
  assert.throws(()=>play(next,'B3'),/已经/);
});
test('multi-stone capture and liberties',()=>{const s=position(['A2','A3','C2','C3','B1'],['B2','B3']);const n=play(s,'B4');assert.equal(n.captures[1],2);});
test('suicide excluded from legal candidates',()=>{const s=position([],['B1','A2','C2','B3']);assert.throws(()=>play(s,'B2'),/没有气/);assert.ok(!legalMoves(s).includes('B2'));});
test('ko recapture rejected by positional superko',()=>{
  const s=position(['A2','B1','B3'],['B2','C1','C3','D2']);const n=play(s,'C2');assert.equal(n.captures[1],1);assert.throws(()=>play(n,'B2'),/重复/);
});
test('two passes end play, replay and bounds validate',()=>{const s=replay(['E5','pass','pass']);assert.equal(s.passes,2);assert.deepEqual(legalMoves(s),[]);assert.throws(()=>play(s,'D4'),/结束|停一手/);assert.throws(()=>replay(['I5']),/棋盘/);assert.throws(()=>replay(['A1','A1']),/已经/);});
test('area scoring includes stones, territory and komi; shared area stays neutral',()=>{
  const s=position(['A2','B1'],['J9']);const score=areaScore(s);assert.equal(score.black,3);assert.equal(score.white,7.5);
  assert.equal(areaScore(newGame()).white,6.5);
  assert.equal(areaScore(position(['A2','B1'],['A1','J9']),[indexOf('A1')]).black,3);
});
test('request includes exactly legal choices and actual board; parser never substitutes',()=>{
  const s=replay(['E5']);const body=buildRequest(s);assert.equal(body.state.to_play,'white');assert.ok(!('E5' in body.questions.move.criteria));assert.equal(Object.keys(body.questions.move.criteria).length,81);
  assert.throws(()=>parseDecision({answers:{move:{choice:'E5'}}},legalMoves(s)),/无效/);
  const out=parseDecision({answers:{move:{choice:'D4',probabilities:{D4:.7,pass:.3,E5:1}}}},legalMoves(s));assert.deepEqual(out.probabilities,{D4:.7,pass:.3});
});
async function serving(t,options){const s=createServer(options);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return `http://127.0.0.1:${s.address().port}`;}
test('API forwards decision request and returns actual answer without exposing key',async t=>{
  let calls=0;const url=await serving(t,{apiKey:'test-private-key',fetchImpl:async(endpoint,options)=>{calls++;const request=new Request(endpoint,options);assert.equal(request.headers.get('x-title'),'Jev Go - Local experiment');assert.equal(endpoint,ENDPOINT);assert.equal(options.headers.Authorization,'Bearer test-private-key');assert.equal(JSON.parse(options.body).state.to_play,'white');return new Response(JSON.stringify({model:'typesafe/jev-test',answers:{move:{choice:'D4',probabilities:{D4:.8,pass:.2}}},usage:{cost:.0001}}));}});
  const res=await fetch(url+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:['E5']})});assert.equal(res.status,200);const raw=await res.text();assert.ok(!raw.includes('test-private-key'));const data=JSON.parse(raw);assert.equal(data.choice,'D4');assert.equal(calls,1);assert.equal(typeof data.elapsedMs,'number');
});
test('missing key, invalid history and foreign origin make no paid calls',async t=>{
  let calls=0;const url=await serving(t,{apiKey:'',fetchImpl:()=>{calls++;throw new Error('Unexpected call');}});
  const send=(body,origin)=>fetch(url+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  assert.equal((await send({moves:[]})).status,401);assert.equal((await send({apiKey:'test',moves:['A1','A1']})).status,400);assert.equal((await send({apiKey:'test',moves:[]},'https://untrusted.example')).status,403);assert.equal(calls,0);
});
test('upstream errors and invalid choices do not produce a fallback move',async t=>{
  let mode=0;const url=await serving(t,{apiKey:'test',fetchImpl:async()=>mode===0?new Response('{}',{status:402}):new Response(JSON.stringify({answers:{move:{choice:'E5'}},usage:{cost:.000123}}))});
  const request=()=>fetch(url+'/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:['E5']})});
  let res=await request();assert.equal(res.status,402);assert.equal((await res.json()).choice,undefined);mode=1;res=await request();assert.equal(res.status,502);const error=await res.json();assert.equal(error.choice,undefined);assert.equal(error.billing.cost,.000123);
});
