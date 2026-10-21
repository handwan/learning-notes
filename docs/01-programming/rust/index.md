# Rust

定位：Rust 自己的路线——**语法地基**（基础语法）→ **核心机制**（所有权 / 借用 / 类型 / 并发）→ **日常写法**（迭代器与闭包、集合与字符串、async 与生态）；与 C++ 明显不同之处会单独标出。

## 篇目

| # | 主题 | 核心 |
|---|------|------|
| 1 | [基础语法](01-基础语法.md) | 变量/遮蔽、无隐式转换、表达式返回、控制流、模块、宏 |
| 2 | [所有权与借用](02-所有权与借用.md) | move 语义、`&` vs `&mut`、生命周期、`String` vs `&str` |
| 3 | [类型系统](03-类型系统.md) | enum + match、`Option`/`Result`/`?`、trait、自定义错误、静态 vs 动态分发 |
| 4 | [内存与并发](04-内存与并发.md) | `Box`/`Rc`/`Arc`/`RefCell`/`Weak`/`OnceLock`、`Send`/`Sync`、`Mutex<T>`、原子类型、`thread::scope` |
| 5 | [迭代器与闭包](05-迭代器与闭包.md) | 闭包捕获（`Fn`/`FnMut`/`FnOnce`/`move`）、`iter()`/`iter_mut()`/`into_iter()`、适配器链与惰性、`collect` 到 `Result` |
| 6 | [集合与字符串](06-集合与字符串.md) | `Vec`/`HashMap`/`BTreeMap`/`HashSet`、UTF-8 与字符边界、溢出与转换、格式化 |
| 7 | [工程与互操作](07-工程与互操作.md) | cargo、features、宏、unsafe、`cxx` / `bindgen` |
| 8 | [async 与生态](08-async与生态.md) | `async`/`await` + tokio、`Pin` 与取消、`join!`/`spawn`/`spawn_blocking`、serde、测试、crate 地图 |

## 主线

- **语法差异先记三条**：默认不可变（`let mut`）、没有隐式转换（`as`/`into`）、最后一个表达式就是返回值（不带分号）
- **所有权 / 借用**是唯一真正的新东西，其余基本都能映射到 C++ 概念
- **enum + match** 表达状态；**`Option`/`Result`** 取代 null 和异常
- **数据竞争是编译错误**（借用规则 + `Send`/`Sync`）
- **迭代器链是日常写法**（`iter().filter().map().collect()`），且和手写循环性能相当
- **`String` 是 UTF-8 字节序列**：不能按下标取字符；溢出 debug panic / release 回绕
- **async 是 IO 密集专用**（CPU 密集用 `spawn_blocking` / rayon）
- **用在哪**：AI infra 项目（`tokenizers`、`candle`、`polars`）和工具链（`uv`、`ruff`）
