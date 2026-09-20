export const SIZE = 9;
export const LETTERS = 'ABCDEFGHJ';
export const coord = i => LETTERS[i % SIZE] + (SIZE - Math.floor(i / SIZE));
export const indexOf = name => name === 'pass' ? -1 : Array.from({length:81}, (_, i) => coord(i)).indexOf(name);
export const hash = board => board.join('');
export function neighbors(i) {
  const x = i % SIZE, y = Math.floor(i / SIZE), result = [];
  if(x) result.push(i-1); if(x<SIZE-1) result.push(i+1);
  if(y) result.push(i-SIZE); if(y<SIZE-1) result.push(i+SIZE);
  return result;
}
export function group(board, start) {
  const color = board[start], stones = new Set([start]), liberties = new Set(), pending = [start];
  while(pending.length) for(const n of neighbors(pending.pop())) {
    if(!board[n]) liberties.add(n);
    else if(board[n] === color && !stones.has(n)) { stones.add(n); pending.push(n); }
  }
  return {stones:[...stones], liberties:[...liberties]};
}
export function newGame() {
  const board = Array(81).fill(0);
  return {board, turn:1, captures:{1:0,2:0}, moves:[], positions:[hash(board)], passes:0};
}
export function play(state, move) {
  if(state.passes >= 2) throw new Error('双方已停一手，请先数子或继续落子。');
  const next = {...state, captures:{...state.captures}, board:[...state.board], moves:[...state.moves], positions:[...state.positions]};
  const color = state.turn, opponent = 3-color;
  if(move === 'pass') next.passes++;
  else {
    const i = indexOf(move);
    if(i<0) throw new Error('落点不在棋盘上。');
    if(next.board[i]) throw new Error('这里已经有棋子了。');
    next.board[i] = color;
    let captured = 0;
    for(const n of neighbors(i)) if(next.board[n] === opponent) {
      const g = group(next.board,n);
      if(!g.liberties.length) { captured += g.stones.length; for(const s of g.stones) next.board[s] = 0; }
    }
    if(!group(next.board,i).liberties.length) throw new Error('禁入点：这手棋没有气。');
    const position = hash(next.board);
    if(state.positions.includes(position)) throw new Error('这手会重复此前局面，不能落子（全局同形禁着）。');
    next.positions.push(position); next.captures[color] += captured; next.passes = 0;
  }
  next.moves.push({color, move}); next.turn = opponent;
  return next;
}
export function replay(moves) {
  if(!Array.isArray(moves) || moves.length>1000) throw new Error('棋谱格式不正确或过长。');
  return moves.reduce((s,m) => { if(typeof m !== 'string') throw new Error('棋谱格式不正确。'); return play(s,m); },newGame());
}
export function legalMoves(state) {
  if(state.passes >= 2) return [];
  const moves = [];
  state.board.forEach((stone,i) => { if(!stone) { try { play(state,coord(i)); moves.push(coord(i)); } catch {} } });
  return [...moves,'pass'];
}
export function areaScore(state, dead = []) {
  const board = [...state.board]; for(const i of dead) board[i] = 0;
  const areas = {1:0,2:0}, seen = new Set(), territory = Array(81).fill(0);
  board.forEach((stone,i) => {
    if(stone) {areas[stone]++; return;}
    if(seen.has(i)) return;
    const empty = [i], stack = [i], borders = new Set(); seen.add(i);
    while(stack.length) for(const n of neighbors(stack.pop())) {
      if(board[n]) borders.add(board[n]);
      else if(!seen.has(n)) {seen.add(n); stack.push(n); empty.push(n);}
    }
    if(borders.size === 1) {const owner = [...borders][0]; areas[owner] += empty.length; for(const n of empty) territory[n] = owner;}
  });
  return {black:areas[1], white:areas[2]+6.5, komi:6.5, territory};
}
