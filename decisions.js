import {tacticalEvidence} from './tactics.js';
import {engine} from './public/games.js';
export const MODEL = 'typesafe/jev-1.13';
export const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export function buildRequest(game,analysis=null) {
  const {coord,legalMoves,SIZE,LETTERS}=engine(game.kind??'go');
  const gomoku=game.kind==='gomoku';
  const legal = analysis?analysis.candidates:legalMoves(game);
  if(!legal.length) throw new Error('对局已经结束。');
  return {
    model:MODEL,
    state:{
      ...(analysis?{tactical_analysis:tacticalEvidence(analysis)}:{}),
      game:gomoku?'Gomoku (freestyle), 15x15':'Go (Weiqi), 9x9',
      rules:gomoku?'Black plays first. Alternate placing one stone on an empty intersection. First to connect five or more stones horizontally, vertically, or diagonally wins. No forbidden moves, captures, passes, or komi. Full board without a winner is a draw.':'Chinese area scoring: live stones + surrounded empty intersections. White komi 6.5 points. No suicide. Positional superko. Two consecutive passes end play. Captured stones do not add separate points.',
      coordinates:`Columns ${LETTERS.split('').join(' ')}, left to right (skip I). Rows ${SIZE} to 1, top to bottom. ${gomoku?'Winning lines may be horizontal, vertical, or diagonal.':'Groups and liberties use orthogonal neighbors only.'} X=black, O=white, .=empty.`,
      board_rows:Array.from({length:SIZE},(_,r)=>`${SIZE-r} ${game.board.slice(r*SIZE,r*SIZE+SIZE).map(s=>'.XO'[s]).join(' ')}`),
      stones:{black:game.board.flatMap((s,i)=>s===1?[coord(i)]:[]),white:game.board.flatMap((s,i)=>s===2?[coord(i)]:[])},
      to_play:game.turn===1?'black':'white',
      move_number:game.moves.length+1,
      consecutive_passes:game.passes,
      history:game.moves.map(m=>`${m.color===1?'B':'W'}:${m.move}`)
    },
    questions:{move:{
      type:'choice',
      instructions:analysis?'You are playing Gomoku as the to_play color. A rules-based verifier has checked candidate moves. Choose exactly one supplied candidate. Priority: win immediately; otherwise prevent immediate defeat; otherwise create a forced double winning threat. The supplied candidates already enforce these priorities where possible. Use the verified candidate_checks as facts, then compare longer-term threats and defense. If selection is unavoidable_immediate_loss, no move prevents the opponent winning next turn; do not mistake it for a safe position. The checks do not prove long-term safety.':gomoku?'You are playing Gomoku as the to_play color. Choose the legal move that best improves your chance of winning. Complete five in a row when possible; block immediate opponent wins and consider threats in all four line directions. All supplied moves are legal. Select exactly one candidate.':'You are playing Go as the to_play color. Choose the legal move that best improves your chance of winning the entire game against a strong opponent. Consider liberties, captures, saving endangered groups, connections, eyes, territory, and the opponent response. All supplied moves are legal. Pass only if no useful moves remain. Select exactly one candidate.',
      criteria:Object.fromEntries(legal.map(m=>[m,m==='pass'?'Pass this turn without placing a stone.':`Place a ${game.turn===1?'black':'white'} stone at ${m}.`]))
    }}
  };
}
export function parseDecision(data, legal) {
  const answer = data?.answers?.move;
  if(!answer || typeof answer.choice !== 'string' || !legal.includes(answer.choice)) throw new Error('Jev 返回了无效落点，本次没有落子。请重试。');
  const probabilities = Object.fromEntries(Object.entries(answer.probabilities ?? {}).filter(([k,v])=>legal.includes(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1));
  return {choice:answer.choice,probabilities,model:typeof data.model==='string'?data.model:MODEL,usage:{input_tokens:data.usage?.input_tokens??null,output_tokens:data.usage?.output_tokens??null,cost:typeof data.usage?.cost==='number'?data.usage.cost:null}};
}
