# 注意力与 Transformer

CNN 有局部性，RNN 有顺序性；注意力换了一种先验：**每个位置都可以直接看其他位置**，权重由内容决定。

Transformer = 注意力 + 前馈网络 + 残差 + 归一化。它不是一个新损失，也不是一个新优化器，而是把“信息怎么流动”重新组织了一遍。

## 1. 注意力

### Q、K、V

把注意力想成一次检索：

- **Query**：我现在要找什么
- **Key**：每个位置能提供什么线索
- **Value**：每个位置真正要传出的内容

$$Q=XW_Q,\qquad K=XW_K,\qquad V=XW_V$$

### 缩放点积注意力

$$
\operatorname{Attn}(Q,K,V)
=\operatorname{softmax}
\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
$$

形状：

| 变量 | 形状 |
|---|---|
| `Q` | `(B, Tq, d_k)` |
| `K` | `(B, Tk, d_k)` |
| `V` | `(B, Tk, d_v)` |
| `scores` | `(B, Tq, Tk)` |
| `attn` | `(B, Tq, Tk)` |
| `out` | `(B, Tq, d_v)` |

`QKᵀ` 算出每对位置的匹配分数，softmax 归一化成权重，再对 `V` 加权求和。

### 为什么要除以 √d_k

点积的方差随维度增长。维度大时，分数绝对值很大，softmax 会变得很尖，梯度接近 0。

除以 $\sqrt{d_k}$ 把方差拉回可控范围。这是稳定训练的一部分，不是可选项。

### 手写一遍

??? note "代码：手写一遍"
    ```python
    import math
    import torch
    import torch.nn.functional as F

    torch.manual_seed(0)
    dtype = torch.float64
    B, T, d = 2, 6, 8

    Q = torch.randn(B, T, d, dtype=dtype)
    K = torch.randn(B, T, d, dtype=dtype)
    V = torch.randn(B, T, d, dtype=dtype)

    scores = Q @ K.transpose(-2, -1) / math.sqrt(d)
    attn = torch.softmax(scores, dim=-1)
    out = attn @ V

    ref = F.scaled_dot_product_attention(Q, K, V)

    print("max diff", (out - ref).abs().max().item())
    print("row sums", attn.sum(-1))

    mask = torch.triu(torch.ones(T, T, dtype=torch.bool), diagonal=1)
    c_scores = scores.masked_fill(mask, float("-inf"))
    c_attn = torch.softmax(c_scores, dim=-1)
    c_out = c_attn @ V
    c_ref = F.scaled_dot_product_attention(Q, K, V, is_causal=True)

    print("causal max diff", (c_out - c_ref).abs().max().item())
    print("causal row sums", c_attn.sum(-1))
    print("row0", c_attn[0, 0])
    print("row5", c_attn[0, 5])
    print("future max", c_attn[0].triu(1).max().item())
    ```

输出要点：

```text
max diff 4.440892098500626e-16
row sums 全 1
causal max diff 2.220446049250313e-16
row0 tensor([1., 0., 0., 0., 0., 0.])
row5 tensor([0.4097, 0.2379, 0.0695, 0.0335, 0.1528, 0.0966])
future max 0.0
```

读法：

- 手写注意力和 `F.scaled_dot_product_attention` 在 `float64` 下对到 `1e-16`
- 每一行权重和为 1
- `row0` 只能看第一个 token，所以权重是 `[1,0,0,0,0,0]`
- `row5` 可以看前 6 个 token
- 上三角是未来位置，权重全 0

### 因果 mask

解码器不能看未来。做法是在 softmax 之前把未来位置的分数设成 $-\infty$：

```python
# 接着上一段：scores 已定义，形状 (B, T, T)
mask = torch.triu(torch.ones(T, T, dtype=torch.bool), diagonal=1)
scores = scores.masked_fill(mask, float("-inf"))
attn = torch.softmax(scores, dim=-1)
```

顺序不能反：先 mask，再 softmax。mask 放在 softmax 后面，未来位置的概率已经被归一化进去了，再置零会导致行和不为 1。

## 2. 多头注意力

把 $d_{model}$ 拆成 $h$ 个头，每个头在低维子空间里做一次注意力：

$$
\operatorname{head}_i
=\operatorname{Attn}
\left(QW_i^Q,KW_i^K,VW_i^V\right)
$$

$$
\operatorname{MultiHead}(Q,K,V)
=\operatorname{Concat}(\operatorname{head}_1,\dots,\operatorname{head}_h)W^O
$$

形状：

| 变量 | 形状 |
|---|---|
| `Q/K/V` | `(B, T, d_model)` |
| 每个头的 `Q_i/K_i/V_i` | `(B, T, d_head)` |
| 每个头的输出 | `(B, T, d_head)` |
| concat | `(B, T, h*d_head)` |
| 最终输出 | `(B, T, d_model)` |

其中：

$$
d_{head}=\frac{d_{model}}{h}
$$

多头的意义：不同头可以关注不同关系，比如局部搭配、指代、位置模式。不是“头越多越好”，头数要和 $d_{model}$ 匹配。

PyTorch 里可以直接用：

```python
import torch.nn as nn

# 片段：x 已定义，形状 (B, T, d_model)
attn = nn.MultiheadAttention(embed_dim=64, num_heads=4, batch_first=True)
out, weights = attn(x, x, x)
```

`batch_first=True` 时输入是 `(B, T, d_model)`；默认是 `(T, B, d_model)`，很容易搞混。

## 3. 位置编码

注意力本身是**置换等变**的：把 token 顺序打乱，输出只是跟着打乱，模型不知道谁在前谁在后。

