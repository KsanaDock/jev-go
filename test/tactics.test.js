import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,play,replay,legalMoves,indexOf} from '../public/gomoku.js';
import {analyzeTactics} from '../tactics.js';
import {buildRequest} from '../decisions.js';
import {buildChatRequest} from '../chat.js';
import {createServer} from '../server.js';
import {JEV,DEEPSEEK} from '../public/models.js';
function position(black,white=[],turn=2){const g=newGame();for(const m of black)g.board[indexOf(m)]=1;for(const m of white)g.board[indexOf(m)]=2;g.turn=turn;return g;}
test('takes a win before defending; detects gaps, diagonals, edges and overlines',()=>{
  for(const stones of [['A1','B1','C1','D1'],['A1','B1','D1','E1'],['P11','P12','P13','P14'],['A1','B2','C3','D4'],['A5','B4','C3','D2'],['A1','B1','C1','E1','F1']]){
    const g=position(['A10','B10','C10','D10'],stones),a=analyzeTactics(g);
    assert.equal(a.reason,'win_now');for(const m of a.candidates)assert.equal(play(g,m).winner,2);
  }
});
test('blocks a single winning point, and honestly identifies an unavoidable open four',()=>{
  const g=position(['A1','B1','C1','D1']);const a=analyzeTactics(g);
  assert.deepEqual(a.candidates,['E1']);assert.equal(a.reason,'avoid_immediate_loss');
  const lost=analyzeTactics(position(['B1','C1','D1','E1']));
  assert.equal(lost.reason,'unavoidable_immediate_loss');assert.equal(lost.candidateCount,lost.legalCount);
});
test('finds a safe double threat but never prefers it over blocking an immediate loss',()=>{
  const g=position([],['F8','G8','H8']);const a=analyzeTactics(g);
  assert.equal(a.reason,'force_win_next');assert.ok(a.candidates.includes('E8'));
  const r=a.reports.find(r=>r.move==='E8');assert.deepEqual(new Set(r.ownWinningFollowups),new Set(['D8','J8']));
  const fork=play(g,'E8');for(const reply of legalMoves(fork)){const after=play(fork,reply);assert.equal(after.winner,null);assert.ok(r.ownWinningFollowups.filter(m=>m!==reply).some(m=>play(after,m).winner===2));}
  const danger=analyzeTactics(position(['A1','B1','C1','D1'],['F8','G8','H8']));
  assert.deepEqual(danger.candidates,['E1']);assert.equal(danger.reports.find(r=>r.move==='E8').forcedFork,false);
});
test('tactical checks agree with the independent game rules on deterministic random legal boards',()=>{
  let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let trial=0;trial<4;trial++){
    let g=newGame();for(let n=0;n<35+trial*4;n++){const moves=legalMoves(g);g=play(g,moves[Math.floor(random()*moves.length)]);if(g.winner)break;}
    if(g.winner)continue;
    const before=JSON.stringify(g),a=analyzeTactics(g);assert.equal(JSON.stringify(g),before);
    for(const r of a.reports.filter((_,i)=>i%17===0)){
      const next=play(g,r.move);assert.equal(r.winsNow,next.winner===g.turn);
      if(r.winsNow)continue;
      const replies=legalMoves(next).filter(m=>play(next,m).winner===next.turn);
      assert.deepEqual(r.opponentWinningReplies,replies);
      if(r.forcedFork)for(const m of legalMoves(next)){
        const after=play(next,m);assert.ok(legalMoves(after).some(move=>play(after,move).winner===g.turn));
      }
    }
  }
});
test('both models receive identical English evidence and restricted candidates; direct mode stays unchanged',()=>{
  const g=position(['A1','B1','C1','D1']),a=analyzeTactics(g),jev=buildRequest(g,a),chat=buildChatRequest(g,a);
  assert.deepEqual(Object.keys(jev.questions.move.criteria),['E1']);
  assert.deepEqual(chat.response_format.json_schema.schema.properties.move.enum,['E1']);
  assert.deepEqual(JSON.parse(chat.messages[1].content).state,jev.state);
  assert.doesNotMatch(JSON.stringify([jev,chat]),/[^\x00-\x7F]/);
  assert.equal(Object.keys(buildRequest(g).questions.move.criteria).length,221);
  assert.equal(buildRequest(g).state.tactical_analysis,undefined);
});
test('API enforces tactical candidates with one request, preserves cost on rejection and supports direct baseline',async t=>{
  let calls=0,choice='E1';const server=createServer({apiKey:'test',fetchImpl:async(url,options)=>{
    calls++;const request=JSON.parse(options.body);
    return new Response(JSON.stringify(request.messages?{choices:[{message:{content:JSON.stringify({move:choice})}}],usage:{cost:.003}}:{answers:{move:{choice,probabilities:{[choice]:1}}},usage:{cost:.003}}));
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const moves=['A1','P15','B1','N15','C1','L15','D1'];assert.equal(replay(moves).turn,2);
  const send=(model,strategy)=>fetch(`http://127.0.0.1:${server.address().port}/api/decide`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:'gomoku',moves,model,strategy})});
  for(const model of [JEV,DEEPSEEK]){
    choice='E1';let before=calls,res=await send(model,'tactical'),data=await res.json();assert.equal(res.status,200);assert.equal(calls-before,1);assert.equal(data.strategy,'tactical');assert.deepEqual(data.tactics.candidates,['E1']);
    choice='H8';before=calls;res=await send(model,'tactical');data=await res.json();assert.equal(res.status,502);assert.equal(calls-before,1);assert.equal(data.billing.cost,.003);assert.equal(data.choice,undefined);
    res=await send(model,'direct');data=await res.json();assert.equal(res.status,200);assert.equal(data.choice,'H8');assert.equal(data.strategy,'direct');assert.equal(data.tactics,undefined);
  }
  const before=calls,res=await send(JEV,'invalid');assert.equal(res.status,400);assert.equal(calls,before);
});
