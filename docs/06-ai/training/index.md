# Training

把训练跑起来、跑大：数据、微调、对齐、推理训练、并行与显存、混合精度、checkpoint。集群、存储、网络、GPU 在[Infra](../infra/index.md)；这里讲训练方法与训练特有工程，不重复[DL Basics](../dl-basics/index.md)的机制。

## 前置

- 反向传播、优化器、归一化：[DL Basics](../dl-basics/index.md)
- Transformer 结构与 LLM 训练目标：[LLM](../llm/index.md)

## 学习路径

| # | 篇目 | 要解决的问题 | 实验 |
|---|---|---|---|
| 1 | [数据管道](01-数据管道.md) | tokenize、packing、shuffle、去重、dataloader（数据配比/质量见 LLM 第 4 篇） | 测吞吐与样本顺序 |
| 2 | [微调：全参数微调 vs LoRA/QLoRA](02-微调.md) | rank/alpha、目标模块、合并；显存/效果权衡（概念见 LLM 第 7 篇） | 7B QLoRA 显存账（8GB 示例）+ merge 校验 |
| 3 | [对齐训练](03-对齐训练.md) | SFT → RM → PPO/DPO；数据与失败模式（概念见 LLM 第 7 篇） | DPO 小数据实验 |
| 4 | [推理训练：RLVR 与长 CoT](04-推理训练.md) | 可验证奖励、数据构造、长度控制（概念见 LLM 第 8 篇） | 小模型 RLVR 实验 |
| 5 | [分布式并行](05-分布式并行.md) | DP/TP/PP/ZeRO；通信量、显存账 | 单卡模拟 / 梯度累积与显存账 |
| 6 | [混合精度与显存](06-混合精度与显存.md) | FP16/BF16/FP8；loss scaling；activation checkpointing | 同一模型换精度，量显存 |
| 7 | [Checkpoint 与可复现](07-Checkpoint与可复现.md) | 分片、optimizer state、数据状态、种子 | 断点恢复一次训练 |

## 读完能做什么

- 能准备一份可训练的 tokenized 数据集，并解释 packing/shuffle 的影响
- 能以 8GB 级显卡为例规划一次 LoRA/QLoRA 微调，并解释显存花在哪
- 能判断 OOM 是 batch、序列长度、优化器状态还是激活
- 能解释 RLVR 和 SFT/DPO 的区别，知道推理训练的数据和奖励怎么设计
- 能设计一个可恢复、可复现的小训练任务

## 相关分栏

- 训练机制（反向传播、优化器、归一化）：[DL Basics](../dl-basics/index.md)
- LLM 结构与对齐概念：[LLM](../llm/index.md)
- 推理与部署：[Inference](../inference/index.md)
- GPU、集群、存储、网络：[Infra](../infra/index.md)

## 参考

- Rajbhandari et al., *ZeRO*：<https://arxiv.org/abs/1910.02054>
- Shoeybi et al., *Megatron-LM*：<https://arxiv.org/abs/1909.08053>
- Micikevicius et al., *Mixed Precision Training*：<https://arxiv.org/abs/1710.03740>
- Hu et al., *LoRA*：<https://arxiv.org/abs/2106.09685>
- Dettmers et al., *QLoRA*：<https://arxiv.org/abs/2305.14314>
- Rafailov et al., *DPO*：<https://arxiv.org/abs/2305.18290>
- DeepSeek-R1：<https://arxiv.org/abs/2501.12948>
- PyTorch FSDP：<https://pytorch.org/docs/stable/fsdp.html>
- DeepSpeed：<https://www.deepspeed.ai/>
- Megatron-LM：<https://github.com/NVIDIA/Megatron-LM>
- Llama 3 训练配方：<https://arxiv.org/abs/2407.21783>
