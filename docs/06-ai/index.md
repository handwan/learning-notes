# AI Engineering

按分层栈组织：基础 → 模型 → 平台 → 工作负载 → 应用；论文横切。数学在 `03-math`，硬件与编译在 `02-computer-basics`。

## 分层

```text
基础层：ML Basics → DL Basics
模型层：LLM
平台层：Infra
工作负载：Training / Inference
应用层：Applications
横切：Papers
```

## 分栏

| 分栏 | 回答的问题 | 入口 |
|---|---|---|
| ML Basics | 什么是“从数据里学”？经典模型和评估怎么做？ | [ml-basics](ml-basics/index.md) |
| DL Basics | 神经网络怎么工作、怎么训练？ | [dl-basics](dl-basics/index.md) |
| LLM | tokenizer、架构、预训练、scaling、对齐、评测与安全 | [llm](llm/index.md) |
| Infra | 算力、集群、存储、网络、部署、成本 | [infra](infra/index.md) |
| Training | 数据、微调、对齐、RLVR、并行与显存 | [training](training/index.md) |
| Inference | 引擎、批调度、量化、服务化、压测 | [inference](inference/index.md) |
| Applications | RAG、Agent、MCP、结构化输出、评测与 guardrails | [applications](applications/index.md) |
| Papers | 这些结论从哪来？ | [papers](papers/index.md) |

## 怎么读

- **模型路线**：ML Basics → DL Basics → LLM
- **训练路线**：LLM → Training → Infra
- **推理路线**：LLM → Inference → Infra
- **Infra 路线**：Infra → Training / Inference
- **应用路线**：LLM → Applications
- **Papers**：从 `papers` 进入，每篇回链到对应分栏

## 横切主题

数据、评测、安全不单独开栏：数据在 `llm`/`training`，评测在 `llm`/`applications`，安全在 `llm`/`applications`。

## 边界

- 数学推导：`03-math`
- GPU、编译、体系结构：`02-computer-basics`
- 经典 AI（搜索/规划/知识表示）、推荐系统、扩散模型、通用 RL：不在本章范围

> Python 环境：`~/.venvs/ai`（PyTorch 2.14 + ONNX Runtime）。
