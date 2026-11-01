# 从零实现 Transformer

第 9 篇讲了 Transformer 的结构和公式；这一篇把它写成一个能训练的小模型。

目标不是复现 GPT，而是把下面这些零件亲手拼一遍：

- 多头注意力的拆和拼
- 正弦位置编码
- pre-LN 的 Transformer block
- decoder-only 的 next-token 训练
- 采样生成

这里实现的是 decoder-only 版本；encoder-decoder 版本多一个双向编码器，解码器再加一层 cross-attention。

语料是合成的英文句子，词级 tokenizer，模型约 10 万参数，CPU 几秒跑完。

下面按数据 → 位置编码 → 注意力 → block → 模型 → 训练 → 生成的顺序写；把代码块按顺序拼起来就是一个可运行脚本（标了“片段”的除外）。

通用的数据切分、训练循环、评估和保存见[第 10 篇](10-综合实战.md)；注意力、位置编码和 mask 的直觉见[第 9 篇](09-注意力与Transformer.md)。这篇只保留实现和差异。

## 1. 任务与数据

先造一个很小的语言模型任务：句子由主语、动词、宾语组成，只有 20 个词。模型读前面的词，预测下一个词。

??? note "代码：任务与数据"
    ```python
    import math
    import random
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    random.seed(0)
    torch.manual_seed(0)

    subjects = ["the cat", "a dog", "the bird", "a fox", "the robot", "a student"]
    verbs = ["sees", "likes", "finds", "follows", "helps"]
    objects = ["the mat", "a book", "the ball", "a tree", "the door"]

    sentences = []
    for s in subjects:
        for v in verbs:
            for o in objects:
                sentences.append(f"{s} {v} {o} .")

    for _ in range(300):
        s1, v1, o1 = random.choice(subjects), random.choice(verbs), random.choice(objects)
        s2, v2, o2 = random.choice(subjects), random.choice(verbs), random.choice(objects)
        sentences.append(f"{s1} {v1} {o1} and {s2} {v2} {o2} .")

    random.shuffle(sentences)
    n_val = len(sentences) // 5
    val_sentences = sentences[:n_val]
    train_sentences = sentences[n_val:]

    train_text = " ".join(train_sentences)
    val_text = " ".join(val_sentences)

    words = sorted(set((train_text + " " + val_text).split()))
    stoi = {w: i for i, w in enumerate(words)}
    itos = {i: w for w, i in stoi.items()}

    train_data = torch.tensor([stoi[w] for w in train_text.split()], dtype=torch.long)
    val_data = torch.tensor([stoi[w] for w in val_text.split()], dtype=torch.long)

    block_size = 32
    batch_size = 32

    def get_batch(split):
        d = train_data if split == "train" else val_data
        ix = torch.randint(len(d) - block_size - 1, (batch_size,))
        x = torch.stack([d[i:i + block_size] for i in ix])
        y = torch.stack([d[i + 1:i + block_size + 1] for i in ix])
        return x, y

    print("sentences", len(train_sentences), len(val_sentences))
    print("tokens", len(train_data), len(val_data), "vocab", len(words))
    print("sample sentence", train_sentences[0])
    ```

输出：

```text
sentences 360 90
tokens 3636 864 vocab 20
sample sentence a fox sees a book .
```

语料 450 句，按句子切 360/90；`block_size=32` 是 32 个连续词，`y` 右移一位。词表 20，真实 LLM 用 BPE / SentencePiece，这里用词级 tokenizer 把篇幅留给结构。随机猜的交叉熵约 $\ln 20\approx 3.0$。

## 2. 正弦位置编码

注意力本身不知道顺序。位置编码把位置信息加到 token embedding 上。公式和直觉见[第 9 篇](09-注意力与Transformer.md)，这里只写实现：

$$
PE_{(pos,2i)}
=\sin\left(\frac{pos}{10000^{2i/d}}\right),
\qquad
PE_{(pos,2i+1)}
=\cos\left(\frac{pos}{10000^{2i/d}}\right)
$$

??? note "代码：正弦位置编码"
    ```python
    class SinusoidalPositionalEncoding(nn.Module):
        def __init__(self, d_model, max_len=512):
            super().__init__()
            assert d_model % 2 == 0
            pe = torch.zeros(max_len, d_model)
            pos = torch.arange(max_len).unsqueeze(1).float()
            div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
            pe[:, 0::2] = torch.sin(pos * div)
            pe[:, 1::2] = torch.cos(pos * div)
            self.register_buffer("pe", pe.unsqueeze(0))

        def forward(self, x):
            assert x.size(1) <= self.pe.size(1)
            return x + self.pe[:, :x.size(1)]
    ```

