# 关系模型与 SQL

表 = 关系，行 = 元组，列 = 属性——SQL 是"关系代数"的工程语言（数学侧见 [离散数学 / 关系](../discrete-mathematics/03-集合、关系与函数.md)）。

> 示例基于 PostgreSQL 16；**MySQL / SQLite 的差异**在每节末尾单独标注。

## 1. 关系模型

| 数学（关系代数） | 数据库（SQL） |
|----------------|--------------|
| 关系 | 表（table） |
| 元组 | 行（row） |
| 属性 | 列（column），有类型 |
| 关系的子集 | 约束（主键/外键/唯一...） |
| 选择 σ、投影 π、连接 ⋈ | `WHERE`、`SELECT`、`JOIN` |

**键与约束**：

| 约束 | 作用 |
|------|------|
| `PRIMARY KEY` | 唯一标识一行（非空 + 唯一）；一张表一个 |
| `FOREIGN KEY` | 引用另一张表的主键（保证引用完整） |
| `UNIQUE` | 值唯一（可有多个，允许多个 NULL） |
| `NOT NULL` | 不允许空 |
| `CHECK` | 自定义条件（如 `salary > 0`） |
| `DEFAULT` | 默认值 |

## 2. 建表

```sql
DROP TABLE IF EXISTS emp, dept;

CREATE TABLE dept (
    id   int PRIMARY KEY,                 -- PG 也可用 GENERATED ALWAYS AS IDENTITY
    name text NOT NULL UNIQUE
);

CREATE TABLE emp (
    id        int PRIMARY KEY,
    name      text NOT NULL,
    dept_id   int REFERENCES dept(id),    -- 外键（简写）
    salary    numeric(10,2) CHECK (salary >= 0),
    hired_at  date DEFAULT CURRENT_DATE,
    manager_id int REFERENCES emp(id)     -- 自引用：上级
);
```

**关于自增主键**（三家写法不同）：

| 数据库 | 自增写法 |
|--------|---------|
| PostgreSQL | `id int GENERATED ALWAYS AS IDENTITY`（推荐）或 `serial` |
| MySQL | `id int AUTO_INCREMENT` |
| SQLite | `id INTEGER PRIMARY KEY`（隐式 rowid） |

**类型选择要点**：金额用 `numeric`（精确小数）别用 `float`（对接数学章的浮点数）；时间用 `timestamptz`（带时区）比 `timestamp` 安全；文本 `text` 通常够（PG 的 `text` 和 `varchar` 性能相同）。

## 3. 增删改

```sql
INSERT INTO dept (id, name) VALUES (1, '研发'), (2, '销售'), (3, '人事');

INSERT INTO emp (id, name, dept_id, salary, manager_id) VALUES
    (1, 'amy',  1, 30000, NULL),
    (2, 'bob',  1, 20000, 1),
    (3, 'cid',  1, 15000, 1),
    (4, 'dan',  2, 18000, NULL),
    (5, 'eve',  3, 12000, NULL);

UPDATE emp SET salary = salary * 1.1 WHERE dept_id = 1;
DELETE FROM emp WHERE id = 5;
```

**UPSERT（有则更新，无则插入）**：

```sql
-- PostgreSQL / SQLite
INSERT INTO dept (id, name) VALUES (1, '研发中心')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- MySQL: INSERT ... ON DUPLICATE KEY UPDATE name = VALUES(name);
```

**`RETURNING`**（拿到刚写入的数据，省一次查询）：PG ✅、SQLite 3.35+ ✅、MySQL ❌（用 `LAST_INSERT_ID()`）。

```sql
INSERT INTO dept (id, name) VALUES (10, '测试') RETURNING id, name;
```

**删除/更新前先查**：`UPDATE ... WHERE` 写错范围会全表更新——先 `SELECT COUNT(*)` 或用事务包住（见第 3 篇）。

## 4. 查询基础

```sql
SELECT name, salary FROM emp
WHERE salary >= 18000 AND dept_id = 1
ORDER BY salary DESC, name
LIMIT 10 OFFSET 0;            -- MySQL/SQLite 同样支持 LIMIT/OFFSET
```

**常用条件**：

