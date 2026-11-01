# Infra

模型跑在什么上：GPU、集群、存储、网络、部署、可观测性、成本。这里讲平台层，不重复 `02` 的体系结构和 `05` 的工具命令。

## 前置

- 体系结构、OS、网络：[02-computer-basics](../../02-computer-basics/index.md)
- Docker、K8s、perf：[05-tools](../../05-tools/index.md)

## 学习路径

| # | 篇目 | 写什么 | 关联 |
|---|---|---|---|
| 1 | [GPU 与加速器](01-GPU与加速器.md) | 显存、算力、带宽、roofline、NVLink | [体系结构](../../02-computer-basics/computer-organization/index.md) |
| 2 | [集群与调度](02-集群与调度.md) | K8s、GPU operator、Slurm、配额、拓扑感知 | [Docker/K8s](../../05-tools/index.md) |
| 3 | [存储与数据](03-存储与数据.md) | 对象存储、并行文件系统、checkpoint/数据集缓存 | [文件系统](../../02-computer-basics/operating-system/07-文件系统.md) |
| 4 | [网络与互联](04-网络与互联.md) | RDMA/InfiniBand、NVLink、集合通信、拓扑 | [计算机网络](../../02-computer-basics/computer-network/index.md) |
| 5 | [部署与多租户](05-部署与多租户.md) | 单机/多卡/多机、K8s、隔离、多地域 | [推理服务化](../inference/index.md) |
| 6 | [可观测性](06-可观测性.md) | GPU 利用率、显存、队列、训练/推理指标 | [perf](../../05-tools/perf/index.md) |
| 7 | [成本与容量](07-成本与容量.md) | 每百万 token 成本、利用率、容量规划 | [系统设计](../../09-system-design/index.md) |

## 读完能做什么

- 能算一个训练/推理任务的 GPU、显存、网络、存储需求
- 能判断瓶颈在算力、显存、带宽、网络还是调度
- 能设计一个 GPU 集群/推理平台的容量与成本模型
- 能定位 NCCL hang、OOM、GPU 利用率低、冷启动慢

## 相关分栏

- 训练方法与训练工程：[Training](../training/index.md)
- 推理引擎与服务化：[Inference](../inference/index.md)
- 系统设计（容量、可靠性、取舍）：[系统设计](../../09-system-design/index.md)
- 体系结构、网络、OS：[02-computer-basics](../../02-computer-basics/index.md)
- Docker、K8s、perf：[05-tools](../../05-tools/index.md)

## 参考

- CUDA C++ Programming Guide：<https://docs.nvidia.com/cuda/cuda-c-programming-guide/>
- NCCL：<https://docs.nvidia.com/deeplearning/nccl/>
- Kubernetes Scheduling：<https://kubernetes.io/docs/concepts/scheduling-eviction/>
- vLLM：<https://docs.vllm.ai/>
- DeepSpeed：<https://www.deepspeed.ai/>
- Megatron-LM：<https://github.com/NVIDIA/Megatron-LM>
- Google SRE：<https://sre.google/sre-book/table-of-contents/>