所以要把位置信息加进去。

### 正弦位置编码

$$
PE_{(pos,2i)}
=\sin\left(\frac{pos}{10000^{2i/d}}\right)
$$

$$
PE_{(pos,2i+1)}
=\cos\left(\frac{pos}{10000^{2i/d}}\right)
$$

- 不同频率的正弦/余弦
- 可以外推到比训练更长的序列（有限）
- 直接加到 token embedding 上

### 其他做法

| 方法 | 思路 | 常见场景 |
|---|---|---|
| 学习式绝对位置 | 每个位置一个可训练向量 | 早期 Transformer |
| 正弦绝对位置 | 固定频率 | 原始 Transformer |
| RoPE | 旋转 Q/K，编码相对位置 | LLaMA、Qwen 等 |
| ALiBi | 给注意力分数加距离偏置 | 长上下文 |

RoPE 不是加在 embedding 上，而是对 Q/K 做旋转；它让点积自然带相对位置信息。

## 4. Transformer block

一个 block 通常是：

```text
x = x + Attention(LN(x))
x = x + FFN(LN(x))
```

这叫 **pre-LN**：先归一化，再进子层，最后残差相加。

- 残差让梯度有短路
- LN 稳定每层输入
- FFN 提供非线性变换

FFN：

```text
Linear(d_model, 4*d_model) → GELU → Linear(4*d_model, d_model)
```

中间维度通常是 4 倍。参数量上，FFN 往往比注意力还多。

原始 Transformer 用的是 **post-LN**：

```text
x = LN(x + Attention(x))
```

post-LN 在深层容易不稳；pre-LN 更常见于大模型。

编码器/解码器：

- **Encoder**：双向自注意力，每个位置能看全序列
- **Decoder**：因果自注意力，只能看左边；encoder-decoder 还有 cross-attention
- **Decoder-only**：只有因果自注意力，LLM 主流结构

## 5. Decoder-only 与 LLM

一个 decoder-only 模型：

```text
token embedding + position
→ N × Transformer block
→ final LN
→ lm_head
→ vocab logits
```

训练目标：给定前 $t$ 个 token，预测第 $t+1$ 个。

- 因果 mask 保证不看未来
- 一次前向可以并行算整条序列的所有位置
- 损失还是交叉熵

推理时不能并行整条序列，只能一个一个生成。为了不重复算历史，用 **KV cache**：

- 每层缓存历史 token 的 K、V
- 新 token 只算自己的 Q、K、V
- 注意力只和新 Q 与历史 K/V 做计算

代价：

- 训练：注意力 $O(T^2d)$ 时间/显存
- 推理：KV cache 显存随序列长度线性增长
- 长上下文的主要瓶颈之一

## 6. 常见坑

1. **忘记除以 √d_k**
   分数过大，softmax 饱和，梯度变小。

2. **先 softmax 再 mask**
   未来位置已经被归一化进去，再置零会破坏行和；必须 mask 后再 softmax。

3. **mask 形状不对**
   要能广播到 `(B, Tq, Tk)`；常见错误是只 mask 了其中一部分。

4. **softmax 维度错**
   应该在 key 维（最后一维）归一化，不是 query 维。

5. **causal mask 泄漏**
   训练时忘了 mask，模型能看到未来 token，loss 会异常低。

6. **padding mask 和 causal mask 混了**
   变长序列要同时处理 padding 和因果；两者可以合并成一个布尔 mask。

7. **多头拆/拼错**
   `(B,T,d_model)` → `(B,h,T,d_head)` 要 transpose；拼回去再 transpose。

8. **位置编码漏了**
   没有位置信息，模型对顺序不敏感，效果会明显变差。

9. **`nn.MultiheadAttention` 的 `batch_first`**
   默认 `False`，输入是 `(T,B,d)`；不设会形状错。

10. **把 attention 权重当解释**
    权重高只说明模型用了这个位置，不说明因果；多头/多层叠加后更难解释。

11. **训练/推理模式混用**
    dropout 在训练时开、评估时关；KV cache 只在推理用。

12. **长上下文直接硬上**
    注意力是 $O(T^2)$；先算显存，再考虑 FlashAttention、分块、稀疏注意力。

## 7. 要点回顾

1. 注意力 = 用 Q/K 算权重，再对 V 加权求和
2. 缩放点积注意力要除以 $\sqrt{d_k}$，mask 要在 softmax 前
3. 多头把 $d_{model}$ 拆成多个子空间，最后 concat + 输出投影
4. 注意力本身不知道顺序，必须加位置编码（正弦、学习式、RoPE、ALiBi）
5. Transformer block = Attention + FFN + 残差 + LN
6. pre-LN 更稳，decoder-only 用因果自注意力
7. 训练可并行整条序列；推理靠 KV cache，显存随长度增长

完整实现（多头拆/拼、正弦位置编码、pre-LN block、训练循环、生成）见[第 11 篇](11-从零实现Transformer.md)。

## 参考

- Vaswani et al., *Attention Is All You Need*：<https://arxiv.org/abs/1706.03762>
- PyTorch, `scaled_dot_product_attention`：<https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html>
- PyTorch, `MultiheadAttention`：<https://pytorch.org/docs/stable/generated/torch.nn.MultiheadAttention.html>
- Su et al., *RoFormer*（RoPE）：<https://arxiv.org/abs/2104.09864>
- Press et al., *Train Short, Test Long*（ALiBi）：<https://arxiv.org/abs/2108.12409>
- Stanford CS224n：<https://web.stanford.edu/class/cs224n/>
- Zhang et al., *Dive into Deep Learning*，注意力与 Transformer：<https://d2l.ai/>
