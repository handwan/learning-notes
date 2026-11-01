# DL Basics

从张量到 Transformer：神经网络怎么表示、怎么训练、为什么能工作。目标不是背公式，而是先跑通一个最小训练循环，再逐个替换零件。

## 前置

- 线代、概率、微积分、优化：[03-math](../../03-math/index.md)
- 经典 ML 概念：[ML Basics](../ml-basics/index.md)

## 学习路径

| # | 篇目 | 要解决的问题 | 实验 |
|---|---|---|---|
| 1 | [张量与自动微分](01-张量与自动微分.md) | 五属性、广播、view/reshape、stride；autograd 怎么记录计算图 | 标量函数手推梯度 vs autograd |
| 2 | [最小线性模型](02-最小线性模型.md) | 线性/softmax 回归；从零写训练循环（概念见 [ML 第 2 篇](../ml-basics/02-线性模型.md)） | 手写线性回归，和闭式解对比 |
| 3 | [MLP 与激活函数](03-MLP与激活函数.md) | 为什么需要非线性；激活函数怎么选 | 同一组数据换激活函数 |
| 4 | [损失函数与数值稳定](04-损失函数与数值稳定.md) | MSE/交叉熵；logits、log-sum-exp | 手写数值稳定的交叉熵 |
| 5 | [反向传播](05-反向传播.md) | 计算图、链式法则；手推 vs autograd | 手推 MLP 梯度，和 autograd 对拍 |
| 6 | [优化器与学习率](06-优化器与学习率.md) | SGD/Momentum/AdamW；batch、学习率、warmup | 在[第 2 篇](02-最小线性模型.md)的循环上换优化器 |
| 7 | [初始化、归一化与正则化](07-初始化、归一化与正则化.md) | Xavier/He；BN/LN/RMSNorm；dropout、weight decay | 深层网络加/不加归一化 |
| 8 | [CNN 与 RNN](08-CNN与RNN.md) | 卷积/池化、残差；循环/门控（LSTM/GRU）；归纳偏置 | 小 CNN / 小 RNN |
| 9 | [注意力与 Transformer](09-注意力与Transformer.md) | QKV、多头、位置编码、decoder-only | 手写单头注意力 |
| 10 | [综合实战：从零训练一个小网络](10-综合实战.md) | 数据划分/管线 → 训练 → 验证 → 保存 → 复现 | 端到端跑通 |
| 11 | [从零实现 Transformer](11-从零实现Transformer.md) | 多头拆/拼、正弦位置编码、pre-LN block、训练与生成 | 训练一个词级小模型 |

评估、泛化与正则化放在[ML Basics 第 3 篇](../ml-basics/03-评估、泛化与正则化.md)；先读这里的话，可以后面补。

## 读完能做什么

- 能从零写一个最小训练循环，并解释每一步在做什么
- 能解释一个神经网络从输入到 loss 的完整计算图
- 能定位训练不收敛的常见原因（学习率、初始化、归一化、梯度）
- 能读懂 Transformer 的结构图，并写出一个最小的 decoder-only 实现

## 相关分栏

- 数学推导：[03-math](../../03-math/index.md)
- 训练工程（并行、显存、checkpoint）：[Training](../training/index.md)
- LLM 结构与推理特性：[LLM](../llm/index.md)、[Inference](../inference/index.md)

## 参考

- Goodfellow et al., *Deep Learning*：<https://www.deeplearningbook.org/>
- Zhang et al., *Dive into Deep Learning*：<https://d2l.ai/>
- Stanford CS231n：<https://cs231n.stanford.edu/>
- Stanford CS224n：<https://web.stanford.edu/class/cs224n/>
- Karpathy, *Neural Networks: Zero to Hero*：<https://karpathy.ai/zero-to-hero.html>
- PyTorch Tutorials：<https://pytorch.org/tutorials/>