```sql
WHERE dept_id IN (1, 2)
WHERE salary BETWEEN 10000 AND 20000
WHERE name LIKE 'a%'            -- % 任意多字符，_ 一个字符
WHERE manager_id IS NULL        -- NULL 必须用 IS（不能用 = NULL！）
WHERE name ILIKE 'a%'           -- PG 特有：忽略大小写（MySQL LIKE 默认不区分；或用 LOWER()）
```

**排序与空值**：`ORDER BY salary DESC NULLS LAST`（PG/SQLite；MySQL 用 `ISNULL(salary), salary DESC` 技巧）。默认行为：PG 把 NULL 当最大、MySQL 当最小——**别依赖默认**。

**`DISTINCT`**：`SELECT DISTINCT dept_id FROM emp;`（去重行）。

## 5. JOIN

```sql
-- 内连接：只保留两边都匹配的
SELECT e.name, d.name AS dept
FROM emp e JOIN dept d ON e.dept_id = d.id;

-- 左连接：左表全保留，右表没有就填 NULL
SELECT e.name, d.name AS dept
FROM emp e LEFT JOIN dept d ON e.dept_id = d.id;

-- 找"没有部门"的员工（反连接：LEFT JOIN + IS NULL）
SELECT e.name FROM emp e LEFT JOIN dept d ON e.dept_id = d.id WHERE d.id IS NULL;

-- 自连接：员工和上级
SELECT e.name AS emp, m.name AS manager
FROM emp e LEFT JOIN emp m ON e.manager_id = m.id;
```

| 连接 | 结果 |
|------|------|
| `INNER JOIN` | 两边都匹配 |
| `LEFT JOIN` | 左全保留 |
| `RIGHT JOIN` | 右全保留（可改写成 LEFT） |
| `FULL JOIN` | 两边都保留（MySQL ❌ 不支持） |
| `CROSS JOIN` | 笛卡尔积（m×n 行） |

**要点**：

- **条件写在 `ON` 还是 `WHERE` 有区别**（LEFT JOIN 时）：`ON` 决定"怎么匹配"（不影响左表保留），`WHERE` 是"匹配完再过滤"（会把补 NULL 的行滤掉）——"找没匹配上的"必须用 `WHERE 右表.键 IS NULL`
- 多表连接时，**小表/过滤性强的先连**（优化器一般会自己选顺序，但写清楚更好读）

## 6. 聚合与分组

```sql
SELECT dept_id, COUNT(*) AS n, AVG(salary) AS avg_salary, MAX(salary) AS top
FROM emp
GROUP BY dept_id
HAVING COUNT(*) >= 2            -- 分组后再过滤
ORDER BY avg_salary DESC;
```

| 要点 | 说明 |
|------|------|
| `WHERE` vs `HAVING` | `WHERE` 在分组**前**过滤行；`HAVING` 在分组**后**过滤组 |
| `COUNT(*)` vs `COUNT(col)` | 前者数行数；后者**不数 NULL** |
| 聚合 + 非聚合列 | `SELECT` 里的非聚合列必须出现在 `GROUP BY` 中（否则报错） |
| 字符串聚合 | PG: `STRING_AGG(name, ',')`；MySQL: `GROUP_CONCAT(name)` |

```sql
-- 每个部门的人名列表（PG）
SELECT dept_id, STRING_AGG(name, ', ' ORDER BY name) FROM emp GROUP BY dept_id;
```

## 7. 子查询与 CTE

```sql
-- 标量子查询（返回一个值）
SELECT name, salary FROM emp
WHERE salary > (SELECT AVG(salary) FROM emp);

-- EXISTS：相关子查询（外层每行都查一次"存在吗"）
SELECT d.name FROM dept d
WHERE EXISTS (SELECT 1 FROM emp e WHERE e.dept_id = d.id);

-- IN vs EXISTS：IN 适合小结果集；EXISTS 通常更稳（尤其 NULL 场景）
SELECT name FROM emp WHERE dept_id IN (SELECT id FROM dept);
```

**CTE（`WITH`，把子查询变"临时表"）**：

```sql
WITH high AS (
    SELECT * FROM emp WHERE salary > 15000
)
SELECT dept_id, COUNT(*) FROM high GROUP BY dept_id;
```

**递归 CTE**（树/图遍历：组织架构、分类、依赖）：

```sql
WITH RECURSIVE chain AS (
    SELECT id, name, manager_id, 1 AS depth FROM emp WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, c.depth + 1
    FROM emp e JOIN chain c ON e.manager_id = c.id
)
SELECT * FROM chain ORDER BY depth, id;
```