检查形状和数值：

```python
pe = SinusoidalPositionalEncoding(64, max_len=32)
print(tuple(pe.pe.shape))
print(pe.pe[0, 0, :4])
print(pe.pe[0, 1, :4])
```

输出：

```text
(1, 32, 64)
tensor([0., 1., 0., 1.])
tensor([0.8415, 0.5403, 0.6816, 0.7318])
```

几个点：

- `pe` 是 `(1, max_len, d_model)` 的 buffer，跟着 `.to(device)` 移动，不算参数
- 位置编码直接相加，维度不变；`d_model` 要偶数，`max_len` 要覆盖 `block_size`

## 3. 多头自注意力

多头注意力的形状变化：

| 步骤 | 形状 |
|---|---|
| 输入 `x` | `(B, T, C)` |
| `qkv` 投影 | `(B, T, 3C)` |
| 拆成 `q/k/v` | 三个 `(B, T, C)` |
| reshape | `(B, T, h, d_head)` |
| transpose | `(B, h, T, d_head)` |
| `scores` | `(B, h, T, T)` |
| `attn` | `(B, h, T, T)` |
| 加权 `v` | `(B, h, T, d_head)` |
| 拼回 | `(B, T, C)` |

其中 $d_{head}=C/h$。

??? note "代码：多头自注意力"
    ```python
    class MultiHeadSelfAttention(nn.Module):
        def __init__(self, d_model, n_heads, dropout=0.1):
            super().__init__()
            assert d_model % n_heads == 0
            self.n_heads = n_heads
            self.d_head = d_model // n_heads
            self.qkv = nn.Linear(d_model, 3 * d_model, bias=False)
            self.out = nn.Linear(d_model, d_model, bias=False)
            self.dropout = nn.Dropout(dropout)

        def forward(self, x):
            B, T, C = x.shape
            q, k, v = self.qkv(x).split(C, dim=2)

            q = q.view(B, T, self.n_heads, self.d_head).transpose(1, 2)
            k = k.view(B, T, self.n_heads, self.d_head).transpose(1, 2)
            v = v.view(B, T, self.n_heads, self.d_head).transpose(1, 2)

            scores = q @ k.transpose(-2, -1) / math.sqrt(self.d_head)
            mask = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x.device), diagonal=1)
            scores = scores.masked_fill(mask, float("-inf"))
            attn = F.softmax(scores, dim=-1)

            out = self.dropout(attn) @ v
            out = out.transpose(1, 2).contiguous().view(B, T, C)
            return self.out(out)
    ```

拆和拼的关键：

- `qkv(x)` 一次算 Q/K/V，`split(C, dim=2)` 拆成三个 `(B, T, C)`
- `view` 成 `(B, T, h, d_head)`，`transpose(1, 2)` 成 `(B, h, T, d_head)`
- `scores` 是 `(B, h, T, T)`；mask 在 softmax 前
- 拼回先 `transpose(1, 2)`，再 `contiguous().view(B, T, C)`，最后过输出投影

因果 mask 用上三角：

```python
# 片段：scores 形状 (B, h, T, T)
mask = torch.triu(torch.ones(T, T, dtype=torch.bool), diagonal=1)
scores = scores.masked_fill(mask, float("-inf"))
```

`diagonal=1` 屏蔽严格上三角；mask 在 softmax 前，保证位置 `t` 只看 `0..t`。这里没有 padding mask，因为样本固定长度；变长 batch 要把 padding 和 causal 合并成一个 mask。融合实现见[第 9 篇](09-注意力与Transformer.md)。

## 4. FFN 与 Block

每个 block 有两个子层：

```text
x = x + Attention(LN(x))
x = x + FFN(LN(x))
```

这是 pre-LN：先归一化，再进子层，最后残差相加。

??? note "代码：FFN 与 Block"
    ```python
    class FeedForward(nn.Module):
        def __init__(self, d_model, dropout=0.1):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(d_model, 4 * d_model),
                nn.GELU(),
                nn.Linear(4 * d_model, d_model),
                nn.Dropout(dropout),
            )

        def forward(self, x):
            return self.net(x)


    class Block(nn.Module):
        def __init__(self, d_model, n_heads, dropout=0.1):
            super().__init__()
            self.ln1 = nn.LayerNorm(d_model)
            self.attn = MultiHeadSelfAttention(d_model, n_heads, dropout)
            self.ln2 = nn.LayerNorm(d_model)
            self.ffn = FeedForward(d_model, dropout)

        def forward(self, x):
            x = x + self.attn(self.ln1(x))
            x = x + self.ffn(self.ln2(x))
            return x
    ```

