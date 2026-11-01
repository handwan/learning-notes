# CNN 与 RNN

MLP 把输入当成一个长向量，丢掉了结构信息：

- 图像里相邻像素有关系
- 序列里前后 token 有顺序

CNN 和 RNN 分别把这两种先验写进模型，这叫**归纳偏置**。

## 1. CNN

### 为什么卷积

全连接层处理 16×16 图像，要先拉成 256 维向量，参数多，而且不知道“相邻像素更相关”。

卷积做了两件事：

- **局部连接**：每个输出只看一小块输入
- **权重共享**：同一个卷积核扫过所有位置

结果是平移等变：图像里的物体移动几个像素，卷积特征也跟着移动；配合池化，近似得到平移不变。

二维卷积：

$$
y_{i,j,o}
=\sum_{c}\sum_{u,v}
W_{o,c,u,v}\,x_{i+u,j+v,c}+b_o
$$

`Conv2d` 的权重形状是：

```text
(out_channels, in_channels, kernel_h, kernel_w)
```

### 输出尺寸

$$
H_{\mathrm{out}}
=\left\lfloor
\frac{H_{\mathrm{in}}+2P-D(K-1)-1}{S}+1
\right\rfloor
$$

- $K$：卷积核大小
- $P$：padding
- $S$：stride
- $D$：dilation

宽高同理。记不住就记住“先加 padding，再减核，再除 stride”。

### 池化

- **MaxPool**：取窗口最大值，保留显著特征
- **AvgPool**：取平均，更平滑
- **Global Average Pooling**：整张特征图求平均，接分类头

池化降低分辨率、扩大感受野、减少计算量。但池化太早会丢细节。

典型块：

```text
Conv → BatchNorm → ReLU → Pool
```

### 残差连接

CNN 堆深了会退化：层数增加，训练误差反而变高。这不是过拟合，而是优化变难——梯度要穿过很多层，容易消失或爆炸。

ResNet 的做法是加一条短路：

$$
y=x+F(x)
$$

- $x$：原始输入，走 shortcut
- $F(x)$：两三层卷积学到的残差
- 输出是两者逐元素相加

反向时：

$$
\frac{\partial L}{\partial x}
=\frac{\partial L}{\partial y}
\left(I+\frac{\partial F}{\partial x}\right)
$$

括号里的 $I$ 是单位矩阵，对应短路带来的直接通路；一维情形就是 `1`。即使 $\partial F/\partial x$ 很小，梯度也不会完全断掉。

形状要对齐：

- 通道数、分辨率不变：shortcut 直接连（`nn.Identity`）
- 通道数或分辨率变了：用 1×1 卷积 + stride 把 shortcut 投到同一形状

??? note "代码：残差连接"
    ```python
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class ResidualBlock(nn.Module):
        def __init__(self, in_ch, out_ch, stride=1):
            super().__init__()
            self.conv1 = nn.Conv2d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
            self.bn1 = nn.BatchNorm2d(out_ch)
            self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False)
            self.bn2 = nn.BatchNorm2d(out_ch)

            self.shortcut = nn.Identity()
            if stride != 1 or in_ch != out_ch:
                self.shortcut = nn.Sequential(
                    nn.Conv2d(in_ch, out_ch, 1, stride=stride, bias=False),
                    nn.BatchNorm2d(out_ch),
                )

        def forward(self, x):
            out = F.relu(self.bn1(self.conv1(x)))
            out = self.bn2(self.conv2(out))
            return F.relu(out + self.shortcut(x))

    stem = ResidualBlock(3, 16)
    same = ResidualBlock(16, 16)
    down = ResidualBlock(16, 32, stride=2)

    x = torch.randn(2, 3, 32, 32)
    x = stem(x)
    x = same(x)
    x = down(x)

    print("out", x.shape)
    for name, block in [("stem", stem), ("same", same), ("down", down)]:
        print(name, sum(p.numel() for p in block.parameters()))
    ```

输出：

```text
out torch.Size([2, 32, 16, 16])
stem 2880
same 4672
down 14528
```

`stem` 把 3 通道映到 16 通道，所以 shortcut 也要 1×1 卷积；`same` 形状不变，shortcut 是恒等映射；`down` 用 stride=2 下采样，shortcut 同步下采样。

残差不是 CNN 专属。Transformer 的 `x = x + Attention(LN(x))` 是同一个模式：子层学残差，shortcut 保留原输入；见[第 9 篇](09-注意力与Transformer.md)。

### 小 CNN 实验

数据：16×16 灰度图，随机位置画一条竖线或横线；竖线是 0 类，横线是 1 类。加一点噪声。

