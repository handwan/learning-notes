# Applications

把模型变成产品：RAG、Agent、结构化输出、MCP 工具生态、应用评测、guardrails。它和[Inference](../inference/index.md)的分工是：推理解决“模型怎么跑”，这里解决“模型怎么用”。

## 前置

- LLM 能力与限制：[LLM](../llm/index.md)
- 推理服务、流式、超时：[Inference](../inference/index.md)

## 学习路径

| # | 篇目 | 要解决的问题 | 实验 |
|---|---|---|---|
| 1 | [RAG](01-RAG.md) | 切分、embedding、检索、重排、引用、失败模式 | 小语料 RAG：chunk/recall 评测 |
| 2 | [Agent 与工具调用](02-Agent与工具调用.md) | ReAct、function calling、循环、失败恢复、权限 | 只读工具 Agent：校验/权限/trace |
| 3 | [结构化输出](03-结构化输出.md) | JSON Schema、约束解码、校验与重试 | JSON 校验/重试漏斗 |
| 4 | [MCP 与工具生态](04-MCP与工具生态.md) | MCP、工具注册、权限、版本 | 最小 MCP stdio server/client |
| 5 | [应用评测](05-应用评测.md) | 端到端评测集、回归、LLM-as-judge、线上指标 | 30 条回归集 + 安全门禁 |
| 6 | [Guardrails 与安全](06-Guardrails与安全.md) | 输入/输出过滤、权限、越权、提示注入 | Agent 三层 guardrail：输入/工具/输出 |

## 读完能做什么

- 能判断一个需求该用 RAG、Agent 还是普通 prompt
- 能搭一个带引用、可评测的 RAG
- 能给 Agent 接工具、设权限边界和失败恢复，而不是“让它自己跑”
- 能给应用加输入/输出 guardrails，并做回归评测

## 相关分栏

- 模型原理、评测与安全：[LLM](../llm/index.md)
- 训练与微调：[Training](../training/index.md)
- 推理引擎、量化、服务化：[Inference](../inference/index.md)
- GPU、集群、部署、成本：[Infra](../infra/index.md)

## 参考

- Lewis et al., *Retrieval-Augmented Generation*：<https://arxiv.org/abs/2005.11401>
- Gao et al., *Retrieval-Augmented Generation for Large Language Models: A Survey*：<https://arxiv.org/abs/2312.10997>
- Liu et al., *Lost in the Middle*：<https://arxiv.org/abs/2307.03172>
- Asai et al., *Self-RAG*：<https://arxiv.org/abs/2310.11511>
- Es et al., *RAGAS*：<https://arxiv.org/abs/2309.15217>
- Yao et al., *ReAct*：<https://arxiv.org/abs/2210.03629>
- Schick et al., *Toolformer*：<https://arxiv.org/abs/2302.04761>
- Zheng et al., *Judging LLM-as-a-Judge*：<https://arxiv.org/abs/2306.05685>
- Liang et al., *HELM*：<https://arxiv.org/abs/2211.09110>
- Chiang et al., *Chatbot Arena*：<https://arxiv.org/abs/2403.04132>
- JSON Schema：<https://json-schema.org/>
- Model Context Protocol：<https://modelcontextprotocol.io/>
- OWASP LLM Top 10：<https://genai.owasp.org/llm-top-10/>
- Outlines：<https://github.com/dottxt-ai/outlines>
