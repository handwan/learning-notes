# LLM 架构

DL 第 9、11 篇讲了 Transformer block 和最小 decoder-only 实现；这一篇从 LLM 的视角看架构：

- 哪些开关决定参数量和显存
- MHA / MQA / GQA 怎么选
- RoPE 怎么编码位置
- SwiGLU、RMSNorm、pre-LN 各自改了什么
- MoE 的“总参数”和“激活参数”
- 一个 1B / 8B 模型的参数、权重、KV cache 怎么算

## 1. Decoder-only 骨架

LLM 主流结构：

```text
token embedding
→ N × [LN → Attention → 残差, LN → FFN → 残差]
→ final LN
→ lm_head
→ vocab logits
```

和[第 11 篇](../dl-basics/11-从零实现Transformer.md)一样，只是规模变大、组件换成现代版本：

| 组件 | 常见选择 |
|---|---|
| 归一化 | pre-LN + RMSNorm |
| 位置 | RoPE（少数用 ALiBi/学习式） |
| 注意力 | causal self-attention；GQA/MQA |
| FFN | SwiGLU |
| bias | 多数线性层不要 bias |
| 输出 | lm_head；embedding 可 tied/untied |

架构差异大多不是“新结构”，而是这些开关的组合。

## 2. MHA、MQA、GQA

设：

- $d$：hidden size
- $h$：query head 数
- $d_{head}=d/h$
- $h_{kv}$：key/value head 数

| 变体 | $h_{kv}$ | K/V 投影参数（每层） | 每 token KV cache（每层） |
|---|---:|---:|---:|
| MHA | $h$ | $2d\,h\,d_{head}$ | $2h d_{head}$ |
| MQA | 1 | $2d d_{head}$ | $2d_{head}$ |
| GQA | $g$（$1<g<h$） | $2d\,g\,d_{head}$ | $2g d_{head}$ |

GQA 把 query heads 分组，每组共享一对 K/V。要求 $h$ 能被 $h_{kv}$ 整除，每组有 $h/h_{kv}$ 个 query heads。

例子：Llama 3 8B 是 32 个 query heads、8 个 KV heads，即 4 个 query heads 共享一组 K/V。

为什么用 GQA：

- MHA 的 KV cache 随 $h$ 增长，长上下文很贵
- MQA 把 KV cache 压到最小，但质量/稳定性可能下降
- GQA 在两者之间，通常接近 MHA 的质量，KV cache 小几倍

这也是为什么“参数量相同”的两个模型，长上下文推理成本可能差很多。

## 3. RoPE

RoPE 不学位置 embedding，而是把 Q/K 的每对维度旋转一个角度：

$$
\theta_i=10000^{-2i/d_{head}}
$$

$$
\begin{aligned}
\operatorname{RoPE}(x,m)_i
&=x_i\cos(m\theta_i)-x_{i+d_{head}/2}\sin(m\theta_i),\\
\operatorname{RoPE}(x,m)_{i+d_{head}/2}
&=x_{i+d_{head}/2}\cos(m\theta_i)+x_i\sin(m\theta_i).
\end{aligned}
$$

其中 $i=0,\dots,d_{head}/2-1$；这里采用前后半段配对，和代码里的 `rotate_half` 一致。相邻维度配对也是合法的 RoPE 变体，但公式和代码要统一。

位置 $m$ 的 query 和位置 $n$ 的 key 做点积时，结果只依赖 $m-n$，所以它编码的是相对位置。

要点：

- 只作用于 Q/K，不作用于 V
- 不增加参数
- $d_{head}$ 必须是偶数
- base 可以调大（Llama 3 用 500000）来扩上下文
- NTK/YaRN 等是上下文扩展的变体，不是换掉 RoPE

实现：

??? note "代码：RoPE"
    ```python
    import torch

    def rotate_half(x):
        x1, x2 = x.chunk(2, dim=-1)
        return torch.cat([-x2, x1], dim=-1)

    def apply_rope(q, k, base=10000.0):
        B, H, T, D = q.shape
        assert D % 2 == 0
        inv_freq = 1.0 / (base ** (torch.arange(0, D, 2, device=q.device).float() / D))
        pos = torch.arange(T, device=q.device).float()
        freqs = torch.outer(pos, inv_freq)
        emb = torch.cat([freqs, freqs], dim=-1)
        cos = emb.cos()[None, None, :, :]
        sin = emb.sin()[None, None, :, :]
        return q * cos + rotate_half(q) * sin, k * cos + rotate_half(k) * sin

    torch.manual_seed(0)
    q = torch.randn(2, 4, 6, 8)
    k = torch.randn(2, 4, 6, 8)
    q2, k2 = apply_rope(q, k)
    print("rope shape", tuple(q2.shape), "norm", torch.allclose(q2.norm(dim=-1), q.norm(dim=-1), atol=1e-5))
    ```

输出：

```text
rope shape (2, 4, 6, 8) norm True
```

这里按每个 head 的 `d_head` 算频率；生产实现还要处理 base、dtype、缓存 cos/sin 和位置偏移。