??? note "代码：小 CNN 实验"
    ```python
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    torch.manual_seed(0)

    def make_images(n):
        X = torch.randn(n, 1, 16, 16) * 0.3
        y = torch.randint(0, 2, (n,))
        for i in range(n):
            if y[i] == 0:
                x = torch.randint(0, 16, (1,)).item()
                X[i, 0, :, x] += 1.0
            else:
                yy = torch.randint(0, 16, (1,)).item()
                X[i, 0, yy, :] += 1.0
        return X, y

    Xtr, ytr = make_images(400)
    Xte, yte = make_images(100)

    cnn = nn.Sequential(
        nn.Conv2d(1, 8, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Conv2d(8, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
        nn.Flatten(), nn.Linear(16 * 4 * 4, 2),
    )

    mlp = nn.Sequential(
        nn.Flatten(), nn.Linear(256, 64), nn.ReLU(), nn.Linear(64, 2),
    )

    def train_img(model, epochs=30, lr=0.01):
        torch.manual_seed(1)
        opt = torch.optim.Adam(model.parameters(), lr=lr)

        for _ in range(epochs):
            opt.zero_grad()
            loss = F.cross_entropy(model(Xtr), ytr)
            loss.backward()
            opt.step()

        model.eval()
        with torch.no_grad():
            final_loss = F.cross_entropy(model(Xtr), ytr).item()
            tr = (model(Xtr).argmax(1) == ytr).float().mean().item()
            te = (model(Xte).argmax(1) == yte).float().mean().item()

        return tr, te, final_loss

    for name, model in [("cnn", cnn), ("mlp", mlp)]:
        tr, te, loss = train_img(model)
        print(f"{name} params={sum(p.numel() for p in model.parameters())} "
              f"train={tr:.4f} test={te:.4f} loss={loss:.4f}")
    ```

输出：

```text
cnn params=1762 train=1.0000 test=0.9900 loss=0.0093
mlp params=16578 train=1.0000 test=0.9900 loss=0.0000
```

读法：

- 两个模型都到 `0.99`，这个任务太简单，分不出高下
- CNN 只用约 **1/9** 的参数
- 参数效率来自局部连接和权重共享，不是“CNN 一定更准”

## 2. RNN

### 序列建模

RNN 每读一个 token，就更新隐藏状态：

$$
h_t=\tanh\left(x_tW_{xh}+h_{t-1}W_{hh}+b_h\right)
$$

- $x_t$：当前输入
- $h_{t-1}$：上一步的记忆
- $h_t$：当前隐藏状态
- 同一个 $W_{hh}$ 在每个时间步复用

输出可以取每个时间步，也可以只取最后一步做分类。

### BPTT 与梯度问题

训练时把整个序列展开，反向传播沿时间反传，叫 **BPTT**（backpropagation through time）。

序列一长：

- 连乘很多个 Jacobian，梯度可能指数级消失
- 也可能指数级爆炸

常见处理：

- 梯度裁剪
- 截断 BPTT（只反传最近 k 步）
- 用门控结构 LSTM / GRU

### LSTM

LSTM 在普通 RNN 上加了一条 cell state $c_t$ 和三个门。门用 sigmoid，输出在 0 到 1 之间，控制信息通过多少。

$$
f_t=\sigma\left(W_fx_t+U_fh_{t-1}+b_f\right)
$$

$$
i_t=\sigma\left(W_ix_t+U_ih_{t-1}+b_i\right)
$$

$$
o_t=\sigma\left(W_ox_t+U_oh_{t-1}+b_o\right)
$$

$$
\tilde{c}_t=\tanh\left(W_cx_t+U_ch_{t-1}+b_c\right)
$$

$$
c_t=f_t\odot c_{t-1}+i_t\odot\tilde{c}_t
$$

$$
h_t=o_t\odot\tanh(c_t)
$$

- $f_t$：forget gate，旧 cell state 保留多少
- $i_t$：input gate，新候选写多少
- $\tilde{c}_t$：候选记忆
- $o_t$：output gate，cell state 输出多少
- $c_t$：cell state，长期记忆
- $h_t$：当前隐藏状态

$c_t$ 的更新是加法，梯度可以沿 $c$ 这条路径回传；但 $f_t$ 仍然乘在旧状态上，所以不是无损的高速公路。LSTM 缓解梯度消失，不是彻底消除。

手写一遍，和 PyTorch 对拍：

