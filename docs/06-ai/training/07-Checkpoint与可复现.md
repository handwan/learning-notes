# Checkpoint 与可复现

训练跑几个小时、几天，checkpoint 不是“存个权重”：

- 崩了能不能恢复？
- 恢复后优化器、学习率、数据顺序、RNG 是否一致？
- 多卡/分片怎么存、怎么重分片？
- 存到哪、写多快、保留几份？
- 怎么证明“同一次实验”可复现？

这篇讲 checkpoint 的内容、分片、原子写、恢复、复现和实验。存储层级/带宽/写入成本见 [Infra 第 3 篇](../infra/03-存储与数据.md)；分布式并行见[分布式并行](05-分布式并行.md)；这里讲训练状态本身。

## 1. Checkpoint 里有什么

| 内容 | 为什么 | 缺失后果 |
|---|---|---|
| 模型权重 | 恢复参数 | 只能推理，不能续训 |
| 优化器状态（Adam m/v、step） | 恢复更新方向/动量 | loss 抖动、收敛变差 |
| FP32 master weights | 混合精度更新 | 精度/稳定性下降 |
| LR scheduler | 恢复学习率 | 学习率错，训练漂 |
| step/epoch | 恢复位置 | 重复/跳过数据 |
| 数据状态（shard/sample/sampler/buffer） | 恢复数据顺序 | 重复/漏样本 |
| RNG（Python/NumPy/torch/CUDA） | dropout/增强/采样 | 结果对不上 |
| AMP GradScaler | 恢复 loss scaling | 重新 warmup/NaN |
| 并行元数据（DP/TP/PP/ZeRO） | 恢复切分/world size | 加载失败/错位 |
| tokenizer/config/代码版本 | 复现输入/结构 | 行为不一致 |
| EMA/额外状态 | 恢复辅助模型 | 评测/导出不对 |

只存权重 = **推理 checkpoint**，不是训练 checkpoint。

## 2. 格式与分片

常见格式：

- `state_dict` + `torch.save`：最通用；pickle，加载不可信文件有安全风险
- `safetensors`：权重安全/快，但 optimizer/RNG 等元数据要另外存
- 分片 checkpoint：按 rank/tensor 切文件，配 metadata/index
- PyTorch Distributed Checkpoint（DCP）：支持分片/重分片
- FSDP `state_dict`：full/local 两种；大模型用 local/sharded

分片要记录：

- world size、DP/TP/PP/ZeRO 切分
- 每个 shard 的 rank/tensor 范围
- dtype、shape、optimizer step
- 版本/配置/tokenizer

恢复时：

- 同 world size/拓扑最稳
- 换卡数/换并行策略要 resharding；DCP/FSDP 支持，手写 shard 要自己映射
- TP/PP 的切分变了，权重/优化器状态也要重排

写入：

- 先写临时目录/临时对象，完成后再原子 rename/更新 manifest
- 不要原地覆盖唯一 checkpoint；写一半失败会损坏
- 分片写要 fsync/flush，再写完成标记
- 异步写：先拷到 CPU/后台线程，但会占存储带宽
- 校验 checksum/大小/可加载性

存储：

- 本地 NVMe：快，但节点故障会丢
- 并行文件系统：训练热数据/checkpoint 常用
- 对象存储：便宜/持久，但延迟/请求费/egress 要算
- 具体取舍见 [Infra 第 3 篇](../infra/03-存储与数据.md)

## 3. 恢复

加载顺序：

1. 模型权重
2. 优化器状态（含 master/step）
3. LR scheduler
4. AMP GradScaler
5. step/epoch
6. 数据状态/sampler
7. RNG
8. 并行/配置校验

注意：

- checkpoint 要在干净边界保存：optimizer step + scheduler step 之后，记录 step
- 恢复从 `step+1` 继续，别重复消费这一步
- 保存 RNG 要在这一 step 所有随机消费之后；恢复在下一步之前
- DataLoader 的 worker seed、sampler epoch、shuffle buffer 都要恢复
- 多卡要恢复 rank 的 shard；换 world size 要 resharding
- 跨设备加载用 `torch.load(..., map_location="cpu")`，再按需搬到目标设备；避免一上来就占 GPU 显存
- 加载后做 sanity check：loss、lr、step、输出 shape、optimizer state
- 缺 key/多 key 要显式报错，不要静默跳过

## 4. 可复现

完全复现需要固定：

