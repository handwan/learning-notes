# MLP 与激活函数

线性模型只能画一条直线（或一个超平面）。遇到圆形边界、XOR 这类问题，直线怎么摆都不够。

这一篇讲两件事：

- 为什么加隐藏层还不够，必须加**非线性激活**
- 同一组数据换激活函数，结果差在哪

## 1. 为什么需要非线性

先看两层线性网络：

$$
h = XW_1+\mathbf{b}_1,
\qquad
z = hW_2+\mathbf{b}_2
$$

把 $h$ 代进去：

$$
z = (XW_1+\mathbf{b}_1)W_2+\mathbf{b}_2
= X(W_1W_2)+(\mathbf{b}_1W_2+\mathbf{b}_2)
$$

还是线性的。**叠多少层线性，等价于一层线性。**

所以隐藏层本身不带来表达能力；真正起作用的是层与层之间的非线性：

$$
h = \phi(XW_1+\mathbf{b}_1)
$$

$\phi$ 就是激活函数。

一个直观例子：

```text
异或：x1、x2 同号为一类，异号为另一类
```

一条直线切不开异或；加一个带非线性的隐藏层可以。

## 2. MLP 长什么样

两层的 MLP：

$$
h = \phi(XW_1+\mathbf{b}_1),
\qquad
z = hW_2+\mathbf{b}_2
$$

形状：

| 变量 | 形状 | 说明 |
|---|---|---|
| `X` | `(n, 2)` | n 个样本，2 个特征 |
| `W1` | `(2, 32)` | 输入到隐藏层 |
| `b1` | `(32,)` | 隐藏层偏置 |
| `h` | `(n, 32)` | 隐藏表示 |
| `W2` | `(32, 2)` | 隐藏层到输出 |
| `b2` | `(2,)` | 输出偏置 |
| `z` | `(n, 2)` | logits |

用 `nn.Sequential` 写：

??? note "代码：MLP 长什么样"
    ```python
    import torch.nn as nn

    model = nn.Sequential(
        nn.Linear(2, 32),
        nn.ReLU(),
        nn.Linear(32, 2),
    )
    ```

注意：`nn.Linear(2, 32)` 内部存的权重是 `(32, 2)`，计算的是 `X @ W.T + b`；和手写 `X @ W` 的方向相反。

输出层一般**不加激活**，直接把 logits 交给交叉熵：

```python
import torch.nn.functional as F

# 片段：X、y、model 已定义
loss = F.cross_entropy(model(X), y)
```

## 3. 激活函数怎么选

| 激活 | 公式 | 范围 | 特点 |
|---|---|---|---|
| ReLU | $\max(0,x)$ | $[0,\infty)$ | 简单、快；负半轴梯度为 0，可能“死单元” |
| LeakyReLU | $\max(\alpha x,x)$ | $(-\infty,\infty)$ | 负半轴留一个小斜率，缓解死单元 |
| GELU | $x\Phi(x)$ | 约 $(-0.17,\infty)$ | 平滑，Transformer 常用 |
| Tanh | $\tanh(x)$ | $(-1,1)$ | 零中心，饱和区梯度小 |
| Sigmoid | $\dfrac{1}{1+e^{-x}}$ | $(0,1)$ | 饱和明显；常用于门控、二分类输出 |
| SiLU / Swish | $x\sigma(x)$ | 约 $(-0.28,\infty)$ | 平滑，部分 LLM 使用 |

选择顺序：

1. **隐藏层默认 ReLU 或 GELU**
2. 训练不稳、死单元多，试 LeakyReLU / GELU / SiLU
3. 需要 bounded 表示或门控，用 Tanh / Sigmoid
4. **输出层不要用 ReLU**；多分类输出 logits 交给交叉熵（内部做 softmax），二分类输出 logit 交给 `BCEWithLogitsLoss`（内部做 sigmoid）

## 4. 同一组数据换激活

造一个圆形边界：到原点距离小于 1 的为正类。

??? note "代码：同一组数据换激活"
    ```python
    import torch

    torch.manual_seed(0)
    n = 600
    X = torch.randn(n, 2)
    y = ((X ** 2).sum(1) < 1.0).long()

    perm = torch.randperm(n)
    Xtr, ytr = X[perm][:450], y[perm][:450]
    Xte, yte = X[perm][450:], y[perm][450:]

    print("train balance", round(ytr.float().mean().item(), 4))
    print("test balance", round(yte.float().mean().item(), 4))
    ```

输出：

```text
train balance 0.4067
test balance 0.4133
```

训练和测试都用同一套 SGD 设置：隐藏层 32，学习率 0.1，300 个 epoch，全量 batch。

