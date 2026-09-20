import {coord, legalMoves} from './public/go.js';
export const MODEL = 'typesafe/jev-1.13';
export const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export function buildRequest(game) {
  const legal = legalMoves(game);
  if(!legal.length) throw new Error('对局已经结束。');
  return {
    model:MODEL,
    state:{
      game:'Go (Weiqi), 9x9',
      rules:'Chinese area scoring: live stones + surrounded empty intersections. White komi 6.5 points. No suicide. Positional superko. Two consecutive passes end play. Captured stones do not add separate points.',
      coordinates:'Columns A B C D E F G H J, left to right (skip I). Rows 9 to 1, top to bottom. Orthogonal neighbors only. X=black, O=white, .=empty.',
      board_rows:Array.from({length:9},(_,r)=>`${9-r} ${game.board.slice(r*9,r*9+9).map(s=>'.XO'[s]).join(' ')}`),
      stones:{black:game.board.flatMap((s,i)=>s===1?[coord(i)]:[]),white:game.board.flatMap((s,i)=>s===2?[coord(i)]:[])},
      to_play:game.turn===1?'black':'white',
      move_number:game.moves.length+1,
      consecutive_passes:game.passes,
      history:game.moves.map(m=>`${m.color===1?'B':'W'}:${m.move}`)
    },
    questions:{move:{
      type:'choice',
      instructions:'You are playing Go as the to_play color. Choose the legal move that best improves your chance of winning the entire game against a strong opponent. Consider liberties, captures, saving endangered groups, connections, eyes, territory, and the opponent response. All supplied moves are legal. Pass only if no useful moves remain. Select exactly one candidate.',
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
