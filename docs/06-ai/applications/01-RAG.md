# RAG

RAG（Retrieval-Augmented Generation）不是“把文档塞进 prompt”这么简单。它是一条链路：

```text
离线：文档 → 解析 → 清洗 → chunk → embedding → index
在线：query → rewrite → retrieve → rerank → context → generate → cite
```

任何一段坏了，最后都会表现成“模型胡说”：

- chunk 切坏，答案被切断
- embedding/索引不匹配，检索不到
- top-k 太大，context 溢出/中间信息丢失
- 没有引用，无法核对
- 检索文档不可信，prompt injection

这篇讲 chunk、embedding、检索、重排、context、引用和评测，最后做一个小语料 RAG 的 chunk/recall 实验。

## 1. 离线与在线

| 阶段 | 做什么 | 关键点 |
|---|---|---|
| 解析 | PDF/HTML/表格/代码 | 版式、表格结构、页眉页脚 |
| 清洗 | 去噪、去重、权限 | 保留来源/时间/租户 |
| chunk | 切块 | 大小、overlap、边界、元数据 |
| embedding | 向量化 | 模型版本、维度、归一化 |
| index | ANN/倒排 | 召回率、延迟、过滤 |
| query | 改写/扩展 | 多轮、拼写、同义 |
| retrieve | top-k | recall、filters、权限 |
| rerank | 精排 | cross-encoder/LLM |
| context | 组装 | 去重、排序、token 预算 |
| generate | 回答/引用 | grounded、拒答 |
| evaluate | 评测 | 检索 + 生成 + 端到端 |

## 2. Chunking

常见策略：

- 固定 token/word 大小 + overlap
- 递归按段落/标题/句子切
- 语义切分（按主题变化）
- parent-child / small-to-big：小块检索，大块喂给模型
- 表格/代码按结构切，别按字符硬切

chunk 大小 tradeoff：

- 太小：语义不完整、上下文碎片，答案可能被切断
- 太大：一个 chunk 混多个主题，embedding 被稀释，token 成本高
- overlap：减少边界切断，但增加存储/检索重复
- 事实/答案靠近边界时，overlap 很关键

元数据：

- 来源、标题、时间、版本
- 租户/权限
- 章节/页码
- 语言/类型

没有元数据，后面做过滤、引用、权限、增量更新都会很难。

## 3. Embedding 与索引

embedding：

- query 和文档要用同一模型/版本
- 维度、归一化、距离度量要一致
- 多语言/领域模型按任务选
- 领域适配可以微调 embedding，但要重新建索引
- 记录模型版本；换模型 = 全量重建

索引：

- 精确检索：小数据/必须 100% 召回
- ANN：HNSW/IVF/PQ；用 recall/延迟/内存权衡
- 混合检索：BM25 + 向量；关键词/专有名词场景很重要
- 元数据过滤：租户/时间/权限/类型
- 增量更新/删除/版本

常见问题：

- 文档更新了，索引没更新
- query/doc 用了不同 embedding 模型
- 归一化/距离度量不一致
- 过滤条件在 ANN 之后才做，召回被污染
- 索引分片/多租户隔离没设计

## 4. 检索与重排

检索：

- top-k 取回候选
- recall@k 比 precision 更重要（先保证能找到）
- MMR/多样性，避免全是重复内容
- 元数据/权限过滤
- 多轮 query 改写/指代消解
- HyDE/多 query/同义扩展

重排：

- cross-encoder/LLM rerank 提高 precision
- 代价是延迟/算力
- 只对 top-N 重排，不要全量
- 重排模型也要版本/评测

不要只用向量 top-1：关键词、数字、代码、专有名词经常需要 BM25/混合。

## 5. Context 组装

把检索结果拼进 prompt 时：

- 去重（同一文档多个 chunk）
- 排序（相关度/时间/来源）
- 控制 token 预算
- 保留引用 ID/来源
- 处理“中间信息丢失”（lost in the middle）
- 结构化分隔：标题/来源/段落
- 明确告诉模型：只根据 context 回答，不足就拒答

安全：

- 检索文档是不可信输入，可能含 prompt injection
- 不要把文档里的指令当系统指令
- 权限过滤要在检索阶段做，不能只靠 prompt
- 引用要能回到原文

## 6. 生成与引用

prompt 要点：

- 只使用提供的 context
- 不足时明确说“不知道”
- 引用来源/段落
- 区分事实与推测
- 输出格式（JSON/表格）按需约束

引用：

- 回答里的引用 ID 要能映射回 chunk/文档
- 引用错比不引用更糟
- 多文档冲突时要说清来源/时间

拒答：