??? note "代码：LSTM"
    ```python
    import torch
    import torch.nn as nn

    torch.manual_seed(0)
    dtype = torch.float64
    B, D, H = 3, 5, 4

    cell = nn.LSTMCell(D, H).to(dtype)
    x = torch.randn(B, D, dtype=dtype)
    h = torch.randn(B, H, dtype=dtype)
    c = torch.randn(B, H, dtype=dtype)

    # PyTorch 的 gate 顺序是 i, f, g, o
    gates = x @ cell.weight_ih.T + cell.bias_ih + h @ cell.weight_hh.T + cell.bias_hh
    i, f, g, o = gates.chunk(4, dim=1)
    i, f, o = torch.sigmoid(i), torch.sigmoid(f), torch.sigmoid(o)
    g = torch.tanh(g)

    c_new = f * c + i * g
    h_new = o * torch.tanh(c_new)

    h_ref, c_ref = cell(x, (h, c))
    print("h diff", (h_new - h_ref).abs().max().item())
    print("c diff", (c_new - c_ref).abs().max().item())
    ```

输出：

```text
h diff 0.0
c diff 0.0
```

注意 gate 顺序：很多教材按 $f,i,o$ 讲，PyTorch 的 `weight_ih` / `weight_hh` 按 `i,f,g,o` 排列。手写时直接按教材顺序切片，结果会对不上。

参数量：每个门有 $D\times H$ 的输入权重、$H\times H$ 的循环权重和两个 bias，四个门合计约 $4(DH+H^2+2H)$。以 `nn.LSTM(4,32)` 为例，`D=4,H=32`，合计 4864 个参数。

### GRU

GRU 简化成两个门：

$$
z_t=\sigma(W_zx_t+U_zh_{t-1}),
\qquad
r_t=\sigma(W_rx_t+U_rh_{t-1})
$$

$$
\tilde{h}_t=\tanh\left(W_hx_t+U_h(r_t\odot h_{t-1})\right)
$$

$$
h_t=(1-z_t)\odot h_{t-1}+z_t\odot\tilde{h}_t
$$

- $z_t$：更新门，控制旧状态保留多少
- $r_t$：重置门，控制旧状态用多少
- 参数比 LSTM 少，很多任务上效果接近

### PyTorch 形状

```python
import torch.nn as nn

# 片段：x 已定义，形状 (B, T, 4)
rnn = nn.RNN(input_size=4, hidden_size=32, batch_first=True)
out, h = rnn(x)
```

- `batch_first=True`：输入 `(B, T, F)`
- `out`：每个时间步的隐藏状态，`(B, T, H)`
- `h`：最后一步，`(num_layers, B, H)`
- `h[-1]` 取最后一层，得到 `(B, H)`

`nn.LSTM` 的 `h` 是 `(h_n, c_n)` 元组，取 `h_n`。

### 小 RNN 实验

任务：序列长度 100，第一个 token 是 1 就判为正类，否则负类。后面的 token 是干扰项。

这考的是“记住 100 步前的东西”。

??? note "代码：小 RNN 实验"
    ```python
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    torch.manual_seed(0)
    n, T, V = 3000, 100, 4
    tok = torch.randint(0, V, (n, T))
    y = (tok[:, 0] == 1).long()
    X = F.one_hot(tok, V).float()

    ntr = 2400
    Xtr, ytr = X[:ntr], y[:ntr]
    Xte, yte = X[ntr:], y[ntr:]

    class SeqClf(nn.Module):
        def __init__(self, kind):
            super().__init__()
            if kind == "rnn":
                self.rnn = nn.RNN(V, 32, batch_first=True)
            else:
                self.rnn = nn.GRU(V, 32, batch_first=True)
            self.fc = nn.Linear(32, 2)

        def forward(self, x):
            out, h = self.rnn(x)
            return self.fc(h[-1])

    def train_seq(kind, epochs=30, lr=0.01, bs=64):
        torch.manual_seed(1)
        model = SeqClf(kind)
        opt = torch.optim.Adam(model.parameters(), lr=lr)

        for _ in range(epochs):
            perm = torch.randperm(ntr)
            for i in range(0, ntr, bs):
                idx = perm[i:i + bs]
                opt.zero_grad()
                loss = F.cross_entropy(model(Xtr[idx]), ytr[idx])
                loss.backward()
                opt.step()

        model.eval()
        with torch.no_grad():
            final_loss = F.cross_entropy(model(Xtr), ytr).item()
            tr = (model(Xtr).argmax(1) == ytr).float().mean().item()
            te = (model(Xte).argmax(1) == yte).float().mean().item()

        return tr, te, final_loss

    for kind in ["rnn", "gru"]:
        tr, te, loss = train_seq(kind)
        model = SeqClf(kind)
        print(f"{kind} params={sum(p.numel() for p in model.parameters())} "
              f"train={tr:.4f} test={te:.4f} loss={loss:.4f}")
    ```

输出：

