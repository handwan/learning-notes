# Scaling laws

Scaling laws 想回答一个问题：**给定算力，模型该多大、数据该多少？**

它不是“模型越大越好”的口号，而是用经验曲线预测 loss 随参数量、数据量、算力的变化。Kaplan 2020 和 Chinchilla 2022 是两条最重要的分界线。

这篇讲：

- 参数量 / 数据量 / 算力的三条幂律
- Kaplan 和 Chinchilla 的结论差在哪
- `C ≈ 6ND` 怎么用来反推配置
- 为什么现代模型经常“超额训练”
- 推理成本怎么改变最优配置
- 一个用公式反推小模型配置的实验

## 1. 三条曲线

固定其他因素，loss 通常随规模呈幂律下降：

$$
L(N)\propto N^{-\alpha_N},
\qquad
L(D)\propto D^{-\alpha_D},
\qquad
L(C)\propto C^{-\alpha_C}
$$

- $N$：非 embedding 参数量
- $D$：训练 token 数
- $C$：训练算力（FLOPs）
- $\alpha$：拟合指数，通常在 0.05–0.1 量级，随数据/架构变化

更完整的拟合会写成：

$$
L(N,D)=E+\frac{A}{N^\alpha}+\frac{B}{D^\beta}
$$

- $E$：不可约 loss
- 第一项：模型容量不够
- 第二项：数据不够
- 指数和常数是拟合值，不是自然常数

## 2. Kaplan：优先堆模型

Kaplan et al. 2020 的结论大致是：

- loss 随参数量、数据量、算力都呈幂律
- 在当时的拟合里，**增大模型**比增大数据更划算
- 早期大模型因此倾向“参数很大、token 相对少”

这条路线催生了 GPT-3 这一类模型。但它有一个问题：如果数据量跟不上，模型会“吃不饱”。

## 3. Chinchilla：参数和数据一起涨

Hoffmann et al. 2022（Chinchilla）重新做了拟合，结论是：

- 固定训练算力时，参数量和数据量应该**大致等比例增长**
- 最优配置大约每 1 个参数配 **20 个 token**
- 很多早期大模型不是参数不够，而是训练 token 太少

经典对比：

| 模型 | 参数 | 训练 token | 结果 |
|---|---:|---:|---|
| Gopher | 280B | 300B | 按 Chinchilla 观点偏“欠训练” |
| Chinchilla | 70B | 1.4T | 同算力下 loss 更低 |

这不是说“70B 一定比 280B 强”，而是说：**同样的训练算力，参数和数据要匹配**。

## 4. 算力、参数、数据

训练一个 dense Transformer 的算力，粗略估计：

$$
C\approx 6ND
$$

- 前向约 $2ND$
- 反向约 $4ND$
- 合计约 $6ND$
- $N$ 用非 embedding 参数；$D$ 是训练 token 数

如果按 Chinchilla 的 $D=20N$：

$$
C\approx 6N\cdot 20N=120N^2
$$

反解：

$$
N_{\mathrm{opt}}\approx\sqrt{\frac{C}{120}},
\qquad
D_{\mathrm{opt}}\approx20N_{\mathrm{opt}}
$$

更一般地，若每参数配 $k$ 个 token：

$$
N_{\mathrm{opt}}\approx\sqrt{\frac{C}{6k}},
\qquad
D_{\mathrm{opt}}=kN_{\mathrm{opt}}
$$

## 5. 反推配置

用上面的公式，给定算力预算，反推参数和数据：

??? note "代码：反推配置"
    ```python
    def chinchilla_config(compute_flops, tokens_per_param=20):
        n = (compute_flops / (6 * tokens_per_param)) ** 0.5
        d = tokens_per_param * n
        return n, d

    for c in [1e18, 1e19, 1e20, 1e21, 1e22, 1e23, 1e24]:
        n, d = chinchilla_config(c)
        n_str = f"{n / 1e9:.2f}B" if n >= 1e9 else f"{n / 1e6:.1f}M"
        d_str = f"{d / 1e12:.2f}T" if d >= 1e12 else f"{d / 1e9:.2f}B"
        print(f"{c:.0e} N={n_str} D={d_str}")
    ```

输出：

```text
1e+18 N=91.3M D=1.83B
1e+19 N=288.7M D=5.77B
1e+20 N=912.9M D=18.26B
1e+21 N=2.89B D=57.74B
1e+22 N=9.13B D=182.57B
1e+23 N=28.87B D=577.35B
1e+24 N=91.29B D=1.83T
```

读法：

