export const JEV = 'typesafe/jev-1.13';
export const DEEPSEEK = 'deepseek/deepseek-v4.1-flash';
export const MODELS = {
  [JEV]: {name:'Jev 1.13',shortName:'Jev',kind:'decisions'},
  [DEEPSEEK]: {name:'DeepSeek V4.1 Flash',shortName:'DeepSeek',kind:'chat'}
};
export const modelName = id => MODELS[id]?.name || (id?.startsWith('typesafe/jev')?'Jev':id || '模型');
