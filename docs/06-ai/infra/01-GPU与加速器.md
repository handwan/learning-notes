# GPU 与加速器

训练和推理最终都落在硬件上。GPU 不是一个“更快的 CPU”，而是用吞吐换延迟、用并行换单线程性能的加速器。

这篇讲：

- GPU 的 SM、CUDA core、tensor core、HBM 和内存层级
- 算力、带宽、显存、互联这些规格怎么读
- roofline：一个 workload 是 compute-bound 还是 memory-bound
- LLM 的 prefill 和 decode 为什么瓶颈不同
- 多卡 NVLink / NVSwitch / InfiniBand 的关系
- 怎么测量真实利用率，而不是只看峰值 TOPS

## 1. GPU 里有什么

一个 GPU 大致是：

```text
GPU
├── 多个 SM（Streaming Multiprocessor）
│   ├── CUDA cores / tensor cores
│   ├── warp scheduler
│   ├── registers
│   └── shared memory / L1
├── L2 cache
├── HBM（显存）
└── 互联：PCIe / NVLink
```

关键概念：

- **SM**：执行单元的基本块；一个 SM 里有很多 lane
- **warp**：通常 32 个线程一起执行；分支发散会降低效率
- **CUDA core**：通用 FP32/INT32 运算
- **tensor core**：矩阵乘加（MMA），训练/推理的主力
- **register / shared memory / L1 / L2 / HBM**：越靠近计算越快、越小
- **occupancy**：SM 上同时驻留多少 warp；太低掩盖不了延迟
- **coalescing**：相邻线程访问相邻内存，才能跑满带宽
- **MIG / MPS**：把一张 GPU 切给多个任务/租户

GPU 的强项是大量独立线程并行；弱项是复杂控制流、分支、频繁 CPU-GPU 同步。

## 2. 规格怎么读

不要只看“多少 TOPS”。至少看：

| 规格 | 影响 |
|---|---|
| FP32 / BF16 / FP16 / FP8 / INT8 算力 | 训练/推理速度上限 |
| dense vs sparse | 厂商标称常用稀疏数字，实际未必可用 |
| HBM 容量 | 能不能放下权重/KV cache/激活 |
| HBM 带宽 | decode、elementwise、KV cache 的瓶颈 |
| L2 / shared memory | 复用和延迟 |
| PCIe / NVLink 带宽 | 多卡通信、数据加载 |
| TDP / 散热 | 持续频率、降频 |
| ECC / MIG / 虚拟化 | 稳定性和多租户 |

示例：A100 80GB 量级大约 312 TFLOPS BF16、2039 GB/s HBM2e。不同厂商/代的数字不能直接横比，精度、稀疏、功耗、互联都要一起看。

## 3. Roofline

Roofline 用算术强度判断瓶颈：

$$
\text{AI}=\frac{\text{FLOPs}}{\text{bytes}}
$$

- AI：每读/写 1 byte，做多少次浮点运算
- 峰值算力：$P$（FLOP/s）
- 带宽：$B$（byte/s）
- 拐点：$P/B$（FLOP/byte）

$$
\text{attainable}
=\min\left(P,\ \text{AI}\cdot B\right)
$$

- $\text{AI}<P/B$：memory-bound，算力用不满
- $\text{AI}>P/B$：compute-bound，带宽不是瓶颈

用一组 A100 80GB 量级的参数算：

??? note "代码：Roofline"
    ```python
    def roofline(peak_tflops, bw_gbps, ai):
        ridge = peak_tflops * 1000 / bw_gbps
        attainable = min(peak_tflops, ai * bw_gbps / 1000)
        bound = "compute" if ai >= ridge else "memory"
        return bound, attainable, ridge

    peak, bw = 312.0, 2039.0
    print("ridge", round(peak * 1000 / bw, 1), "FLOP/byte")

    for ai in [1, 10, 100, 154, 300, 1000]:
        bound, attainable, _ = roofline(peak, bw, ai)
        print(f"ai={ai:4d} {bound:8s} attainable={attainable:6.1f} TFLOPS util={attainable / peak:.1%}")

    print("decode batch")
    for batch in [1, 16, 64, 128, 256]:
        ai = batch  # 粗略：2 FLOPs/参数，2 bytes/参数
        bound, attainable, _ = roofline(peak, bw, ai)
        print(f"batch={batch:3d} ai={ai:3d} {bound:8s} attainable={attainable:6.1f} TFLOPS util={attainable / peak:.1%}")
    ```