## 8. 窗口函数

**聚合是"多行变一行"，窗口是"每行都能看到所属分组的信息"**：

```sql
SELECT name, dept_id, salary,
       ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn,
       RANK()       OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rk,
       DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS drk,
       SUM(salary)  OVER (PARTITION BY dept_id) AS dept_total,          -- 组内合计（不折叠行）
       AVG(salary)  OVER (PARTITION BY dept_id) AS dept_avg,
       LAG(salary)  OVER (PARTITION BY dept_id ORDER BY salary) AS prev, -- 上一行
       LEAD(salary) OVER (PARTITION BY dept_id ORDER BY salary) AS next
FROM emp;
```

| 函数 | 区别 |
|------|------|
| `ROW_NUMBER()` | 1, 2, 3, 4（并列也给不同号） |
| `RANK()` | 1, 2, 2, 4（并列跳号） |
| `DENSE_RANK()` | 1, 2, 2, 3（并列不跳号） |

**典型用法**：

```sql
-- 每个部门工资最高的两个人（先算排名再过滤——WHERE 里不能直接用窗口函数）
SELECT * FROM (
    SELECT name, dept_id, salary,
           ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn
    FROM emp
) t WHERE rn <= 2;

-- 同比/环比：用 LAG 拿上一行
SELECT month, revenue,
       revenue - LAG(revenue) OVER (ORDER BY month) AS mom_change
FROM monthly;
```

**窗口 vs `GROUP BY`**：`GROUP BY` 把组压成一行；窗口保留每行 + 附加组内信息。`OVER` 里 `PARTITION BY` 分组、`ORDER BY` 定序，还可以写 frame（如 `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` = 滑动窗口）。

## 9. NULL 与三值逻辑

**NULL 不是"0/空串"，是"未知"**——任何和 NULL 的比较结果都是"未知"（UNKNOWN，第三个真值）：

```sql
SELECT NULL = NULL;        -- NULL（不是 true！）
SELECT NULL <> NULL;       -- NULL
SELECT 1 + NULL;           -- NULL（传染）
WHERE salary = NULL        -- ❌ 永远不成立
WHERE salary IS NULL       -- 正确写法
```

| 场景 | 注意 |
|------|------|
| `COUNT(*)` vs `COUNT(salary)` | 后者跳过 NULL（薪资为 NULL 的那行不算） |
| `SUM/AVG` | 自动跳过 NULL；`AVG` 的分母是"非 NULL 个数" |
| `NOT IN (子查询含 NULL)` | **结果永远为空**（`x NOT IN (1, NULL)` 等价于 `x≠1 AND x≠NULL` → UNKNOWN）→ 改用 `NOT EXISTS`（判不存在匹配行，NULL 行被当作不匹配保留，行为可预期） |
| 空值处理函数 | `COALESCE(a, b, 0)`（第一个非 NULL）；`NULLIF(a, 0)`（相等则变 NULL，常用于防除零）；PG 还有 `a IS DISTINCT FROM b`（把 NULL 当普通值比较） |

## 10. 要点回顾

1. **表 = 关系**：约束（主键/外键/唯一/检查）保证数据正确性；主键选稳定不变的（自增/业务无关键）
2. **增删改**：UPSERT 语法三家不同（PG/SQLite `ON CONFLICT`、MySQL `ON DUPLICATE KEY UPDATE`）；`RETURNING` PG/SQLite 有、MySQL 没有
3. **JOIN**：内连接取交集、左连接保留左表；**找"没匹配上的"用 `LEFT JOIN ... WHERE 右表键 IS NULL`**
4. **聚合**：`WHERE` 过滤行、`HAVING` 过滤组；`COUNT(*)` 数行、`COUNT(col)` 跳过 NULL
5. **CTE**：`WITH` 让子查询可读；**递归 CTE** 解决树/图遍历（组织架构、分类）
6. **窗口函数**：每行都能看到组内信息；`ROW_NUMBER/RANK/DENSE_RANK` 区别在"并列怎么编号"；排名过滤要套一层子查询
7. **NULL 三值逻辑**：比较用 `IS NULL`；`NOT IN` 遇 NULL 会踩坑（用 `NOT EXISTS`）；空值用 `COALESCE` 兜底
8. 三家差异集中在：自增写法、UPSERT、`RETURNING`、字符串聚合、`FULL JOIN`
