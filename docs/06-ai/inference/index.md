# Inference

把权重变成服务：prefill/decode、KV cache、批调度、量化、引擎、高级优化、服务化、压测。集群、K8s、多地域、成本在[Infra](../infra/index.md)；这里讲模型 serving。它是[Training](../training/index.md)的对称面：一个把数据变成权重，一个把权重变成服务。

## 前置

- Transformer 结构：[LLM](../llm/index.md)；KV cache 在本文第 1 篇
- 算力/带宽/roofline：[性能模型与 roofline](../../02-computer-basics/computer-organization/07-性能模型与roofline.md)
- 图优化/内核：[AI 编译器](../../02-computer-basics/compiler/09-AI编译器与推理引擎.md)

## 学习路径

| # | 篇目 | 要解决的问题 | 实验 |
|---|---|---|---|
| 1 | [推理基础](01-推理基础.md) | prefill/decode、KV cache、算术强度、TTFT/TPOT | 手算一个模型的 KV cache |
| 2 | [推理引擎](02-推理引擎.md) | ONNX Runtime / TensorRT-LLM / vLLM / SGLang；怎么选 | 引擎选型矩阵（示例） |
| 3 | [批处理与调度](03-批处理与调度.md) | continuous batching、PagedAttention、chunked prefill | 比较静态/连续 batching |
| 4 | [量化](04-量化.md) | GPTQ/AWQ/SmoothQuant/FP8/INT4；精度-速度 | weight-only INT8/INT4 误差与 bytes/param |
| 5 | [高级推理优化](05-高级推理优化.md) | speculative decoding、分离式 prefill/decode、KV cache 压缩、multi-LoRA | speculative decoding 延迟模拟 |
| 6 | [服务化](06-服务化.md) | HTTP/gRPC、流式、超时/重试、限流、可观测性 | 最小 SSE 流式服务 |
| 7 | [压测与容量规划](07-压测与容量规划.md) | TTFT/TPOT、吞吐/延迟、SLO | M/M/c 模拟：延迟-QPS 曲线 |

## 读完能做什么

- 能解释“模型很快但服务很慢”的原因
- 能选引擎、量化方案和 batching 策略，并给出显存/吞吐账
- 能判断什么时候该上 speculative decoding、分离式部署或 KV cache 压缩
- 能设计一次压测，用 TTFT/TPOT/吞吐而不是“感觉快”评价服务

## 相关分栏

- Transformer 结构与 KV cache 概念：[LLM](../llm/index.md)
- 训练与微调：[Training](../training/index.md)
- 应用层（RAG/Agent/MCP）：[Applications](../applications/index.md)
- GPU、集群、部署、成本：[Infra](../infra/index.md)

## 参考

- Kwon et al., *PagedAttention / vLLM*：<https://arxiv.org/abs/2309.06180>
- Yu et al., *Orca*：<https://www.usenix.org/conference/osdi22/presentation/yu>
- Dao et al., *FlashAttention*：<https://arxiv.org/abs/2205.14135>
- Leviathan et al., *Speculative Decoding*：<https://arxiv.org/abs/2211.17192>
- Agrawal et al., *Sarathi-Serve*：<https://arxiv.org/abs/2403.02310>
- Zhong et al., *DistServe*：<https://arxiv.org/abs/2401.09670>
- Frantar et al., *GPTQ*：<https://arxiv.org/abs/2210.17323>
- Lin et al., *AWQ*：<https://arxiv.org/abs/2306.00978>
- Xiao et al., *SmoothQuant*：<https://arxiv.org/abs/2211.10438>
- TensorRT-LLM：<https://nvidia.github.io/TensorRT-LLM/>
- vLLM：<https://docs.vllm.ai/>
- SGLang：<https://docs.sglang.ai/>
- Williams et al., *Roofline*：<https://dl.acm.org/doi/10.1145/1498765.1498785>