- 检索不到/证据不足要拒答
- 不要用模型参数知识补空白
- 拒答率/误拒要评测

## 7. 评测

检索指标：

- recall@k：gold 是否在 top-k
- MRR/nDCG：排序质量
- context precision：检索到的 context 中，相关 chunk 的比例
- context recall：gold answer 需要的信息，是否被 context 覆盖
- 过滤/权限是否正确

生成指标：

- faithfulness/groundedness：回答是否被 context 支持
- answer relevance：是否回答了问题
- citation correctness：引用是否对
- refusal：该拒答时是否拒答
- 端到端：任务成功率/人工评分

评测集：

- 真实问题 + gold 文档/答案
- 难例/多跳/长文档/表格/代码
- 多语言/租户/权限
- 回归集，每次改动都跑
- LLM-as-judge 有偏差，要人工抽检/校准

只看 answer 不看 retrieval，定位不了问题。

## 8. 实验：chunk/overlap 与 recall

小语料：

- 8 个文档，每个有一个唯一事实（项目 + launch code）
- 8 个查询，问对应事实
- 事实被故意放在 chunk 边界附近
- BM25 检索 chunk；看 top-1/top-3 是否包含完整事实句
- 比较 chunk size / overlap（按 word 计）

??? note "代码：小语料 RAG 的 chunk/recall"
    ```python
    import math
    import re
    from collections import Counter

    facts = [
        ("Aurora", "ZX-4471"), ("Borealis", "QK-8820"), ("Cascade", "LM-1934"),
        ("Dynamo", "PT-5510"), ("Everest", "RB-7723"), ("Falcon", "NS-3388"),
        ("Granite", "VC-9012"), ("Harbor", "WD-6645"),
    ]
    queries = [f"What is the launch code for Project {name}?" for name, _ in facts]
    positions = [20, 44, 68, 92, 116, 140, 164, 188]
    filler = (
        "The team reviewed the deployment plan and checked the staging environment. "
        "They discussed monitoring, rollback, and capacity for the next release. "
    ).split()

    def make_doc(i):
        name, code = facts[i]
        fact = f"The launch code for Project {name} is {code}."
        words = (filler * 20)[:positions[i]] + fact.split() + (filler * 20)
        return " ".join(words)

    docs = [make_doc(i) for i in range(len(facts))]

    def tokenize(s):
        return re.findall(r"[a-z0-9]+", s.lower())

    def chunk_doc(doc, size, overlap):
        words = doc.split()
        step = size - overlap
        return [" ".join(words[i:i + size]) for i in range(0, len(words), step) if words[i:i + size]]

    class BM25:
        def __init__(self, docs, k1=1.5, b=0.75):
            self.docs = docs
            self.tokens = [tokenize(d) for d in docs]
            self.k1, self.b = k1, b
            self.avgdl = sum(len(t) for t in self.tokens) / max(1, len(self.tokens))
            self.df = Counter()
            for t in self.tokens:
                self.df.update(set(t))
            self.N = len(self.tokens)

        def score(self, query, idx):
            q = tokenize(query)
            t = self.tokens[idx]
            tf = Counter(t)
            dl = len(t)
            score = 0.0
            for term in q:
                if term not in tf:
                    continue
                df = self.df[term]
                idf = math.log((self.N - df + 0.5) / (df + 0.5) + 1)
                f = tf[term]
                score += idf * f * (self.k1 + 1) / (
                    f + self.k1 * (1 - self.b + self.b * dl / self.avgdl)
                )
            return score

        def rank(self, query):
            scores = [(self.score(query, i), i) for i in range(self.N)]
            return [i for _, i in sorted(scores, reverse=True)]

    def evaluate(size, overlap, k=3):
        chunks = []
        for doc in docs:
            chunks.extend(chunk_doc(doc, size, overlap))
        bm = BM25(chunks)
        hit1 = 0
        hitk = 0
        for qi, q in enumerate(queries):
            name, code = facts[qi]
            gold = f"The launch code for Project {name} is {code}."
            ranked = bm.rank(q)
            texts = [chunks[i] for i in ranked]
            if gold in texts[0]:
                hit1 += 1
            if any(gold in t for t in texts[:k]):
                hitk += 1
        return hit1 / len(queries), hitk / len(queries), len(chunks)

    for size, overlap in [(24, 0), (24, 8), (48, 0), (48, 8), (96, 0), (96, 8), (128, 0)]:
        r1, r3, n = evaluate(size, overlap)
        print(f"chunk={size:3d} overlap={overlap:2d} chunks={n:3d} recall@1={r1:>4.0%} recall@3={r3:>4.0%}")
    ```

输出：

