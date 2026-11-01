# LLM

LLM 这条线：tokenizer、decoder-only Transformer、预训练 / scaling，然后是怎么生成、怎么对齐、怎么推理，最后是评测、安全与选型。它是[Training](../training/index.md)和[Inference](../inference/index.md)的共同前提。

## 前置

- Transformer 结构：[DL Basics 第 9 篇](../dl-basics/09-注意力与Transformer.md)
- 概率与信息论：[03-math](../../03-math/index.md)

## 学习路径

| # | 篇目 | 要解决的问题 | 实验 |
|---|---|---|---|
| 1 | [Tokenizer](01-Tokenizer.md) | BPE/WordPiece/SentencePiece；词表、压缩率、中文/代码 | 训练一个小 BPE，比较压缩率 |
| 2 | [LLM 架构](02-LLM架构.md) | decoder-only、RoPE、GQA/MQA、MoE、参数账 | 数一个 1B 模型的参数/显存 |
| 3 | [预训练目标](03-预训练目标.md) | next-token prediction、masked LM、encoder-only/decoder-only | 小语料对比不同目标 |
| 4 | [预训练数据](04-预训练数据.md) | 语料、清洗、去重、污染、配比、合成数据 | 去重前后对比 |
| 5 | [Scaling laws](05-Scaling-laws.md) | Kaplan/Chinchilla；参数/数据/算力怎么配 | 用公式反推小模型配置 |
| 6 | [解码与采样](06-解码与采样.md) | greedy/beam/top-k/top-p/temperature | 同一 prompt 比较解码策略 |
| 7 | [微调与对齐](07-微调与对齐.md) | SFT → RLHF → DPO/ORPO；偏好数据 | LoRA SFT 一个小模型 |
| 8 | [推理模型（Reasoning）](08-推理模型.md) | 长 CoT、RLVR、test-time compute、thinking/non-thinking | 同一模型开/关思考，比较 token 与准确率 |
| 9 | [LLM 评测与安全](09-评测与安全.md) | benchmark、污染、LLM-as-judge、越狱/红队 | 用两个 benchmark 复现一次评测 |
| 10 | [模型家族与选型](10-模型家族与选型.md) | Llama/Qwen/Kimi/GLM/DeepSeek；许可、上下文、benchmark 陷阱 | 给一个任务做选型表 |

## 读完能做什么

- 能解释一个 LLM 从文本到 token、到 logits、到生成的全过程
- 能解释预训练目标的选择，能判断数据质量、去重和污染
- 能判断“参数量/数据量/算力”是否匹配，不被营销数字带偏
- 能解释推理模型的“长 CoT + 可验证奖励 + test-time compute”，知道它和普通 SFT 的区别
- 能选一个开源模型，知道它的 tokenizer、上下文、许可和大致显存

## 相关分栏

- 训练工程（数据、微调、对齐、并行）：[Training](../training/index.md)
- 推理引擎、量化、服务化：[Inference](../inference/index.md)
- 应用层（RAG/Agent/MCP）：[Applications](../applications/index.md)
- GPU、集群、成本：[Infra](../infra/index.md)
- 论文与近期工作：[Papers](../papers/index.md)

## 参考

- Vaswani et al., *Attention Is All You Need*：<https://arxiv.org/abs/1706.03762>
- Brown et al., *Language Models are Few-Shot Learners*：<https://arxiv.org/abs/2005.14165>
- Kaplan et al., *Scaling Laws for Neural Language Models*：<https://arxiv.org/abs/2001.08361>
- Hoffmann et al., *Training Compute-Optimal Large Language Models*：<https://arxiv.org/abs/2203.15556>
- Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units*：<https://arxiv.org/abs/1508.07909>
- Kudo and Richardson, *SentencePiece*：<https://arxiv.org/abs/1808.06226>
- Zhao et al., *A Survey of Large Language Models*：<https://arxiv.org/abs/2303.18223>
- Gao et al., *The Pile*：<https://arxiv.org/abs/2101.00027>
- Lee et al., *Deduplicating Training Data Makes Language Models Better*：<https://arxiv.org/abs/2107.06499>
- Penedo et al., *FineWeb*：<https://arxiv.org/abs/2406.17557>
- Llama 3：<https://arxiv.org/abs/2407.21783>
- DeepSeek-R1：<https://arxiv.org/abs/2501.12948>
- s1: Simple test-time scaling：<https://arxiv.org/abs/2501.19393>
- Qwen3：<https://arxiv.org/abs/2505.09388>
- Kimi K2：<https://arxiv.org/abs/2507.20534>
- GLM-4.5：<https://arxiv.org/abs/2508.06471>
- LiveBench：<https://arxiv.org/abs/2406.19314>
- HarmBench：<https://arxiv.org/abs/2402.04249>
- Hugging Face LLM Course：<https://huggingface.co/learn/llm-course>
- Stanford CS336：<https://cs336.stanford.edu/>
- Raschka, *Build a Large Language Model (From Scratch)*：<https://github.com/rasbt/LLMs-from-scratch>

近期论文清单见[Papers](../papers/index.md)的“近期（2025–2026）”分区。