??? note "代码：同一组数据换激活"
    ```python
    import torch.nn as nn
    import torch.nn.functional as F

    def make_model(kind):
        if kind == "linear":
            return nn.Linear(2, 2)
        if kind == "linear2":
            return nn.Sequential(nn.Linear(2, 32), nn.Linear(32, 2))
        if kind == "relu":
            return nn.Sequential(nn.Linear(2, 32), nn.ReLU(), nn.Linear(32, 2))
        if kind == "leaky":
            return nn.Sequential(nn.Linear(2, 32), nn.LeakyReLU(0.1), nn.Linear(32, 2))
        if kind == "tanh":
            return nn.Sequential(nn.Linear(2, 32), nn.Tanh(), nn.Linear(32, 2))
        if kind == "sigmoid":
            return nn.Sequential(nn.Linear(2, 32), nn.Sigmoid(), nn.Linear(32, 2))
        if kind == "gelu":
            return nn.Sequential(nn.Linear(2, 32), nn.GELU(), nn.Linear(32, 2))
        raise ValueError(kind)

    def train(kind, epochs=300, lr=0.1):
        torch.manual_seed(1)
        model = make_model(kind)
        opt = torch.optim.SGD(model.parameters(), lr=lr)

        for _ in range(epochs):
            opt.zero_grad()
            loss = F.cross_entropy(model(Xtr), ytr)
            loss.backward()
            opt.step()

        with torch.no_grad():
            tr = (model(Xtr).argmax(1) == ytr).float().mean().item()
            te = (model(Xte).argmax(1) == yte).float().mean().item()

        return tr, te, loss.item()

    for kind in ["linear", "linear2", "relu", "leaky", "tanh", "sigmoid", "gelu"]:
        tr, te, loss = train(kind)
        print(f"{kind:8s} train {tr:.4f} test {te:.4f} loss {loss:.4f}")
    ```

输出：

```text
linear   train 0.5933 test 0.5867 loss 0.6755
linear2  train 0.5933 test 0.5867 loss 0.6755
relu     train 0.9800 test 0.9667 loss 0.1900
leaky    train 0.9844 test 0.9667 loss 0.1995
tanh     train 0.9600 test 0.9600 loss 0.3352
sigmoid  train 0.5933 test 0.5867 loss 0.6631
gelu     train 0.9867 test 0.9667 loss 0.1721
```

读法：

- `linear` 和 `linear2` 完全一样：两层线性还是线性，准确率停在多数类
- `relu`、`leaky`、`gelu` 都到 `0.9667`
- `tanh` 稍低，`0.9600`
- `sigmoid` 在这个学习率/步数下没学起来，停在多数类

`sigmoid` 不是不能用，是**饱和 + 学习率太小**。把学习率调到 `0.5`、训练 1000 轮，它也能到 `0.96`；但同样设置下，ReLU/GELU 更省事。

> 这不是“激活函数排行榜”。同一个激活，换学习率、初始化、宽度，结果都会变。

## 5. 常见坑

1. **两层线性中间不加激活**
   等价于一层线性，白加参数。

2. **输出层加了 ReLU**
   logits 被截断，负分数全变 0；多分类输出 logits 交给交叉熵，二分类输出 logit 交给 `BCEWithLogitsLoss`。

3. **把 softmax 当隐藏层激活**
   softmax 是输出归一化，不是隐藏层非线性；隐藏层用 ReLU/GELU/Tanh 等。

4. **交叉熵前先 softmax**
   `F.cross_entropy` 接收 logits；先 softmax 会重复归一化，数值也更差。

5. **ReLU 死单元**
   学习率太大、初始化不好时，一批神经元长期输出 0；换 LeakyReLU/GELU，或降学习率。

6. **Sigmoid/Tanh 饱和**
   输入绝对值大时梯度接近 0，深层网络学得慢；这不是“激活错了”，是要调初始化/归一化/学习率。

7. **隐藏层太窄**
   32 个单元已经能拟合这个圆；太窄会欠拟合，太宽小数据容易过拟合。

8. **输入没标准化**
   特征尺度差太大时，优化更困难；MLP 对尺度比树模型敏感。

9. **小数据硬上大 MLP**
   参数多、数据少，训练集很快到 1.0，测试集不动；加正则、降宽度、加数据。

10. **忘记固定种子**
    初始化、切分、batch 顺序都会变；复现实验先 `torch.manual_seed(...)`。

## 6. 要点回顾

1. **线性层叠线性层还是线性**；非线性来自激活函数
2. MLP = 线性层 + 激活 + 线性层；隐藏层负责表示，输出层给 logits
3. 隐藏层默认 ReLU / GELU；需要门控/有界表示再用 Tanh / Sigmoid
4. 输出层：多分类 logits + 交叉熵，二分类 logit + `BCEWithLogitsLoss`
5. `F.cross_entropy` 接收 logits，不要先 softmax
6. 同一组数据，`linear` 和 `linear2` 准确率一样，证明无激活无效
7. 激活函数没有绝对优劣；学习率、初始化、宽度都会改变结果

## 参考

- PyTorch, `nn.Linear`：<https://pytorch.org/docs/stable/generated/torch.nn.Linear.html>
- PyTorch, Non-linear Activations：<https://pytorch.org/docs/stable/nn.html#non-linear-activations-weighted-sum-nonlinearity>
- PyTorch, `cross_entropy`：<https://pytorch.org/docs/stable/generated/torch.nn.functional.cross_entropy.html>
- Goodfellow et al., *Deep Learning*，第 6 章：<https://www.deeplearningbook.org/>
- Zhang et al., *Dive into Deep Learning*，多层感知机：<https://d2l.ai/>
- Stanford CS231n：<https://cs231n.stanford.edu/>
