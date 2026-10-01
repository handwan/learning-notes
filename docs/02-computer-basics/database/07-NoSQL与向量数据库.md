# NoSQL 与向量数据库

关系库不是万能的：这一章补上"非关系型"的几大类，以及在 AI 应用里最常用的**向量检索**（pgvector 实测）。

> 示例基于 PostgreSQL 16 + pgvector 0.6.0；专用 NoSQL 库（MongoDB/Redis 等）标注为概念说明。

## 1. 为什么会有 NoSQL

关系库的强项是结构化数据 + 事务 + JOIN + 约束；它的边界在：

- 模式频繁变化（加个字段就要 DDL）
- 极高吞吐的键值访问（缓存/会话）
- 海量数据水平扩展（单机放不下）
- 特定查询：图遍历、**向量相似度**

NoSQL 不是"不用 SQL"，而是**为一类访问模式专门优化**：放弃部分关系能力（JOIN、强事务），换扩展性或特定查询能力。

**选型原则**：先问访问模式，再选存储；大多数系统是"关系库 + 一两个专用存储"混搭。

## 2. 几大类及代表

| 类型 | 数据模型 | 代表 | 典型场景 |
|------|---------|------|---------|
| **KV** | key → value | Redis、etcd、RocksDB | 缓存、会话、配置、队列 |
| **文档** | JSON 文档 | MongoDB、**PG 的 JSONB** | 模式灵活的业务对象 |
| **宽列/列式** | 行键+列族 / 列存 | Cassandra、HBase、ClickHouse | 海量写入、分析 |
| **图** | 点 + 边 | Neo4j | 社交、推荐、知识图谱 |
| **向量** | 高维向量 | **pgvector**、Milvus、Qdrant、FAISS | 语义搜索、RAG |

> 三者不是一回事：FAISS 是**算法库**（嵌进进程）、pgvector 是 **PG 扩展**、Milvus/Qdrant 是**独立服务**。

## 3. 向量检索：AI 时代的刚需

流程：

```
文本/图片 → 模型编码成 embedding（128~1536 维浮点数组）→ 存库
查询：query 也编码成向量 → 找距离最近的 N 条
```

**距离度量**（pgvector 三种操作符，实测都可用）：

| 操作符 | 含义 | 适合 |
|--------|------|------|
| `<->` | L2（欧氏距离） | 数值向量 |
| `<=>` | 余弦距离 | 文本 embedding（**最常用**） |
| `<#>` | 负内积 | 已归一化的向量 |

**精确搜索 = 全表比距离**：复杂度 O(N×D)，2 万条 128 维就是毫秒级——数据量一大就线性变慢。

**ANN（近似最近邻）**：用索引换取速度，接受"偶尔漏掉真正的近邻"。pgvector 支持 **IVFFlat** 和 **HNSW** 两种索引。

**HNSW 的思路**（分层小世界图）：

- 上层是稀疏的"高速公路"——先跳到目标大区域
- 下层是密集图——在大区域里做精细搜索
- `ef_search` = 候选队列大小，是**速度↔召回的旋钮**（调大更准更慢）

## 4. pgvector 实测

建表 + COPY 2 万条 128 维向量：

```sql
CREATE TABLE items (id serial PRIMARY KEY, emb vector(128), meta jsonb);
CREATE INDEX ON items USING hnsw (emb vector_cosine_ops);
SELECT id FROM items ORDER BY emb <=> '[...]'::vector LIMIT 10;   -- 查询写法
```

| 方式 | 速度 | 召回 |
|------|:---:|:---:|
| 精确（顺序扫描） | 基准 | 100% |
| HNSW `ef_search=10` | **快一个数量级** | 90% |
| HNSW `ef_search=40` | 快一个数量级 | 100% |
| HNSW `ef_search=100` | 略慢于上面两档 | 100% |

数据说明：向量是**带簇结构**的（100 个中心 + 小噪声，模拟真实 embedding 的聚集性）——HNSW 只建一次索引，索引 16 MB，查询走 `Index Scan`。

