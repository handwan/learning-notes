# async 与生态

Rust 的异步（`async`/`await` + tokio）、序列化（serde）、测试，以及常用 crate 地图。

## 1. async/await 是什么

- `async fn` 返回一个 **Future**（还没执行的状态机）——**不 `.await` 就不跑**
- `.await`：等它完成；等待期间**让出线程**（不是阻塞线程）——这是 async 能扛大量并发的原因
- Rust 标准库只有 `async`/`await` 语法和 `Future` trait，**执行器（runtime）由库提供**：`tokio` / `async-std` / `smol`

```rust
async fn fetch(name: &str) -> String {
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    format!("got {name}")
}
```

**和线程的区别**：一个 OS 线程要 MB 级栈内存；一个 Future 只是个小状态机。**几万个并发连接**用线程扛不住，用 async 可以。

## 2. tokio 基础

```rust
#[tokio::main]                          // 把 main 变成异步运行时入口
async fn main() {
    let a = fetch("a");                 // 创建 Future（还没跑）
    let b = fetch("b");
    let (ra, rb) = tokio::join!(a, b);  // 并发等待：总耗时约 100ms，不是 200ms
    println!("{ra} {rb}");

    let h = tokio::spawn(async { 42 }); // 交给运行时调度（可以并行）
    assert_eq!(h.await.unwrap(), 42);
}
```

| 工具 | 作用 |
|------|------|
| `#[tokio::main]` / `#[tokio::test]` | 程序 / 测试的异步入口 |
| `tokio::join!` / `try_join!` | 等**全部**完成；`try_` 版任一出错就提前返回 |
| `tokio::select!` | 等**最先完成**的那个（超时、多路复用） |
| `tokio::spawn` | 把任务丢给运行时（要求 `Send + 'static`） |
| `tokio::time::timeout` | 给 Future 加超时 |

**`spawn` 的要求**：Future 必须 `Send + 'static`——跨线程调度 + 不借用局部变量。所以在异步任务里共享数据常用 `Arc<Mutex<...>>` 或 tokio 的 channel。

## 3. Pin 与取消

普通 `async`/`.await` 代码不用手写 `Pin`。只有自己实现 `Future`，或 Future 内部保存指向自身字段的引用时，才需要关心它。

- `Pin<&mut T>` 保证被 pin 住的值不再移动；移动自引用 Future 会让内部指针失效
- `Box::pin(value)` 把值固定到堆上，返回 `Pin<Box<T>>`
- 大多数 `async` 块生成的 Future 是 `!Unpin`，`.await` 由编译器/运行时负责 pin
- 一旦开始 poll，就不要把 Future 从 pin 的位置挪走

取消在 Rust 里就是**丢弃 Future**：`select!` 未命中的分支会被 drop，`JoinHandle::abort()` 会请求取消已 spawn 的任务。取消是协作式的：

- Future 只在 `.await` 点附近响应取消
- 正在执行的同步代码不会被打断
- `select!` 里要使用**取消安全**的操作，避免丢掉一半状态；不确定时把可能被取消的步骤包成独立任务

```rust
let fut = async { 42 };
tokio::pin!(fut);              // 栈上 pin 住
assert_eq!(fut.await, 42);
```

## 4. 什么时候用 async

| 场景 | 用什么 |
|------|--------|
| 大量并发 IO（网络服务、推理服务收请求、爬取） | **async** |
| CPU 密集（推理、矩阵、加密） | 线程池 / rayon；在 async 里用 `tokio::task::spawn_blocking` |
| 几十个简单线程 | 普通线程就够，不用引入 async |

**关键理解**：async 是"**用少量线程处理大量等待中的任务**"，不是"更快的线程"。把 CPU 密集的循环放进 async 任务会堵住执行器（其他任务饿死）——那类活要用 `spawn_blocking` 或 rayon。

## 5. serde：序列化 / 反序列化

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct Config {
    name: String,
    lr: f64,
    #[serde(default)]                  // 缺字段就用 Default
    seed: u64,
}

fn main() -> Result<(), serde_json::Error> {
    let cfg = Config { name: "run1".into(), lr: 0.01, seed: 42 };

    let json = serde_json::to_string_pretty(&cfg)?;      // 结构体 → JSON
    let back: Config = serde_json::from_str(&json)?;     // JSON → 结构体
    assert_eq!(cfg, back);
    Ok(())
}
```

- 依赖要开 derive 特性：`serde = { version = "1", features = ["derive"] }`
- 常用属性：`#[serde(rename_all = "camelCase")]`、`#[serde(default)]`、`#[serde(skip_serializing_if = "Option::is_none")]`
- **同一套 derive，换格式只换 crate**：`serde_json`（JSON）、`toml`（配置）、`csv`（表格）

**读配置的常见组合**：`serde` + `toml` + `anyhow`——结构体接配置，出错带上下文。

## 6. 测试

单元测试、集成测试和文档测试见[工程与互操作](07-工程与互操作.md)。异步测试用 `#[tokio::test]`，普通 `#[test]` 里不能 `.await`：

```rust
#[tokio::test]
async fn fetch_works() {
    assert_eq!(fetch("a").await, "got a");
}
```

基准用 `criterion`，`cargo bench` 跑。

## 7. 常用 crate 地图

| 方向 | crate |
|------|-------|
| 错误处理 | `thiserror`（库）/ `anyhow`（应用） |
| 序列化 | `serde` + `serde_json` / `toml` / `csv` |
| 异步 / 网络 | `tokio`、`hyper` / `axum`（HTTP 服务） |
| 命令行 | `clap` |
| 日志 / 追踪 | `tracing` + `tracing-subscriber` |
| 并行计算 | `rayon` |
| 分词 / 模型文件 | `tokenizers`、`safetensors` |
| 数据 / 数值 | `polars`、`ndarray` |
| 推理 | `candle`、`ort`（ONNX Runtime 绑定）、`mistral.rs`、`burn` |
| 开发工具 | `uv`、`ruff`、`ripgrep` |

**AI infra 的位置**：分词、模型文件、数据处理、推理服务适合 Rust；模型/算子底层仍是 C++/CUDA 为主，Rust 多承担外围基础设施。

## 8. 要点回顾

1. **`async fn` 返回 Future，不 await 不执行**；`.await` 让出线程而非阻塞
2. **执行器来自库（tokio）**，标准库只有语法和 `Future` trait
3. **`#[tokio::main]` / `#[tokio::test]` / `join!` / `select!` / `spawn`** 是日常工具
4. **`spawn` 要求 `Send + 'static`**；async 里共享状态用 `Arc` + tokio 原语
5. **`Pin`** 固定自引用 Future；普通 `.await` 不用手写。取消就是 drop Future，`select!` 和 `abort` 都会走这条路径
6. **async 适合 IO 密集；CPU 密集用 `spawn_blocking` / rayon**
7. **serde**：derive 两个 trait 就能序列化；换格式只换 crate（`serde_json`/`toml`）
8. **测试**：单元测试、集成测试、文档测试见[工程与互操作](07-工程与互操作.md)；异步用 `#[tokio::test]`，基准用 `criterion`
9. 常用 crate：`thiserror`/`anyhow`、`serde`、`tokio`、`clap`、`tracing`、`rayon`、`candle`