## 4. FFN：SwiGLU 与 d_ff

标准两层 FFN：

$$
\operatorname{FFN}(x)=W_2\,\sigma(W_1x)
$$

参数约 $2d\,d_{ff}$。

SwiGLU：

$$
\operatorname{FFN}(x)=W_2\left(\operatorname{SiLU}(W_gx)\odot W_ux\right)
$$

三个矩阵，参数约 $3d\,d_{ff}$。为了和标准 4 倍 FFN 的参数接近，$d_{ff}$ 常取 $8d/3$ 左右；实际模型会在 2.7d–4d 之间调。

LLM 常见组合：

- pre-LN + RMSNorm
- SwiGLU
- 线性层无 bias
- embedding 和 lm_head 可共享（tied），也可分开（untied）

## 5. 参数账

一个 decoder-only 模型的主要参数：

- token embedding：$Vd$
- 每层 attention：$2d^2+2d\,h_{kv}d_{head}$（Q、O 各 $d^2$，K/V 各 $d\,h_{kv}d_{head}$）
- 每层 FFN：$3d\,d_{ff}$（SwiGLU）
- 每层 norm：约 $2d$
- lm_head：$Vd$，tied 时省略

把公式写成代码：

??? note "代码：参数与 KV cache"
    ```python
    def count_params(d_model, n_layers, n_heads, n_kv_heads, d_ff, vocab, tied=True):
        d_head = d_model // n_heads
        attn = 2 * d_model * d_model + 2 * d_model * n_kv_heads * d_head
        ffn = 3 * d_model * d_ff
        block = attn + ffn + 2 * d_model
        emb = vocab * d_model
        head = 0 if tied else vocab * d_model
        return n_layers * block + emb + head

    def kv_bytes(n_layers, n_kv_heads, d_head, seq_len, batch=1, bytes_per=2):
        return 2 * n_layers * batch * seq_len * n_kv_heads * d_head * bytes_per

    configs = {
        "toy-1B": dict(d_model=2048, n_layers=16, n_heads=16, n_kv_heads=4,
                       d_ff=8192, vocab=32000, tied=True),
        "llama3-8B": dict(d_model=4096, n_layers=32, n_heads=32, n_kv_heads=8,
                          d_ff=14336, vocab=128256, tied=False),
    }

    for name, c in configs.items():
        n = count_params(**c)
        print(name, "params", round(n / 1e9, 3), "B", "bf16", round(n * 2 / 1e9, 2), "GB")
        d_head = c["d_model"] // c["n_heads"]
        for T in [8192, 32768, 131072]:
            kv = kv_bytes(c["n_layers"], c["n_kv_heads"], d_head, T)
            print(" T", T, "KV", round(kv / 1024**2, 1), "MiB")
    ```

输出：

```text
toy-1B params 1.039 B bf16 2.08 GB
 T 8192 KV 256.0 MiB
 T 32768 KV 1024.0 MiB
 T 131072 KV 4096.0 MiB
llama3-8B params 8.03 B bf16 16.06 GB
 T 8192 KV 1024.0 MiB
 T 32768 KV 4096.0 MiB
 T 131072 KV 16384.0 MiB
```

读法：

- `toy-1B` 的 1.039B 包含 embedding；tied 时没有单独的 lm_head
- `llama3-8B` 按 32 层、4096 hidden、32 heads、8 KV heads、d_ff 14336、128256 词表算，约 8.03B
- bf16 权重约 2 字节/参数；1B 约 2GB，8B 约 16GB
- KV cache 是 batch=1、bf16、只算 K/V 的量；实际还要加上 allocator 开销和碎片

这张表也说明：**参数量不是显存量的全部**。8B 模型在 128k 上下文、batch=1 时，KV cache 就有 16GiB。

## 6. MoE

MoE 把 FFN 换成多个专家 + 一个 router：

```text
x → router → top-k experts → 加权求和
```

- 总参数：所有专家都存
- 激活参数：每个 token 只走 top-k 个专家
- 计算量按激活参数算，显存按总参数算

参数账：

$$
\text{total}
=\text{attention}+\text{shared expert}
+E\cdot\text{expert FFN}+\text{router}
$$

$$
\text{active}
=\text{attention}+\text{shared expert}
+k\cdot\text{expert FFN}+\text{router}
$$

DeepSeek-V3 是典型例子：总参数 671B，激活参数约 37B。它的显存占用像 671B，单 token 计算更像 37B。

MoE 的工程问题：

- 负载均衡：路由总把 token 发给少数专家，其他专家饿死
- capacity factor：每个专家最多收多少 token；超了会丢 token
- 专家并行：专家分布在不同卡上，需要 all-to-all 通信
- 小 batch 下通信开销可能吃掉计算收益
- 路由不稳定会影响训练

所以 MoE 不是“免费变大”，而是用显存和通信换计算。

## 7. 显存账

推理显存大致是：

$$
\text{memory}
\approx
\text{weights}
+\text{KV cache}
+\text{activations}
+\text{框架/碎片开销}
$$

权重：