```text
chunk= 24 overlap= 0 chunks=180 recall@1=  0% recall@3=  0%
chunk= 24 overlap= 8 chunks=268 recall@1=100% recall@3=100%
chunk= 48 overlap= 0 chunks= 92 recall@1= 50% recall@3= 50%
chunk= 48 overlap= 8 chunks=110 recall@1=100% recall@3=100%
chunk= 96 overlap= 0 chunks= 48 recall@1= 75% recall@3= 75%
chunk= 96 overlap= 8 chunks= 52 recall@1=100% recall@3=100%
chunk=128 overlap= 0 chunks= 37 recall@1=100% recall@3=100%
```

读法：

- 事实句被故意放在边界附近；chunk=24/overlap=0 全部被切断，recall=0
- 同样 24，加 8 个词的 overlap，recall 到 100%
- 48/0 有一半被切断；48/8 修复
- 96/0 还有 25% 被切断；96/8 修复
- 128/0 这个语料里不再切断，但 chunk 更大、context 更贵
- overlap 会增加 chunk 数（180→268），存储/检索成本上升
- 这个玩具语料里 recall@3 和 @1 一样：BM25 一旦命中就排第一；真实数据 top-k/rerank 才会体现差异
- 这是 BM25 词面检索 + 人工边界布局，不是语义 embedding RAG；真实语料要自己的评测集

## 9. RAG vs 长上下文 vs 微调

| 需求 | 更适合 |
|---|---|
| 知识频繁更新 | RAG |
| 文档权限/租户隔离 | RAG（检索阶段过滤） |
| 大规模私有语料 | RAG |
| 固定风格/格式/行为 | 微调/SFT |
| 小规模、短文档 | 长上下文也可以 |
| 需要工具/动作 | Agent/工具调用 |
| 最新事实/引用 | RAG + 实时源 |

RAG 不负责“教会模型推理”；它负责把相关材料找出来。推理能力还是模型本身。

## 10. 常见坑

1. **chunk 太小/太大**
   切断答案或稀释语义；按任务调 size/overlap。

2. **固定大小切块且没有 overlap**
   事实/答案容易在边界被切断；实验里 24/0 直接 0%。递归/语义切分或 parent-child 也能避免，overlap 不是唯一解。

3. **embedding 模型不一致**
   query/doc 不同模型/版本，检索会坏。

4. **索引不更新**
   文档更新/删除后，检索到旧内容。

5. **只用向量 top-1**
   关键词/数字/代码/专有名词需要 BM25/混合。

6. **top-k 太大**
   context 溢出/中间信息丢失；要 rerank/预算。

7. **没有引用**
   无法核对；引用错比不引用更糟。

8. **检索文档当可信指令**
   prompt injection；文档内容不能覆盖系统指令。

9. **权限过滤太晚**
   先检索再过滤，可能泄漏；要在检索阶段带权限。

10. **评测只看回答**
    检索没召回，回答再好也是碰巧；要 recall@k。

11. **LLM-as-judge 不校准**
     judge 有偏差；要人工抽检/多 judge。

12. **该拒答时不拒答**
    证据不足还用参数知识补；要拒答评测。

13. **忽略延迟/成本**
    多路检索/rerank/长 context 都会加延迟；要算。

## 11. 要点回顾

1. RAG = 离线索引 + 在线检索/重排/生成/引用
2. chunk 大小/overlap 决定边界和语义完整性；实验里 24/0 recall=0，24/8=100%
3. query/doc embedding 要同模型/版本；索引要更新/过滤/隔离
4. 检索先保证 recall@k，再 rerank 提 precision；混合 BM25+向量
5. context 要 dedup/排序/预算；注意 lost in the middle
6. 生成要 grounded、引用、证据不足拒答
7. 评测同时看 retrieval（recall@k/MRR）和 generation（faithfulness/citation/refusal）
8. 检索文档不可信；权限过滤和 prompt injection 防护要在链路里做
9. RAG 适合动态/私有/需要引用的知识；不负责教推理

## 参考

- Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*：<https://arxiv.org/abs/2005.11401>
- Gao et al., *Retrieval-Augmented Generation for Large Language Models: A Survey*：<https://arxiv.org/abs/2312.10997>
- Liu et al., *Lost in the Middle*：<https://arxiv.org/abs/2307.03172>
- Asai et al., *Self-RAG*：<https://arxiv.org/abs/2310.11511>
- Es et al., *RAGAS*：<https://arxiv.org/abs/2309.15217>
- Malkov and Yashunin, *HNSW*：<https://arxiv.org/abs/1603.09320>
- 评测与安全：[LLM 第 9 篇](../llm/09-评测与安全.md)
- 推理/服务化：[Inference 第 1 篇](../inference/01-推理基础.md)
