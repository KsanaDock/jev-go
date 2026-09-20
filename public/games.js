import * as go from './go.js';
import * as gomoku from './gomoku.js';
export const GAMES={go:{...go,name:'九路围棋'},gomoku:{...gomoku,name:'五子棋'}};
export function engine(kind='go') {
  if(!Object.hasOwn(GAMES,kind)) throw new Error('请选择围棋或五子棋。');
  return GAMES[kind];
}