| 精度 | 每参数字节 | 1B | 8B | 70B |
|---|---:|---:|---:|---:|
| int8 | 1 | 1GB | 8GB | 70GB |
| bf16/fp16 | 2 | 2GB | 16GB | 140GB |
| fp32 | 4 | 4GB | 32GB | 280GB |

训练还要存梯度、优化器状态和 master weights。混合精度 Adam 粗算约 16 字节/参数：

- 权重 2 + 梯度 2 + fp32 master 4 + Adam m 4 + Adam v 4

再加激活、临时 buffer 和通信 buffer。8B 模型全量训练远不止 16GB。

KV cache：

$$
\text{KV bytes}
=2\cdot L\cdot B\cdot T\cdot h_{kv}\cdot d_{head}\cdot\text{bytes}
$$

- 与层数、batch、序列长度、KV heads 线性相关
- GQA 减少 $h_{kv}$，直接减少 KV cache
- 量化权重不一定自动量化 KV cache；KV cache 常单独量化
- PagedAttention 之类的技术减少碎片，但不改变公式的数量级

训练时注意力分数是 $O(BhT^2)$；推理时 KV cache 是 $O(BLTh_{kv}d_{head})$。长上下文下，KV cache 往往比权重更先成为瓶颈。

## 8. 常见配置对比

| 模型 | 结构 | 关键点 |
|---|---|---|
| toy-1B | 16 层、d=2048、16 heads、4 KV heads | 本文参数账示例 |
| Llama 3 8B | 32 层、d=4096、32 heads、8 KV heads、d_ff=14336、128k 词表 | GQA、RoPE、SwiGLU、RMSNorm |
| DeepSeek-V3 | MoE，671B total / 37B active | 总参数和激活参数分离 |

看模型卡时，至少确认：

- 总参数 / 激活参数
- 层数、hidden size、heads、KV heads
- 词表大小、上下文长度
- 权重精度、KV cache 精度
- 是否 tied embedding
- MoE 的专家数、top-k、共享专家

## 9. 常见坑

1. **把总参数当激活参数**
   MoE 的 671B total 不等于每 token 算 671B；要看 active。

2. **只算权重，不算 KV cache**
   8B 模型 128k 上下文、batch=1 的 KV cache 可以到 16GiB。

3. **KV cache 公式漏了 batch/bytes**
   只看序列长度会低估；batch 和精度都要乘。

4. **GQA 的 heads 不整除**
   $h$ 必须能被 $h_{kv}$ 整除；否则分组不完整。

5. **RoPE 的 $d_{head}$ 是奇数**
   旋转需要成对维度；实现里要 assert。

6. **FFN 参数按 2 个矩阵算**
   SwiGLU 是 3 个矩阵；按 2 个算会少三分之一。

7. **忘记 embedding / lm_head**
   词表大时这部分很可观；tied/untied 差一个 $Vd$。

8. **把参数量当显存**
   还有 KV cache、激活、优化器状态、通信 buffer 和碎片。

9. **MoE 只看计算量**
   显存按总参数、通信按专家并行；小 batch 可能不划算。

10. **量化权重以为 KV cache 也变了**
    权重和 KV cache 是两套精度策略。

11. **上下文翻倍，以为显存只翻倍**
    KV cache 线性增长，注意力计算是二次的；两者不同。

12. **忽略 tensor parallel 的整除约束**
    heads、FFN、词表都要能切；切不干净会 padding 或报错。

## 10. 要点回顾

1. LLM = decoder-only + pre-LN/RMSNorm + RoPE + GQA/MQA + SwiGLU
2. MHA/MQA/GQA 的核心差异是 KV heads 数，直接决定 KV cache
3. RoPE 旋转 Q/K，编码相对位置，不增加参数
4. SwiGLU 是 3 个矩阵；d_ff 常取 2.7d–4d
5. 参数账：embedding + N × (attention + FFN + norm) + lm_head
6. MoE 的 total 参数和 active 参数要分开看
7. 显存 = 权重 + KV cache + 激活 + 开销；训练还要优化器状态
8. 长上下文先看 KV cache，不只看参数量

## 参考

- Vaswani et al., *Attention Is All You Need*：<https://arxiv.org/abs/1706.03762>
- Su et al., *RoFormer*（RoPE）：<https://arxiv.org/abs/2104.09864>
- Shazeer, *Fast Transformer Decoding*（MQA）：<https://arxiv.org/abs/1911.02150>
- Ainslie et al., *GQA*：<https://arxiv.org/abs/2305.13245>
- Llama Team, *The Llama 3 Herd of Models*：<https://arxiv.org/abs/2407.21783>
- Fedus et al., *Switch Transformers*：<https://arxiv.org/abs/2101.03961>
- Dai et al., *DeepSeekMoE*：<https://arxiv.org/abs/2401.06066>
- DeepSeek-AI, *DeepSeek-V3 Technical Report*：<https://arxiv.org/abs/2412.19437>
- Dao et al., *FlashAttention*：<https://arxiv.org/abs/2205.14135>
- Kwon et al., *PagedAttention / vLLM*：<https://arxiv.org/abs/2309.06180>
