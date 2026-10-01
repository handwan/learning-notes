# C++ 与 Python 访问数据库

服务端两种语言怎么连数据库：**连接、参数绑定、事务、连接池**——C++ 用 **libpq**、Python 用 **psycopg2**；API 名字不同，四件事的思路完全一致。

> 示例：libpq 16 + psycopg2（PostgreSQL 16）。

## 1. 环境准备

| | C++ | Python |
|--|-----|--------|
| 装依赖 | `sudo apt install libpq-dev` | `pip install psycopg2-binary`（或发行版包 `python3-psycopg2`） |
| 编译/运行 | `g++ -std=c++20 main.cpp -I$(pg_config --includedir) -lpq -o app` | 直接跑脚本 |

## 2. 最小流程：连接 → 执行 → 取结果

**C++（libpq）**：

```cpp
PGconn* conn = PQconnectdb("dbname=lintest");
if (PQstatus(conn) != CONNECTION_OK) { /* ① 连接要检查 */ }
PGresult* res = PQexec(conn, "SELECT id, note FROM inj_t");
if (PQresultStatus(res) != PGRES_TUPLES_OK) { /* ② 结果状态要检查 */ }
for (int i = 0; i < PQntuples(res); ++i)
    printf("%s\n", PQgetvalue(res, i, 1));   // ③ 逐行取值
PQclear(res);                                // ④ 配对释放
PQfinish(conn);
```

**Python（psycopg2）**：

```python
import psycopg2
conn = psycopg2.connect("dbname=lintest")
with conn:                                   # 只管事务：正常提交、异常回滚
    with conn.cursor() as cur:               # 游标自动关闭
        cur.execute("SELECT id, note FROM inj_t")
        for id_, note in cur:                # 游标可迭代
            print(note)
conn.close()                                 # 连接要自己关（或还给连接池）
```

Python 驱动用上下文管理器把"回滚/关游标"包好了；C++ 里 `PQclear`/`PQfinish` 都要手写、且**必须配对**（否则内存/连接泄漏）。

字段信息：C++ 用 `PQnfields`/`PQfname`；Python 用 `cur.description`。

## 3. 参数绑定：唯一正确的防注入姿势

**C++**：

```cpp
const char* params[1] = { user_input };
PQexecParams(conn, "INSERT INTO inj_t VALUES (1, $1)",
             1, nullptr, params, nullptr, nullptr, 0);
```

**Python**：

```python
cur.execute("INSERT INTO inj_t VALUES (1, %s)", (user_input,))   # 占位符是 %s，不是 ?
```

对照实测（输入 `'; DROP TABLE inj_t; --` 与贴合查询形状的 `x'); DROP TABLE inj_t; --`）：

| 写法 | C++ 实测 | Python 实测 |
|------|---------|------------|
| 字符串拼接 | **表被 DROP** | **表被 DROP** |
| 参数绑定 | 表还在、恶意串原样存为数据 | 同左 |

原理：参数**不参与 SQL 解析**，走协议层单独传输——SQL 结构在编译期就固定了。

三个注意点：

- payload 要"贴合"拼接形状才生效（实测第一种 payload 只换来语法错误）——**别指望"看不出来就没事"**
- 绑定执行**一次一条语句**；拼接才允许多语句（简单协议）——那正是危险面
- Python 传参用**元组**（单个参数写 `(val,)`）

## 4. 事务

**C++**：事务就是 SQL，用 `PQexec` 发：

```cpp
PQexec(conn, "BEGIN");
/* 多条写入；任何一步失败 → PQexec(conn, "ROLLBACK") */
PQexec(conn, "COMMIT");
```

**Python**：连接默认**不自动提交**，事务交给驱动：

```python
conn.commit()          # 或 conn.rollback()
with psycopg2.connect(dsn) as conn:   # 正常退出自动 commit，抛异常自动 rollback
    ...
```

实测：`BEGIN → INSERT → ROLLBACK` 后 0 行；`with` 块正常退出 1 行、抛异常回滚（0 行）。

各自的经典坑：**C++** 出错没回滚就复用连接（连接一直挂在失败事务里）；**Python** 忘了 commit（连接一关就丢）。

## 5. NULL、错误与大数据量