- `1e21` FLOPs 大约对应 2.9B 参数、57.7B token
- `1e22` 对应 9.1B 参数、182.6B token
- 算力每涨 10 倍，参数和数据都约涨 $\sqrt{10}\approx3.16$ 倍
- 这是 Chinchilla 的训练算力最优，不是“产品最优”

注意：`6ND` 是粗略估计，不含 attention 的二次项、通信、重算和低效实现；小模型 embedding 占比也高，实际配置要修正。

## 6. 为什么现代模型“超额训练”

Chinchilla 优化的是**训练算力**。真实产品还要看推理：

- 训练只花一次，推理要花很多次
- 小模型推理更便宜，KV cache 更小
- 小模型可以训练更多 token，把能力补回来
- 推理量越大，越值得“训练时多花一点，推理时省很多”

Llama 3 8B 训练了约 15T token，按 20 token/参数算是“严重超额训练”；但如果目标是大量部署，小模型 + 长训练可能比大模型更划算。

所以现代配置常见两种：

| 目标 | 倾向 |
|---|---|
| 训练算力最优 | 参数和数据按 Chinchilla 配 |
| 推理成本最优 | 更小模型、更多 token、更长训练 |
| 研究/验证 | 小模型、短训练、快速迭代 |

## 7. 实践顺序

给定预算，建议：

1. 先定训练算力 $C$ 和推理预算
2. 用 `N≈sqrt(C/(6k))` 估算参数规模
3. 用 `D=kN` 估算 token 数
4. 在小规模上跑 3–5 个配置，拟合自己的 loss 曲线
5. 检查数据量是否够、质量是否稳定
6. 再看下游任务和推理成本，不要只看训练 loss

不要直接拿 Chinchilla 的 20 当定律；它是 2022 年一组数据/架构上的拟合结果。

## 8. 常见坑

1. **只看参数量**
   参数、数据、算力是一组；280B/300B 可能不如 70B/1.4T。

2. **把 20 token/参数当定律**
   这是训练算力最优的经验值；推理密集场景可以远超。

3. **混用 total 和 active 参数**
   MoE 的计算按 active 参数，显存按 total 参数；`6ND` 要用对 N。

4. **忽略 embedding**
   小模型 embedding 占比高；`N` 通常指非 embedding 参数，实际总参数要另算。

5. **用 loss 直接预测能力**
   loss 平滑下降，具体能力可能突变、也可能不出现；要跑下游评测。

6. **跨 tokenizer/数据比较 loss**
   tokenizer、数据分布、loss 口径不同，loss 不可直接比。

7. **外推太远**
   拟合区间外的 scaling law 可能失效；架构/数据一变，指数也会变。

8. **忽略数据质量/重复**
   低质、重复数据会改变曲线；token 多不等于有效信息多。

9. **只看训练算力**
   推理成本、KV cache、延迟、部署规模都会改变最优配置。

10. **忽略实现效率**
    `6ND` 是理想 FLOPs；MFU（实际达到的 FLOPs / 硬件峰值 FLOPs）低、通信多、重算多，实际成本更高。

11. **拿 benchmark 调 scaling 配置**
    测试集被调过就不再干净；用验证集/小规模 ablation。

12. **把 MoE 当 dense 算**
    MoE 的 total 参数、active 参数、专家并行通信要分开算。

## 9. 要点回顾

1. Scaling laws 用幂律预测 loss 随参数、数据、算力的变化
2. Kaplan 早期偏向堆模型；Chinchilla 强调参数和数据等比例
3. Chinchilla 经验值约 20 token/参数；训练算力最优
4. `C≈6ND`；由 `D≈20N` 得 `N≈sqrt(C/120)`
5. 算力涨 10 倍，参数和数据各约涨 3.16 倍
6. 现代模型常超额训练，因为推理成本比训练更长期
7. 小模型 + 多 token 可能比大模型 + 少 token 更适合部署
8. loss 不能直接替代下游评测；scaling law 也有适用边界

## 参考

- Kaplan et al., *Scaling Laws for Neural Language Models*：<https://arxiv.org/abs/2001.08361>
- Hoffmann et al., *Training Compute-Optimal Large Language Models*（Chinchilla）：<https://arxiv.org/abs/2203.15556>
- Brown et al., *Language Models are Few-Shot Learners*（GPT-3）：<https://arxiv.org/abs/2005.14165>
- Llama Team, *The Llama 3 Herd of Models*：<https://arxiv.org/abs/2407.21783>
- Wei et al., *Emergent Abilities of Large Language Models*：<https://arxiv.org/abs/2206.07682>
- Besiroglu et al., *Chinchilla Scaling: A replication attempt*：<https://arxiv.org/abs/2404.10102>
