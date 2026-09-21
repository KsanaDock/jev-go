import {SIZE,coord} from './public/gomoku.js';
const directions=[[1,0],[0,1],[1,1],[1,-1]];
function winsAt(board,i,color){
  const x=i%SIZE,y=Math.floor(i/SIZE);
  return directions.some(([dx,dy])=>{
    let count=1;
    for(const sign of [-1,1])for(let n=1;n<SIZE;n++){
      const nx=x+sign*n*dx,ny=y+sign*n*dy;
      if(nx<0||ny<0||nx>=SIZE||ny>=SIZE||board[ny*SIZE+nx]!==color)break;
      count++;
    }
    return count>=5;
  });
}
function winningPoints(board,color){return board.flatMap((s,i)=>!s&&winsAt(board,i,color)?[i]:[]);}
// Exhaustive one-move checks; a safe move with two distinct winning replies
// is a proven fork because the opponent can occupy only one and cannot capture.
export function analyzeTactics(game){
  if(game.kind!=='gomoku'||game.winner||game.draw)throw new Error('战术检查需要进行中的五子棋对局。');
  const start=performance.now(),board=[...game.board],color=game.turn,opponent=3-color;
  const empty=board.flatMap((s,i)=>s?[]:[i]);
  const reports=empty.map(i=>{
    const winsNow=winsAt(board,i,color);board[i]=color;
    const opponentWins=winsNow?[]:winningPoints(board,opponent);
    const nextWins=winsNow?[]:winningPoints(board,color);
    board[i]=0;
    return {move:coord(i),winsNow,opponentWinningReplies:opponentWins.map(coord),ownWinningFollowups:nextWins.map(coord),forcedFork:!winsNow&&!opponentWins.length&&nextWins.length>=2};
  });
  const wins=reports.filter(r=>r.winsNow),safe=reports.filter(r=>!r.opponentWinningReplies.length),forks=safe.filter(r=>r.forcedFork);
  const selected=wins.length?wins:forks.length?forks:safe.length?safe:reports;
  const reason=wins.length?'win_now':forks.length?'force_win_next':safe.length?'avoid_immediate_loss':'unavoidable_immediate_loss';
  return {mode:'tactical',reason,legalCount:reports.length,candidateCount:selected.length,candidates:selected.map(r=>r.move),reports,analysisMs:Math.round(performance.now()-start)};
}
export function tacticalEvidence(analysis){
  return {method:'Exact rules-based checks of immediate wins, opponent winning replies, and safe double winning threats. No long-term win probability is computed.',selection:analysis.reason,legal_count:analysis.legalCount,candidate_count:analysis.candidateCount,unchecked_horizon:'Beyond the immediate replies and double threats, positions are not evaluated.',omitted_candidate_checks:'Candidates omitted from candidate_checks have no immediate win, no opponent winning reply and no own winning followup.',candidate_checks:analysis.reports.filter(r=>analysis.candidates.includes(r.move)&&(r.winsNow||r.opponentWinningReplies.length||r.ownWinningFollowups.length))};
}