| 事情 | C++ (libpq) | Python (psycopg2) |
|------|------------|-------------------|
| 判 NULL | `PQgetisnull(res,i,j)`（`PQgetvalue` 对 NULL 返回空串） | 取出来就是 `None` |
| 错误 | `PQresultStatus` + `PQresultErrorMessage(res)` | 抛异常（`psycopg2.Error`） |
| 逐行取 | `PQgetvalue(res, i, j)` | `fetchone` / `fetchmany` / `fetchall`、可迭代 |
| 大结果集 | 一次 `PQexec` 全在内存 | **服务端游标**：`cur = conn.cursor(name="c")` + `itersize`，分批拉 |
| 批量写 | `COPY`（`PQputCopyData`） | `copy_expert` / `execute_values` |

服务端游标实测：25 行、`itersize=10` → 首批正好 10 行（全表不会一次性进内存）。

## 6. 连接池

复用省开销（新建连接是固定开销；复用后每次查询快一个数量级）。

**C++**：自己写小池——借/还 + 健康检查；libpq 的 `PGconn` **不是线程安全的**，多线程要**每线程一个连接**：

```cpp
class SimplePool {
    std::vector<PGconn*> free_;
public:
    PGconn* acquire() {                      // 有就复用（PQstatus 检查），没有才新建
        while (!free_.empty()) {
            PGconn* c = free_.back(); free_.pop_back();
            if (PQstatus(c) == CONNECTION_OK) return c;
            PQfinish(c);
        }
        return PQconnectdb(conninfo);
    }
    void release(PGconn* c) { if (PQstatus(c) == CONNECTION_OK) free_.push_back(c); else PQfinish(c); }
};
```

实测：借 4 次只新建 2 个连接。

**Python**：驱动自带池：

```python
from psycopg2 import pool
p = pool.SimpleConnectionPool(1, 3, "dbname=lintest")   # 单线程
a = p.getconn(); p.putconn(a); b = p.getconn()          # 实测：a is b（复用同一连接）
# 多线程用 ThreadedConnectionPool
```

规模上去了两边都可以上 **PgBouncer**（外部池，应用代码不用动）。

## 7. API 对照表

| 事情 | C++ (libpq) | Python (psycopg2) |
|------|------------|-------------------|
| 连接 | `PQconnectdb` / `PQfinish` | `psycopg2.connect` / `close`（`with` 只管事务） |
| 执行 | `PQexec` / `PQexecParams` | `execute(sql, params)` |
| 占位符 | `$1, $2` | `%s` |
| 取行 | `PQntuples` / `PQgetvalue` | `fetchone` / `fetchmany` / `fetchall` |
| NULL | `PQgetisnull` | `None` |
| 错误 | 状态码 + `PQresultErrorMessage` | 异常 |
| 事务 | `PQexec("BEGIN/COMMIT/ROLLBACK")` | `commit()` / `rollback()` / `with` |
| 连接池 | 自写 / PgBouncer | `psycopg2.pool` / PgBouncer |
| 批量 | `COPY`（`PQputCopyData`） | `copy_expert` / `execute_values` |

其他库：Redis 用 `hiredis`（C）/ `redis-py`（Python）；本地存储 SQLite 用 sqlite3 C API / Python `sqlite3`；异步 Python 用 `asyncpg`；要 ORM 用 SQLAlchemy——**注入防护、事务边界、连接池这三条规矩不变**。

## 8. 要点回顾

1. **四件事**：连接、参数绑定、事务、连接池——C++/Python 只是 API 名字不同
2. **防注入只有一招**：`PQexecParams`（`$1`）/ `execute(sql, params)`（`%s`）；拼接版实测**表真的被 DROP**
3. **事务**：C++ 发 `BEGIN/COMMIT/ROLLBACK`；Python 默认不自动提交，用 `commit()/rollback()` 或 `with conn:`（`with` **不关连接**）
4. **NULL/错误**：C++ 靠 `PQgetisnull` + 状态码/错误信息；Python 是 `None` + 异常
5. **大结果集用服务端游标**（Python `cursor(name=...)` + `itersize`）；批量写用 `COPY`/`execute_values`
6. **连接池**：复用省 10 倍以上；C++ 池自己写且**每线程一个连接**；Python 用 `psycopg2.pool`
7. 换语言、换库，**防注入、事务边界、池化**这三条工程规矩不变
