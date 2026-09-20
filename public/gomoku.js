export const SIZE=15;
export const LETTERS='ABCDEFGHJKLMNOP';
export const coord=i=>LETTERS[i%SIZE]+(SIZE-Math.floor(i/SIZE));
export const indexOf=name=>Array.from({length:SIZE*SIZE},(_,i)=>coord(i)).indexOf(name);
export function newGame(){return {kind:'gomoku',board:Array(SIZE*SIZE).fill(0),turn:1,moves:[],passes:0,captures:{1:0,2:0},winner:null,draw:false};}
export function play(state,move){
  if(state.winner||state.draw) throw new Error('本局已结束，请重新开局。');
  const i=indexOf(move);
  if(i<0) throw new Error('请选择棋盘上的空位，五子棋不能停一手。');
  if(state.board[i]) throw new Error('这里已经有棋子了。');
  const board=[...state.board],color=state.turn;
  board[i]=color;
  const x=i%SIZE,y=Math.floor(i/SIZE);
  const winner=[[1,0],[0,1],[1,1],[1,-1]].some(([dx,dy])=>{
    let count=1;
    for(const sign of [-1,1]) for(let step=1;step<SIZE;step++){
      const nx=x+dx*step*sign,ny=y+dy*step*sign;
      if(nx<0||nx>=SIZE||ny<0||ny>=SIZE||board[ny*SIZE+nx]!==color) break;
      count++;
    }
    return count>=5;
  })?color:null;
  return {...state,board,turn:3-color,moves:[...state.moves,{color,move}],winner,draw:!winner&&board.every(Boolean)};
}
export function replay(moves){
  if(!Array.isArray(moves)||moves.length>SIZE*SIZE) throw new Error('棋谱格式不正确或过长。');
  return moves.reduce((state,move)=>{if(typeof move!=='string') throw new Error('棋谱格式不正确。');return play(state,move);},newGame());
}
export function legalMoves(state){return state.winner||state.draw?[]:state.board.flatMap((stone,i)=>stone?[]:[coord(i)]);}