输出：

```text
ridge 153.0 FLOP/byte
ai=   1 memory   attainable=   2.0 TFLOPS util=0.7%
ai=  10 memory   attainable=  20.4 TFLOPS util=6.5%
ai= 100 memory   attainable= 203.9 TFLOPS util=65.4%
ai= 154 compute  attainable= 312.0 TFLOPS util=100.0%
ai= 300 compute  attainable= 312.0 TFLOPS util=100.0%
ai=1000 compute  attainable= 312.0 TFLOPS util=100.0%
decode batch
batch=  1 ai=  1 memory   attainable=   2.0 TFLOPS util=0.7%
batch= 16 ai= 16 memory   attainable=  32.6 TFLOPS util=10.5%
batch= 64 ai= 64 memory   attainable= 130.5 TFLOPS util=41.8%
batch=128 ai=128 memory   attainable= 261.0 TFLOPS util=83.7%
batch=256 ai=256 compute  attainable= 312.0 TFLOPS util=100.0%
```

读法：

- AI=1 时，只能跑到约 2 TFLOPS，算力利用率 0.7%
- AI=100 时到 204 TFLOPS，仍受带宽限制
- AI 超过约 153 才进入 compute-bound
- decode batch=1 的 AI 约 1，典型 memory-bound
- batch 增大后，权重被复用，AI 上升，才逐渐接近 compute-bound
- `ridge` 实际约 153.016；示例用 154 明确越过拐点

## 4. LLM 的 prefill 和 decode

Prefill：

- 一次处理整段 prompt
- 大矩阵乘、并行度高
- 通常 compute-bound
- 决定 TTFT（time to first token）

Decode：

- 每步只生成一个 token
- 每步都要读权重、KV cache、激活
- 通常 memory-bound
- 决定 TPOT（time per output token）

粗略估算 decode 的 AI：

- 每个参数每步约 2 FLOPs（乘加）
- BF16 每参数 2 bytes
- 不考虑 KV cache/激活时，AI ≈ batch

所以：

- batch=1：AI≈1，远低于拐点，算力大量闲置
- batch 增大：权重复用，AI 上升
- KV cache 越大，额外读的 bytes 越多，AI 还会下降
- GQA/MLA 减少 KV cache，对 decode 很关键

这也是 continuous batching、KV cache 优化、量化、speculative decoding 的动机。

## 5. 显存与 OOM

GPU 显存不是只放权重：

| 项目 | 训练 | 推理 |
|---|---|---|
| 权重 | 有 | 有 |
| 梯度 | 有 | 无 |
| 优化器状态 | 有 | 无 |
| 激活 | 有 | 有（较小） |
| KV cache | 无 | 有（长上下文很大） |
| 临时 buffer | 有 | 有 |

OOM 先问：

- batch/序列长度是不是太大？
- 优化器状态是不是没算？
- 激活有没有 checkpointing？
- KV cache 预算多少？
- 有没有碎片/缓存未释放？

PyTorch 里看：

??? note "代码：显存与 OOM"
    ```python
    import torch

    if torch.cuda.is_available():
        print("allocated", torch.cuda.memory_allocated())
        print("reserved", torch.cuda.memory_reserved())
        print("max", torch.cuda.max_memory_allocated())
    ```

`allocated` 是张量占用，`reserved` 是缓存池；两者差很多时，可能是碎片或缓存未释放。

## 6. 多卡互联

单卡不够时：

- **PCIe**：通用，带宽较低
- **NVLink**：GPU 间高带宽直连
- **NVSwitch**：机内多卡全互联
- **InfiniBand / RoCE**：节点间网络
- **NCCL**：集合通信库

拓扑很重要：

- 同机 NVLink 域内 all-reduce 快
- 跨机走 InfiniBand，延迟和带宽都下降
- TP 通常放同机/NVLink 域
- PP/DP 可以跨机，但通信模式不同

常见并行：

- **DP**：数据并行，梯度 all-reduce
- **TP**：张量并行，层内切分，通信频繁
- **PP**：流水并行，按层切分， bubble
- **ZeRO/FSDP**：切分优化器状态/梯度/参数

