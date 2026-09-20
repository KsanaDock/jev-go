# 与 Jev 手谈

本机九路围棋实验。你执黑，可选择 OpenRouter 的 `typesafe/jev-1.13` 或 `deepseek/deepseek-v4.1-flash` 执白。新页面默认 DeepSeek；切换对手从下一次白方落子生效，不清空棋盘，旧落子记录保留模型归属。

## 运行

需要 Node.js 22 或更新版本，无需安装依赖。在本目录运行 `npm start`，打开 http://127.0.0.1:4317 。在页面右上角输入 OpenRouter API 密钥；也可在启动进程的环境中设置 `OPENROUTER_API_KEY`。页面输入的密钥仅存在页面内存，不落盘，刷新后需重填。服务仅监听本机。

`npm test` 验证围棋规则及接口适配。`JEV_GO_PORT` 可更改端口。

## 实验边界

- 向 https://openrouter.ai/api/alpha/decisions 发送棋盘、完整落子历史、所有合法选项；只使用 Jev 返回的 choice，无搜索或其他引擎代下。
- 支持提子、禁止自杀、全局同形禁着、停一手。两次连续停一手进入数子，由用户标记死棋；面积为活子加围空，白加 6.5 目。死活有争议应继续下棋。本工具的死棋标记不代表模型判断。
- 显示 API 返回的前五个选招概率、用量及费用；详情保留全部有效概率。概率不是胜率。耗时从服务发出请求到收到完整 JSON，含网络和排队。
- 悔棋撤回至上一个黑方回合。重新开局有确认，正在请求时可取消本局（上游可能已经产生费用）。模型报错时棋盘不自动代下，支持重试。
- 导出 JSON 包括每手结果与全部概率，不含密钥。应用不自动持久化棋谱，关闭或刷新前请导出。
- 本局费用按请求单独累计（美元），跨模型相加，悔棋和继续落子不扣除已产生费用，重试另计。无效落点仍保留接口返回费用。未返回费用或网络异常时标注未确认，本地校验拒绝不计收费。存在未知项时显示“本局已知费用”，不冒充完整账单。重新开局或刷新清零；导出含 spending 与 charges。更新前的旧页面请求不会自动补入。
- 尚未连接真实密钥时，不能视为完成 Jev 的棋力或延迟实测。

## DeepSeek Flash 对照

DeepSeek 使用 `/api/v1/chat/completions`，接收与 Jev 相同的棋盘、完整历史、选项目录和选招目标；通过严格 JSON Schema 只输出 `move`。本接入不请求其自报概率，不把落子选择伪装成概率分布。接口返回的费用、输入/输出及思考 tokens 如实展示；缺失思考用量显示未提供，不当作零。

2026-09-20 查询 OpenRouter 模型目录，DeepSeek V4.1 Flash 的 reasoning.mandatory=false。本实验明确发送 reasoning.enabled=false，最多 128 输出 tokens，45 秒超时，并要求服务支持所发送参数。此设置用于关闭推理，不是只隐藏思考文本。若响应仍报告正数思考 tokens，页面提示设置与实际用量不一致。达到额度仍未完成、落点非法、响应格式错误时均停下提示，不代下也不自动重试收费请求。Jev 保持原有策略。此前的 GLM 5.3 Flash 因响应慢已从可选模型中移除，旧页面提交该型号会收到选择模型的提示，不会悄悄换模型代下。

资料：https://openrouter.ai/deepseek/deepseek-v4.1-flash 与 https://openrouter.ai/docs/guides/best-practices/reasoning-tokens 。

## 接口依据

- https://github.com/OpenRouterTeam/ai-sdk-provider#evaluation-jev-with-ai-sdk-through-openrouter
- https://openrouter.ai/labs/jev/compile
- https://docs.typesafe.ai/primitives/choice

## 界面取舍

棋盘是主对象；棋盘、回合/错误、选招数据、棋谱依次展开。用棋盘木色 #d7b780、墨绿 #243930、纸色 #f5f6f2、灰绿 #738078、强调绿 #3b6752。标题宋体，正文系统中文无衬线，坐标与数值等宽。桌面左棋盘右数据，手机上下排列。实木棋盘作参考，不采用多卡片仪表盘。首要风险是过小落点、异步过期结果和将选招概率误标为胜率，分别以九路布局、版本校验及明示标签处理。
