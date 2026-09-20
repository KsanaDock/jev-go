import {buildRequest} from './decisions.js';
import {DEEPSEEK} from './public/models.js';
export const CHAT_ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
export function buildChatRequest(game) {
  const decision=buildRequest(game), question=decision.questions.move;
  return {
    model:DEEPSEEK,
    messages:[
      {role:'system',content:question.instructions+' Return only a JSON object with the key "move" containing one exact candidate name. Do not output explanations or probabilities.'},
      {role:'user',content:JSON.stringify({state:decision.state,legal_moves:question.criteria})}
    ],
    reasoning:{enabled:false},
    max_tokens:128,
    response_format:{type:'json_schema',json_schema:{name:'go_move',strict:true,schema:{type:'object',properties:{move:{type:'string',enum:Object.keys(question.criteria)}},required:['move'],additionalProperties:false}}},
    provider:{require_parameters:true}
  };
}
export function parseChatDecision(data,legal) {
  const completion=data?.choices?.[0];
  if(completion?.finish_reason==='length') throw new Error('DeepSeek 用完了本次输出额度，尚未完整给出落点。这次没有落子，可以重试。');
  let answer;
  try {answer=JSON.parse(completion?.message?.content);} catch {throw new Error('DeepSeek 未返回可读取的落点，这次没有落子。请重试。');}
  if(!answer || typeof answer.move!=='string' || !legal.includes(answer.move)) throw new Error('DeepSeek 返回了无效落点，本次没有落子。请重试。');
  return {choice:answer.move,probabilities:{},model:typeof data.model==='string'?data.model:DEEPSEEK,source:'chat',reasoningEnabled:false,usage:{input_tokens:data.usage?.prompt_tokens??null,output_tokens:data.usage?.completion_tokens??null,reasoning_tokens:data.usage?.completion_tokens_details?.reasoning_tokens??null,cost:typeof data.usage?.cost==='number'?data.usage.cost:null}};
}