- 代码版本/依赖版本
- 数据版本、tokenizer、chat template
- 模型结构/配置
- seed：Python、NumPy、torch、CUDA
- DataLoader worker seed/sampler
- batch/seq/梯度累积
- 精度/AMP/FP8 设置
- 并行策略/世界大小/拓扑
- CUDA/cuDNN/NCCL/驱动/GPU 型号

确定性：

- `torch.use_deterministic_algorithms(True)` 强制确定性算子
- `torch.backends.cudnn.benchmark=False`、`deterministic=True`
- 需要时设 `CUBLAS_WORKSPACE_CONFIG=:4096:8`
- 有些算子没有确定性实现，会报错或变慢

难点：

- 浮点加法不满足结合律；不同 world size/拓扑的 all-reduce 顺序不同，结果可能有小差异
- AMP/FP8 的舍入/缩放会放大差异
- 异步/多 worker 的数据顺序要显式控制
- 不同 GPU/驱动/cuDNN 版本不保证 bitwise 一致

所以：

- “同配置、同种子、同硬件”可以追求 bitwise
- 换硬件/换并行策略，通常只能追求统计复现（loss/指标在容差内）
- 报告结果要写清 seed、环境、并行配置

## 5. 实验：断点恢复一次训练

一个小 MLP + dropout + 随机 mini-batch：

- 连续跑 8 步，记录最终 loss/权重
- 跑 4 步，保存 model/optimizer/scheduler/step/RNG
- 新模型加载后继续 5–8 步
- 对比“恢复 RNG”和“不恢复 RNG”的权重差异

??? note "代码：断点恢复与 RNG"
    ```python
    import os
    import tempfile
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    torch.manual_seed(0)
    N, B, D = 64, 8, 4
    X = torch.randn(N, D)
    y = torch.randn(N, 1)

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(D, 16), nn.ReLU(), nn.Dropout(0.1), nn.Linear(16, 1)
            )
        def forward(self, x):
            return self.net(x)

    def make():
        model = Net()
        opt = torch.optim.Adam(model.parameters(), lr=1e-3)
        sched = torch.optim.lr_scheduler.StepLR(opt, step_size=3, gamma=0.5)
        return model, opt, sched

    def steps(model, opt, sched, start, end):
        out = []
        for step in range(start, end + 1):
            idx = torch.randint(0, N, (B,))
            xb, yb = X[idx], y[idx]
            opt.zero_grad()
            loss = F.mse_loss(model(xb), yb)
            loss.backward()
            opt.step()
            sched.step()
            out.append(loss.item())
        return out

    torch.manual_seed(0)
    m1, o1, s1 = make()
    m1.train()
    loss_full = steps(m1, o1, s1, 1, 8)
    full = {k: v.detach().clone() for k, v in m1.state_dict().items()}

    torch.manual_seed(0)
    m2, o2, s2 = make()
    m2.train()
    steps(m2, o2, s2, 1, 4)
    ckpt = {
        "step": 4,
        "model": m2.state_dict(),
        "optimizer": o2.state_dict(),
        "scheduler": s2.state_dict(),
        "rng": torch.get_rng_state(),
    }

    fd, path = tempfile.mkstemp(suffix=".pt")
    os.close(fd)
    torch.save(ckpt, path)
    loaded = torch.load(path, weights_only=False)

    m3, o3, s3 = make()
    m3.load_state_dict(loaded["model"])
    o3.load_state_dict(loaded["optimizer"])
    s3.load_state_dict(loaded["scheduler"])
    torch.set_rng_state(loaded["rng"])
    m3.train()
    loss_resumed = steps(m3, o3, s3, 5, 8)

    m4, o4, s4 = make()
    m4.load_state_dict(loaded["model"])
    o4.load_state_dict(loaded["optimizer"])
    s4.load_state_dict(loaded["scheduler"])
    m4.train()
    steps(m4, o4, s4, 5, 8)

    print("uninterrupted last loss", f"{loss_full[-1]:.8f}")
    print("resumed last loss      ", f"{loss_resumed[-1]:.8f}")
    print("loss diff", abs(loss_full[-1] - loss_resumed[-1]))
    print("with rng weight diff", max((full[k] - m3.state_dict()[k]).abs().max().item() for k in full))
    print("without rng weight diff", max((full[k] - m4.state_dict()[k]).abs().max().item() for k in full))
    print("checkpoint bytes", os.path.getsize(path))
    os.unlink(path)
    ```

输出：