- FFN 先升到 `4 * d_model` 再降回来，中间用 GELU；原始 Transformer 用 ReLU
- 残差保持形状；LN 对每个 token 的特征维归一化；dropout 放在子层内部
- pre-LN 比 post-LN 稳；区别见[第 9 篇](09-注意力与Transformer.md)

`d_model=64` 时，一个 block 49728 个参数；两个 block 99456 个。

## 5. 模型

把 embedding、位置编码、block、输出层拼起来：

??? note "代码：模型"
    ```python
    class TinyGPT(nn.Module):
        def __init__(self, vocab_size, d_model=64, n_heads=4, n_layers=2, block_size=32, dropout=0.1):
            super().__init__()
            self.block_size = block_size
            self.tok_emb = nn.Embedding(vocab_size, d_model)
            self.pos_emb = SinusoidalPositionalEncoding(d_model, max_len=block_size)
            self.drop = nn.Dropout(dropout)
            self.blocks = nn.ModuleList([Block(d_model, n_heads, dropout) for _ in range(n_layers)])
            self.ln_f = nn.LayerNorm(d_model)
            self.lm_head = nn.Linear(d_model, vocab_size, bias=False)

        def forward(self, idx, targets=None):
            B, T = idx.shape
            x = self.drop(self.pos_emb(self.tok_emb(idx)))
            for block in self.blocks:
                x = block(x)
            logits = self.lm_head(self.ln_f(x))
            loss = None
            if targets is not None:
                loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
            return logits, loss
    ```

- `idx` 形状 `(B, T)`，值是词表 ID
- `tok_emb` 输出 `(B, T, d_model)`
- 位置编码直接加在 embedding 上
- 过 `n_layers` 个 block，形状一直是 `(B, T, d_model)`
- 最后 `ln_f` + `lm_head`，输出 `(B, T, vocab_size)`
- 有 `targets` 时算交叉熵：logits 拉成 `(B*T, V)`，targets 拉成 `(B*T,)`

`tok_emb.weight` 和 `lm_head.weight` 的形状都是 `(V, d)`，所以可以直接共享；这里保持独立，方便看清参数。

## 6. 训练

固定用 CPU，保证输出可复现；有 GPU 时把 `device` 改成 `cuda`，数值会略有差异。

??? note "代码：训练"
    ```python
    device = torch.device("cpu")
    torch.manual_seed(0)
    model = TinyGPT(len(words), block_size=block_size).to(device)

    print("device", device)
    print("pe", tuple(model.pos_emb.pe.shape))
    print("params", sum(p.numel() for p in model.parameters()))

    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)

    @torch.no_grad()
    def estimate_loss(iters=10):
        model.eval()
        out = {}
        for split in ["train", "val"]:
            losses = torch.zeros(iters)
            for i in range(iters):
                xb, yb = get_batch(split)
                xb, yb = xb.to(device), yb.to(device)
                _, loss = model(xb, yb)
                losses[i] = loss.item()
            out[split] = losses.mean().item()
        model.train()
        return out

    for step in range(1, 301):
        xb, yb = get_batch("train")
        xb, yb = xb.to(device), yb.to(device)

        _, loss = model(xb, yb)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

        if step == 1 or step % 100 == 0:
            stats = estimate_loss()
            print(step, round(loss.item(), 4), round(stats["train"], 4), round(stats["val"], 4))
    ```

输出：

```text
device cpu
pe (1, 32, 64)
params 102144
1 3.0419 2.8919 2.9053
100 1.1788 1.1674 1.1791
200 0.9774 0.9381 0.9531
300 0.9182 0.9137 0.9465
```

每列是步数、当前 batch loss、train/val 平均 loss。初始约 `3.04`，300 步后验证 loss 到 `0.95` 左右；loss 不会到 0，因为同一个前缀后面可能接多个合法词。

`estimate_loss` 会切到 `eval()`，算完再切回 `train()`；`clip_grad_norm_` 放在 `backward()` 后、`step()` 前。这个规模不需要 warmup，真实训练常用 warmup + cosine/linear decay，见[第 6 篇](06-优化器与学习率.md)。

## 7. 生成

训练好的模型一次预测一个词，把新词拼回输入，再预测下一个：

??? note "代码：生成"
    ```python
    @torch.no_grad()
    def generate(model, idx, max_new_tokens, temperature=1.0, top_k=None):
        was_training = model.training
        model.eval()
        for _ in range(max_new_tokens):
            logits, _ = model(idx[:, -model.block_size:])
            logits = logits[:, -1, :] / temperature

            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float("-inf")

            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, next_id], dim=1)

        if was_training:
            model.train()
        return idx

    start = torch.tensor([[stoi["the"]]], dtype=torch.long, device=device)
    out = generate(model, start, max_new_tokens=16, temperature=0.8, top_k=10)
    print("generated:")
    print(" ".join(itos[i] for i in out[0].tolist()))
    ```