```text
rnn params=1282 train=0.7487 test=0.7500 loss=0.5898
gru params=3714 train=1.0000 test=1.0000 loss=0.0010
```

读法：

- 多数类比例约 0.75；vanilla RNN 刚好停在多数类
- GRU 能跨 100 步记住第一个 token，测试集到 1.0
- 这个任务是为了放大长依赖；不代表所有任务 RNN 都不行

## 3. 归纳偏置对比

| 模型 | 局部性 | 顺序 | 参数共享 | 长依赖 |
|---|---|---|---|---|
| MLP | 无 | 无 | 无 | 弱 |
| CNN | 强 | 无 | 空间共享 | 靠深度堆 |
| RNN | 无 | 强 | 时间共享 | 弱，门控缓解 |
| Transformer | 全局 | 位置编码 | 全连接共享 | 注意力直接连 |

选择：

- 图像/网格：CNN
- 序列/时序：RNN、GRU、LSTM，或 Transformer
- 长依赖、可并行：Transformer
- 数据少、结构先验强：CNN/RNN 往往比 Transformer 更省数据

## 4. 常见坑

1. **CNN 输入形状搞错**
   PyTorch 默认 `(N, C, H, W)`；单通道也要 `(N, 1, H, W)`。

2. **Flatten 前维度算错**
   16×16 经过两次 pool 是 4×4；通道 16，所以 `16*4*4=256`。改网络要重算。

3. **padding/stride 公式用错**
   输出尺寸为负说明核比输入还大，或者 padding 不够。

4. **池化太早/太激进**
   小图像上连续 pool 会丢细节；必要时用 stride 卷积代替。

5. **RNN 的 `batch_first` 不一致**
   输入 `(B,T,F)`、输出 `(B,T,H)`；忘了会变成 `(T,B,F)`。

6. **LSTM 的 `h` 当张量用**
   `nn.LSTM` 返回 `(h_n, c_n)` 元组；GRU/RNN 返回张量。

7. **batch 之间忘了 detach 隐藏状态**
   连续 batch 传 `h` 时，要把 `h.detach()`，否则计算图越接越长。

8. **BPTT 太长**
   序列几千步一次性反传，显存和梯度都吃不消；用截断 BPTT。

9. **不做梯度裁剪**
   RNN 容易梯度爆炸；`clip_grad_norm_` 放在 `backward()` 后、`step()` 前。

10. **变长序列不 pack**
    padding 位置参与 loss/RNN，结果会被带偏；用 `pack_padded_sequence` 或 mask。

11. **CNN/RNN 直接套在错误的数据结构上**
    表格数据优先树/GBDT；图像用 CNN；序列用 RNN/Transformer。

12. **以为参数少一定更好**
    CNN 参数少但感受野有限；RNN 参数共享但难并行；看任务。

13. **残差分支形状不匹配**
    通道数或分辨率变了，shortcut 要用 1×1 卷积 + stride 对齐，否则不能相加。

14. **LSTM 门顺序按错**
    手写时按 PyTorch 的 `i, f, g, o` 切，不要按论文里的 `f, i, o` 直接拼。

## 5. 要点回顾

1. CNN 的归纳偏置是局部连接 + 权重共享 + 平移等变
2. 卷积输出尺寸由 kernel、padding、stride、dilation 决定
3. 池化降分辨率、扩感受野，但太早会丢细节
4. 残差连接 $y=x+F(x)$ 给梯度一条短路，深 CNN 更容易训练
5. RNN 用隐藏状态传递序列信息，BPTT 反传
6. LSTM 用 forget/input/output 三个门和 cell state 控制记忆
7. 长序列容易梯度消失/爆炸；LSTM/GRU 用门控缓解
8. `batch_first=True` 时输入 `(B,T,F)`，RNN 输出 `h` 是 `(layers,B,H)`
9. 结构先验要和数据类型匹配，不是越新越好

## 参考

- PyTorch, Conv2d：<https://pytorch.org/docs/stable/generated/torch.nn.Conv2d.html>
- PyTorch, RNN / LSTM / GRU：<https://pytorch.org/docs/stable/nn.html#recurrent-layers>
- Stanford CS231n, CNN：<https://cs231n.github.io/convolutional-networks/>
- He et al., *Deep Residual Learning for Image Recognition*（ResNet）：<https://arxiv.org/abs/1512.03385>
- Cho et al., *Learning Phrase Representations using RNN Encoder–Decoder*（GRU）：<https://arxiv.org/abs/1406.1078>
- Hochreiter and Schmidhuber, *Long Short-Term Memory*：<https://doi.org/10.1162/neco.1997.9.8.1735>
- Zhang et al., *Dive into Deep Learning*：<https://d2l.ai/>
