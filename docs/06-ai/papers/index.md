# Papers

一篇一页：问题、方法、结论、和现有内容的连接。不追求数量，追求“能把论文里的结论讲清楚，并指出它对应哪一篇笔记”。

## 怎么读

1. 先读摘要、图表、结论，回答“它解决什么问题”
2. 再读方法，能画出输入 → 输出 → 损失
3. 最后读实验，确认“在什么条件下成立”
4. 写一页笔记：问题、方法、结论、局限、对应笔记

## 近期（2025–2026）

只收有代表性的工作：新方法、新模型、新系统、新评测；经典论文仍在下面。

### 推理与 RL

| 论文 | 看点 | 对应 |
|---|---|---|
| [*DeepSeek-R1*](https://arxiv.org/abs/2501.12948) (2025) | 纯 RL 激励推理；R1-Zero 与蒸馏小模型 | [LLM](../llm/index.md) / [Training](../training/index.md) |
| [*s1: Simple test-time scaling*](https://arxiv.org/abs/2501.19393) (2025) | 1k 数据 + budget forcing；test-time scaling 的最小复现 | [LLM](../llm/index.md) |
| [*When More Thinking Hurts*](https://arxiv.org/abs/2604.10739) (2026) | overthinking；更多 token 不一定更好 | [Inference](../inference/index.md) |

### 开放模型

| 论文 | 看点 | 对应 |
|---|---|---|
| [*Qwen3 Technical Report*](https://arxiv.org/abs/2505.09388) (2025) | 混合推理模式；小模型密集、大模型 MoE | [LLM](../llm/index.md) |
| [*Kimi K2: Open Agentic Intelligence*](https://arxiv.org/abs/2507.20534) (2025) | 1T MoE、MuonClip、agentic 能力 | [LLM](../llm/index.md) / [Training](../training/index.md) |
| [*GLM-4.5: Agentic, Reasoning, and Coding*](https://arxiv.org/abs/2508.06471) (2025) | ARC 统一；混合思考模式 | [LLM](../llm/index.md) |
| [*Qwen3-VL Technical Report*](https://arxiv.org/abs/2511.21631) (2025) | 视觉-语言模型；多模态 agent | [LLM](../llm/index.md) / [Applications](../applications/index.md) |
| [*Kimi K2.5: Visual Agentic Intelligence*](https://arxiv.org/abs/2602.02276) (2026) | 视觉 agentic 能力；多模态任务 | [Applications](../applications/index.md) |

### 推理系统

| 论文 | 看点 | 对应 |
|---|---|---|
| [*From LLM Inference to Agentic Workloads*](https://arxiv.org/abs/2608.15127) (2026) | agent 负载和单轮推理的差异；对 serving 的影响 | [Inference](../inference/index.md) |
| [*Efficient Multi-round LLM Inference over Disaggregated Serving*](https://arxiv.org/abs/2602.14516) (2026) | 多轮对话 + prefill/decode 分离 | [Inference](../inference/index.md) |
| [*Taming the Titans: A Survey of Efficient LLM Inference Serving*](https://arxiv.org/abs/2504.19720) (2025) | 推理服务综述；适合建立地图 | [Inference](../inference/index.md) |

### Agent 与评测

| 论文 | 看点 | 对应 |
|---|---|---|
| [*Terminal-Bench*](https://arxiv.org/abs/2601.11868) (2026) | 命令行真实任务；agent 能力评测 | [Applications](../applications/index.md) |
| [*OSWorld 2.0*](https://arxiv.org/abs/2606.29537) (2026) | 长程 computer-use agent | [Applications](../applications/index.md) |
| [*Measuring AI Ability to Complete Long Software Tasks*](https://arxiv.org/abs/2503.14499) (2025) | 长任务完成能力；METR | [Applications](../applications/index.md) |

## 基础

| 论文 | 主题 | 对应 |
|---|---|---|
| [*A Survey of Large Language Models*](https://arxiv.org/abs/2303.18223) (2023) | 领域地图；预训练/后训练/使用/评测 | [LLM](../llm/index.md) |
| [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762) (2017) | Transformer | [DL Basics](../dl-basics/index.md) |
| [*Language Models are Few-Shot Learners*](https://arxiv.org/abs/2005.14165) (2020) | GPT-3 / in-context learning | [LLM](../llm/index.md) |
| [*Scaling Laws for Neural Language Models*](https://arxiv.org/abs/2001.08361) (2020) | scaling | [LLM](../llm/index.md) |
| [*Training Compute-Optimal Large Language Models*](https://arxiv.org/abs/2203.15556) (2022) | Chinchilla | [LLM](../llm/index.md) |
| [*The Llama 3 Herd of Models*](https://arxiv.org/abs/2407.21783) (2024) | 开放模型训练配方 | [LLM](../llm/index.md) |

## 数据

| 论文 | 主题 | 对应 |
|---|---|---|
| [*The Pile*](https://arxiv.org/abs/2101.00027) (2021) | 预训练语料 | [LLM](../llm/index.md) |
| [*Deduplicating Training Data Makes Language Models Better*](https://arxiv.org/abs/2107.06499) (2021) | 训练数据去重 | [LLM](../llm/index.md) |
| [*FineWeb*](https://arxiv.org/abs/2406.17557) (2024) | 网页数据清洗与配比 | [LLM](../llm/index.md) |

## 训练

| 论文 | 主题 | 对应 |
|---|---|---|
| [*ZeRO*](https://arxiv.org/abs/1910.02054) (2019) | 显存优化 | [Training](../training/index.md) |
| [*Megatron-LM*](https://arxiv.org/abs/1909.08053) (2019) | 张量并行 | [Training](../training/index.md) |
| [*Mixed Precision Training*](https://arxiv.org/abs/1710.03740) (2017) | 混合精度 | [Training](../training/index.md) |
| [*LoRA*](https://arxiv.org/abs/2106.09685) / [*QLoRA*](https://arxiv.org/abs/2305.14314) (2021/2023) | 低秩微调；QLoRA 在量化基座上做 LoRA | [Training](../training/index.md) |
| [*DPO*](https://arxiv.org/abs/2305.18290) (2023) | 直接偏好优化 | [Training](../training/index.md) |

## 推理

| 论文 | 主题 | 对应 |
|---|---|---|
| [*FlashAttention*](https://arxiv.org/abs/2205.14135) (2022) | 注意力内核 | [Inference](../inference/index.md) |
| [*PagedAttention / vLLM*](https://arxiv.org/abs/2309.06180) (2023) | KV cache 管理 | [Inference](../inference/index.md) |
| [*Orca*](https://www.usenix.org/conference/osdi22/presentation/yu) (2022) | 连续批处理 | [Inference](../inference/index.md) |
| [*Speculative Decoding*](https://arxiv.org/abs/2211.17192) (2022) | 小模型草稿 + 大模型验证 | [Inference](../inference/index.md) |
| [*Sarathi-Serve*](https://arxiv.org/abs/2403.02310) (2024) | chunked prefill + stall-free 调度 | [Inference](../inference/index.md) |
| [*DistServe*](https://arxiv.org/abs/2401.09670) (2024) | prefill/decode 分离部署 | [Inference](../inference/index.md) |
| [*GPTQ*](https://arxiv.org/abs/2210.17323) (2022) | 训练后量化 | [Inference](../inference/index.md) |
| [*AWQ*](https://arxiv.org/abs/2306.00978) (2023) | 激活感知量化 | [Inference](../inference/index.md) |
| [*SmoothQuant*](https://arxiv.org/abs/2211.10438) (2022) | 激活/权重平滑 | [Inference](../inference/index.md) |

## 应用与评测

| 论文 | 主题 | 对应 |
|---|---|---|
| [*Retrieval-Augmented Generation*](https://arxiv.org/abs/2005.11401) (2020) | RAG | [Applications](../applications/index.md) |
| [*RAG for LLMs: A Survey*](https://arxiv.org/abs/2312.10997) (2023) | RAG 全景；检索/生成/增强 | [Applications](../applications/index.md) |
| [*Lost in the Middle*](https://arxiv.org/abs/2307.03172) (2023) | 长上下文 | [Applications](../applications/index.md) |
| [*Self-RAG*](https://arxiv.org/abs/2310.11511) (2023) | 自反思检索 | [Applications](../applications/index.md) |
| [*ReAct*](https://arxiv.org/abs/2210.03629) (2022) | Agent | [Applications](../applications/index.md) |
| [*Toolformer*](https://arxiv.org/abs/2302.04761) (2023) | 工具调用 | [Applications](../applications/index.md) |
| [*HELM*](https://arxiv.org/abs/2211.09110) (2022) | 整体评测 | [Applications](../applications/index.md) |
| [*Judging LLM-as-a-Judge*](https://arxiv.org/abs/2306.05685) (2023) | 自动评测 | [Applications](../applications/index.md) |
| [*Chatbot Arena*](https://arxiv.org/abs/2403.04132) (2024) | 人类偏好评测 | [Applications](../applications/index.md) |
| [*LiveBench*](https://arxiv.org/abs/2406.19314) (2024) | 防污染的动态评测 | [Applications](../applications/index.md) |
| [*HarmBench*](https://arxiv.org/abs/2402.04249) (2024) | 有害行为/越狱评测 | [Applications](../applications/index.md) |

## 读完能做什么

- 能判断一篇论文是“新结构”“新训练方法”还是“新系统优化”
- 能说清它的实验条件和局限，不把单一 benchmark 当结论
- 能把论文结论回链到具体笔记，而不是孤立地摘抄

## 怎么持续跟

- arXiv：<https://arxiv.org/list/cs.CL/recent>、<https://arxiv.org/list/cs.LG/recent>
- Hugging Face Papers：<https://huggingface.co/papers>
- Papers with Code：<https://paperswithcode.com/>
- Sebastian Raschka 的 LLM Research Papers 季度清单：<https://magazine.sebastianraschka.com/>
- 会议：NeurIPS / ICML / ICLR / ACL / OSDI / NSDI
- 实验室博客：OpenAI、Anthropic、Google DeepMind、Meta AI、Qwen、DeepSeek、Moonshot

更新规则：每季度扫一次，只收“改变做法”的论文；经典清单不动，近期清单滚动更新。

## 使用说明

- 不追求覆盖所有论文；优先选有代表性的那几篇
- 近期清单会过时，按季度替换，不堆数量
- 不做逐段翻译；一页笔记只记问题、方法、结论、局限
- 综述和博客只做辅助，结论以论文和官方文档为准

## 参考

- arXiv：<https://arxiv.org/>
- Papers with Code：<https://paperswithcode.com/>
- ACL Anthology：<https://aclanthology.org/>
