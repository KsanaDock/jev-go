import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,play,replay,legalMoves,coord} from '../public/gomoku.js';
import * as go from '../public/go.js';
import {buildRequest} from '../decisions.js';
import {buildChatRequest} from '../chat.js';
import {createServer} from '../server.js';
import {JEV,DEEPSEEK} from '../public/models.js';

test('Gomoku wins in all directions, including overlines, without wrapping rows',()=>{
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
    for(const length of [5,6]){
      const state=newGame(), x=3,y=8;
      for(let n=1;n<length;n++)state.board[(y+n*dy)*15+x+n*dx]=1;
      const next=play(state,coord(y*15+x));
      assert.equal(next.winner,1);assert.equal(state.board[y*15+x],0);
      assert.deepEqual(legalMoves(next),[]);assert.throws(()=>play(next,'A1'));
    }
  }
  const state=newGame();for(const i of [13,14,15,16])state.board[i]=1;
  assert.equal(play(state,coord(17)).winner,null);
});
test('Gomoku replay rejects pass, occupied points and moves after a win',()=>{
  const moves=['A1','A3','B1','B3','C1','C3','D1','D3','E1'];
  assert.equal(replay(moves).winner,1);
  assert.throws(()=>replay([...moves,'P15']));
  assert.throws(()=>replay(['A1','A1']));assert.throws(()=>replay(['pass']));
  assert.throws(()=>replay(['I1']));assert.equal(legalMoves(replay(['H8'])).length,224);
  const draw=newGame();draw.board=Array.from({length:225},(_,i)=>(Math.floor(i/15)+Math.floor((i%15)/2))%2+1);draw.board[0]=0;
  const result=play(draw,'A15');assert.equal(result.draw,true);assert.equal(result.winner,null);
});
test('both games send English-only prompts to both models with matching state and candidates',()=>{
  for(const game of [go.play(go.newGame(),'E5'),play(newGame(),'H8')]){
    const request=buildRequest(game),chat=buildChatRequest(game);
    assert.doesNotMatch(JSON.stringify(request),/[^\x00-\x7F]/);
    assert.doesNotMatch(JSON.stringify(chat),/[^\x00-\x7F]/);
    assert.deepEqual(JSON.parse(chat.messages[1].content),{state:request.state,legal_moves:request.questions.move.criteria});
    if(game.kind==='gomoku'){
      assert.equal(request.state.board_rows.length,15);
      assert.match(request.state.rules,/five or more/);
      assert.equal(Object.keys(request.questions.move.criteria).length,224);
      assert.equal(request.questions.move.criteria.pass,undefined);
    }
  }
});
test('server routes Gomoku for both models and rejects invalid or finished games before billing',async t=>{
  let calls=0;
  const server=createServer({apiKey:'test',fetchImpl:async(url,options)=>{
    calls++;const request=JSON.parse(options.body);assert.doesNotMatch(options.body,/[^\x00-\x7F]/);
    const state=request.state||JSON.parse(request.messages[1].content).state;
    assert.match(state.game,/Gomoku/);
    return new Response(JSON.stringify(request.messages?{choices:[{message:{content:'{"move":"J8"}'}}]}:{answers:{move:{choice:'J8'}}}));
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const send=body=>fetch(`http://127.0.0.1:${server.address().port}/api/decide`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const model of [JEV,DEEPSEEK]){const res=await send({game:'gomoku',model,moves:['H8']});assert.equal(res.status,200);assert.equal((await res.json()).choice,'J8');}
  for(const body of [{game:'bad',moves:[]},{game:'gomoku',moves:['pass']},{game:'gomoku',moves:['A1','A3','B1','B3','C1','C3','D1','D3','E1']}]){
    const res=await send(body);assert.equal(res.status,400);assert.equal((await res.json()).billing.chargePossible,false);
  }
  assert.equal(calls,2);
});