**一个重要坑**：如果把上面换成**纯随机向量**，同样的 HNSW 实测召回只有 **30%~70%**（`ef_search=100` 才 70%）——高维随机向量近似互相正交、近邻几乎并列，图索引分不清。**召回率取决于数据的结构**，评估 ANN 一定要用**真实 embedding**，别用随机数据下结论。

## 5. 语义 vs 关键词

**全文检索（tsvector）是按词匹配**，实测：

```sql
to_tsvector('english','PostgreSQL is a relational database')
-- 词干: 'postgresql':1 'relat':4 'databas':5

to_tsquery('english','postgres')    -- 命中 0！（词干是 postgresql，桥不过去）
to_tsquery('english','postgresql')  -- 命中 1
```

连"postgres/postgresql"这种变体都匹配不上；同义词（用"关系型数据库"搜 relational database）更没戏。

**向量检索比的是语义空间的距离**（手工构造的示意向量）：

| 查询 | 结果 |
|------|------|
| 用「猫」的向量搜 top3 | 猫 1.000、**狗 0.999**、汽车 0.283 |

（向量是手工编的示意值，真实里由模型生成——关键是"猫和狗在语义空间里很近"。）

**实践**：关键词精确匹配 + 向量语义召回，再重排 = **混合检索**。

## 6. 关系库也能当"文档库"：JSONB

PG 的 `jsonb` + GIN 索引（实测 5 万行）：

```sql
CREATE TABLE orders (id int, doc jsonb);
CREATE INDEX ON orders USING gin (doc);
SELECT * FROM orders WHERE doc @> '{"user": "u7"}';   -- 走 Bitmap Index Scan（毫秒级以内）
```

适合：模式不固定/嵌套字段，但希望继续待在事务、JOIN 的体系里。

与 MongoDB 的差异：MongoDB 是独立部署、原生文档模型、面向分布式水平扩展；PG 的 JSONB 是"关系库里的文档能力"，省一套运维。

## 7. 选型怎么想

- **访问模式优先**：KV 还是文档？分析还是事务？要不要图遍历/向量相似度？
- **一致性要求**：Redis 当缓存（丢了能重建）还是当数据源（不能丢）——定位不同，方案完全不同
- **运维成本**：多一个存储 = 多一套备份、监控、一致性协调
- **常见混合架构**：PG（事务 + JSONB + 向量）+ Redis（缓存）+ ClickHouse（分析）

pgvector 的价值在于**把向量检索留在 PG 里**：和业务数据同一事务、同一条 SQL JOIN、少一套运维；超大规模（亿级/GPU）再考虑专用向量库。

## 8. 要点回顾

1. **NoSQL = 为访问模式专门优化**：牺牲 JOIN/强事务，换扩展性或特定查询；选型先问模式
2. **五类**：KV（Redis）、文档（MongoDB/JSONB）、宽列列式（Cassandra/ClickHouse）、图（Neo4j）、向量（pgvector/Milvus）
3. **向量检索流程**：embedding → 距离度量（余弦 `<=>` 最常用）→ 近邻；精确搜索是 O(N×D) 线性扫
4. **ANN（HNSW）**：分层图先跳大区域再精搜；`ef_search` 是速度/召回旋钮（调大一点，召回从 90% 到 100%）
5. **召回率取决于数据结构**：真实 embedding（有簇）90~100%；纯随机向量只有 30~70%——评估别用随机数据
6. **关键词 vs 语义**：tsvector 连 postgres/postgresql 都桥不过去（实测命中 0）；向量比语义距离；实践用混合检索
7. **PG 的 JSONB + GIN**：@> 能走索引（5 万行毫秒级）——模式灵活但保留事务/JOIN
8. **选型**：访问模式 → 一致性要求 → 运维成本；pgvector 适合"业务+向量"一体，亿级再上专用向量库