```text
uninterrupted last loss 0.66210037
resumed last loss       0.66210037
loss diff 0.0
with rng weight diff 0.0
without rng weight diff 0.0010695606470108032
checkpoint bytes 12620
```

读法：

- 恢复 model/optimizer/scheduler/RNG 后，loss 和权重与不中断训练完全一致
- 不恢复 RNG，dropout/数据顺序变了，权重差约 1e-3
- checkpoint 很小（12,620 bytes），因为模型很小；7B 训练 checkpoint 约 112GB（7.2B 约 115GB）
- 这是单进程 CPU；多卡/FP8/不同拓扑不保证 bitwise

## 6. 策略与成本

频率：

- 按时间/step；故障成本高就密一点
- 异步写要和训练重叠；但会占存储带宽
- 太密：训练被 I/O 拖慢；太疏：故障丢进度
- 7B/70B checkpoint 大小和写入时间见 [Infra 第 3 篇](../infra/03-存储与数据.md)

保留：

- 最近 N 个 + 关键里程碑
- 最佳/最终/可回滚版本分开
- 定期做恢复演练；能写不等于能读回
- checksum/版本/manifest
- checkpoint 不是备份：还要考虑副本/异地/对象存储

成本：

- 7B 训练 checkpoint 约 112GB；7.2B 约 115GB；70B 约 1.1TB（12–16 bytes/param）
- 按 1 小时一次、保留 5 份算容量和写入带宽
- 对象存储请求/egress/跨区复制也要算

## 7. 常见坑

1. **只存模型权重**
   没有 optimizer/scheduler，恢复后 loss 会抖。

2. **不存 RNG/数据状态**
   数据顺序、dropout、增强变了，权重对不上。

3. **不存 AMP scaler**
   loss scaling 重新 warmup，甚至 NaN。

4. **恢复位置错**
   从 step 而不是 step+1 继续，重复消费数据。

5. **原地覆盖 checkpoint**
   写一半失败就损坏；先写临时再原子替换。

6. **分片元数据缺失**
   换 world size/并行策略后加载失败/错位。

7. **异步写占满带宽**
   checkpoint 和训练抢 I/O，step time 抖动。

8. **保留太多/太少**
   占满容量，或故障丢太多进度；要有 retention。

9. **不做恢复演练**
   能写不一定能读回；恢复时间也要测。

10. **换硬件/拓扑还追求 bitwise**
    浮点归约顺序变了，只能要求容差内一致。

11. **加载不可信 pickle**
    `torch.load` 可执行代码；只加载可信来源，权重可用 `weights_only=True`。

12. **tokenizer/模板版本不一致**
    恢复后输入分布变了，loss/指标对不上。

13. **多卡只在 rank0 存**
    其他 rank 的 shard/optimizer 状态丢了；要分片/全量明确。

## 8. 要点回顾

1. 训练 checkpoint 含权重、优化器、scheduler、step、数据状态、RNG、AMP、并行元数据
2. 只存权重只能推理，不能续训
3. 分片 checkpoint 要记录 world size/TP/PP/ZeRO 和 shard 元数据
4. 先写临时、再原子替换；异步写会占带宽
5. 恢复顺序：模型→优化器→scheduler→scaler→step→数据→RNG
6. 从 step+1 继续；保存 RNG 要在该 step 的随机消费之后
7. 可复现要固定代码/数据/tokenizer/seed/精度/并行/环境
8. 同配置同硬件可追求 bitwise；换拓扑/硬件通常只能统计复现
9. 7B checkpoint 约 112GB（7.2B 约 115GB）；70B 约 1.1TB；要算容量/带宽/保留策略
10. checkpoint 不是备份；要副本、校验、恢复演练

## 参考

- PyTorch, Checkpoint：<https://pytorch.org/docs/stable/checkpoint.html>
- PyTorch, Distributed Checkpoint：<https://pytorch.org/docs/stable/distributed.checkpoint.html>
- PyTorch, FSDP：<https://pytorch.org/docs/stable/fsdp.html>
- PyTorch, Reproducibility：<https://pytorch.org/docs/stable/notes/randomness.html>
- Hugging Face Safetensors：<https://github.com/huggingface/safetensors>
- 存储与 checkpoint 成本：[Infra 第 3 篇](../infra/03-存储与数据.md)
- 分布式并行：[Training 第 5 篇](05-分布式并行.md)
- 混合精度/AMP：[Training 第 6 篇](06-混合精度与显存.md)