## 7. 测量

不要用厂商标称峰值代替实测：

- `nvidia-smi`
- `nvidia-smi dmon`
- DCGM
- Nsight Systems / Nsight Compute
- PyTorch profiler
- 训练框架的 MFU 统计

看：

- 实际 FLOPS / 峰值 FLOPS（MFU）
- HBM 带宽利用率
- SM occupancy
- tensor core 使用率
- 功耗/频率/温度
- ECC 错误
- MIG 切分

“GPU 利用率 100%”不等于算力用满，可能只是内存在搬数据。

## 8. 其他加速器

| 加速器 | 特点 |
|---|---|
| NVIDIA GPU | CUDA 生态、NVLink、Tensor Core |
| AMD GPU | ROCm、HBM、MI 系列 |
| Google TPU |  systolic array、XLA、Pod 互联 |
| AWS Trainium / Inferentia | 训练/推理专用，Neuron SDK |
| Intel Gaudi | Habana 架构，以太网互联 |
| NPU / 边缘加速器 | 低功耗、特定算子 |

比较时不要只看 TOPS：

- 支持的数据类型
- 显存容量/带宽
- 互联拓扑
- 软件栈/算子覆盖
- 编译/调试工具
- 供应和迁移成本

## 9. 常见坑

1. **只看 TOPS**
   峰值算力不代表实际吞吐；内存带宽、互联、软件栈都会限制。

2. **稀疏算力当 dense 用**
   厂商标称常用 sparsity；实际模型未必能用上。

3. **忽略 HBM 容量**
   权重、KV cache、激活放不下，算力再高也跑不起来。

4. **忽略 HBM 带宽**
   decode、elementwise、KV cache 经常是 memory-bound。

5. **把 GPU 利用率当算力利用率**
   `nvidia-smi` 100% 可能只是内存在忙。

6. **NVLink 和 PCIe 混着算**
   跨卡/跨机带宽差一个量级，拓扑决定通信。

7. **batch 太小**
   decode 的 AI 低，算力闲置；continuous batching 很关键。

8. **MIG 切太碎**
   每块显存/带宽变小，大模型可能不适合。

9. **忽略功耗/降频**
   持续训练会触发 power/thermal throttle，峰值跑不满。

10. **CPU/存储拖后腿**
    dataloader、网络存储、PCIe 可能先成为瓶颈。

11. **不同精度横比**
    FP8/FP16/BF16/INT8 的数字不能直接比。

12. **忽略软件栈**
    同一张卡，CUDA/ROCm/编译器/算子库不同，实际性能差很多。

## 10. 要点回顾

1. GPU 用 SM/warp/tensor core 换吞吐；不是更快的 CPU
2. 规格至少看算力、HBM 容量、HBM 带宽、互联、精度
3. roofline：AI < P/B 是 memory-bound，AI > P/B 是 compute-bound
4. LLM prefill 通常 compute-bound；decode 通常 memory-bound
5. decode batch 增大提高 AI；KV cache 增大会拉低 AI
6. 显存包括权重、梯度、优化器状态、激活、KV cache
7. 多卡看 NVLink/NVSwitch/InfiniBand 拓扑和 NCCL
8. 实测看 MFU、带宽、occupancy，不要只看峰值 TOPS

## 参考

- NVIDIA, CUDA C++ Programming Guide：<https://docs.nvidia.com/cuda/cuda-c-programming-guide/>
- NVIDIA, A100 Tensor Core GPU Architecture：<https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet.pdf>
- Williams et al., *Roofline: An Insightful Visual Performance Model*：<https://dl.acm.org/doi/10.1145/1498765.1498785>
- NVIDIA, NCCL：<https://docs.nvidia.com/deeplearning/nccl/>
- NVIDIA, Nsight Systems：<https://developer.nvidia.com/nsight-systems>
- NVIDIA, Nsight Compute：<https://developer.nvidia.com/nsight-compute>
- Jouppi et al., *In-Datacenter Performance Analysis of a Tensor Processing Unit*：<https://arxiv.org/abs/1704.04760>
- PyTorch, CUDA memory：<https://pytorch.org/docs/stable/notes/cuda.html>