输出：

```text
generated:
the cat likes a tree . the robot sees the ball and a student sees the ball
```

- 输入裁到 `block_size`；`logits[:, -1, :]` 只取最后一个位置的预测
- `temperature` / `top_k` 控制采样；想要确定性输出可以改成 `argmax`
- `generate` 临时切到 `eval()`；这里没有 KV cache，16 个 token 直接重算，真实推理见[第 9 篇](09-注意力与Transformer.md)
- 模型没有 EOS，固定生成 16 个新词；打印结果包含起始词 `the`，所以看起来是 17 个 token

## 8. 验证

最后检查输出形状和因果性：

??? note "代码：验证"
    ```python
    model.eval()
    xb, yb = get_batch("train")
    xb, yb = xb.to(device), yb.to(device)
    with torch.no_grad():
        logits, loss = model(xb, yb)
    print("logits", tuple(logits.shape), "loss", round(loss.item(), 4))

    x = torch.randint(0, len(words), (2, 12), device=device)
    x2 = x.clone()
    x2[:, 6:] = (x[:, 6:] + 1) % len(words)
    with torch.no_grad():
        y1, _ = model(x)
        y2, _ = model(x2)
    print("causal max diff", (y1[:, :6] - y2[:, :6]).abs().max().item())
    ```

输出：

```text
logits (32, 32, 20) loss 0.9171
causal max diff 0.0
```

- `logits` 是 `(B, T, vocab_size)`，这里是 `(32, 32, 20)`
- 把第 6 个位置之后的 token 全改掉，前 6 个位置的 logits 完全不变，说明 causal mask 生效
- 如果 `causal max diff` 不是 0，先查 mask 是不是漏了、是不是放在 softmax 后面
- 这个检查必须在 `eval()` 下做；训练模式有 dropout，随机性会污染结果

| 检查 | 结果 |
|---|---|
| 参数量 | `102144` |
| 初始 loss | `3.0419` |
| 300 步后验证 loss | `0.9465` |
| 输出形状 | `(32, 32, 20)` |
| 因果泄漏 | `0.0` |
| 生成样例 | 语法正确的短句 |

## 9. 常见坑

1. **causal mask 漏了或放在 softmax 后**
   模型能看到未来，或者行和不为 1；mask 必须在 softmax 前。原理见[第 9 篇](09-注意力与Transformer.md)。

2. **多头 reshape / transpose 错**
   `(B, T, h, d_head)` 和 `(B, h, T, d_head)` 差一次 transpose；转回时忘了 `contiguous()`，`view` 会报错。

3. **位置编码长度不够**
   `max_len` 小于 `block_size`，或者生成时没有裁输入；`assert` 会直接失败。

4. **忘记 `model.eval()`**
   dropout 还开着，生成和因果检查都会带随机性。

5. **词表和 checkpoint 不一致**
   保存模型时把 `stoi` / `itos` 一起存；否则 ID 和词的映射变了，输出全是乱的。

6. **CPU/GPU 混用**
   模型和数据要在同一 device；加载 checkpoint 用 `map_location`，见[第 10 篇](10-综合实战.md)。

## 10. 要点回顾

1. decoder-only = token embedding + 位置编码 + N × (LN → Attention → 残差，LN → FFN → 残差) + final LN + lm_head
2. 多头：QKV 投影 → 拆头 → 缩放点积 → 拼头 → 输出投影
3. causal mask 在 softmax 前，保证每个位置只看左边
4. 正弦位置编码是固定 buffer，不占参数；RoPE 等是替代方案
5. 训练目标是 next-token 交叉熵；logits `(B,T,V)`，targets `(B,T)`
6. 生成逐 token 采样，temperature / top-k 控制分布；KV cache 是推理优化
7. 小语料上 train/val 都降，loss 不会到 0；改未来 token、过去 logits 不变，说明 mask 正确

## 参考

- Vaswani et al., *Attention Is All You Need*：<https://arxiv.org/abs/1706.03762>
- Karpathy, nanoGPT：<https://github.com/karpathy/nanoGPT>
- PyTorch, Transformer 教程：<https://pytorch.org/tutorials/beginner/transformer_tutorial.html>
- Harvard, *The Annotated Transformer*：<https://nlp.seas.harvard.edu/annotated-transformer/>
- Zhang et al., *Dive into Deep Learning*：<https://d2l.ai/>
- [第 9 篇：注意力与 Transformer](09-注意力与Transformer.md)
