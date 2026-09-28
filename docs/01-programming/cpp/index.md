# C++

语言基础 → 对象模型 → STL → 并发 → 工程 → 性能。以 C++17/20 为主；版本特性独立成篇，方便按版本查。

## 篇目

### 语言基础

| 文件 | 内容 |
|------|------|
| [基础](基础.md) | 引用 vs 指针、成员访问（`.`/`->`）、this、inline、auto、函数指针、constexpr、初始化、static、const、类型转换、对齐、POD |
| [未定义行为](未定义行为.md) | UB 清单、序列点、有符号溢出、怎么避免 |
| [异常处理](异常处理.md) | 异常机制、异常安全、noexcept、析构不抛异常 |
| [C 语言要点](C语言要点.md) | C 有 C++ 没有、同名不同义、内存布局、C 陷阱与工程惯用法、ASan 抓错、C ABI 与 `extern "C"` |

### 对象模型与泛型

| 文件 | 内容 |
|------|------|
| [面向对象](面向对象.md) | 类、封装/访问级别/友元、explicit、静态成员、运算符重载、继承/多态/虚函数表、RTTI |
| [内存管理](内存管理.md) | 内存布局、new/delete vs malloc、泄漏检测、智能指针 |
| [右值引用与移动语义](右值引用与移动语义.md) | 值类别、move/forward、移动构造、RVO、emplace vs push_back |
| [模板与泛型](模板与泛型.md) | 函数/类模板、特化、SFINAE、type_traits、变参模板、别名/变量模板、定义放头文件 |

### 标准版本

| 文件 | 内容 |
|------|------|
| [C++11-14](C++11-14.md) | 移动语义、lambda、智能指针、chrono、enum class |
| [C++17](C++17.md) | if constexpr、结构化绑定、optional/variant/any、string_view、filesystem |
| [C++20](C++20.md) | concepts、ranges、协程、modules、span、三路比较 |
| [C++23](C++23.md) | expected、print、mdspan、generator、deducing this |

### 标准库（STL）

| 文件 | 内容 |
|------|------|
| [字符串](字符串.md) | SSO、string_view、生命周期坑（c_str/视图）、UTF-8 字节与字符、拼接性能、npos |
| [容器与迭代器](容器与迭代器.md) | vector/map/unordered_map/deque、插入与覆盖行为、迭代器类别与失效、适配器、分配器 |
| [算法与函数对象](算法与函数对象.md) | 查找/排序/修改/数值/集合/堆算法、lambda、function（附 vs 模板的开销实测）、bind |

### 并发

| 文件 | 内容 |
|------|------|
| [并发编程](并发编程.md) | thread/mutex/条件变量/atomic/future、锁选型、线程池、并发队列 |
| [内存模型与内存序](内存模型与内存序.md) | happens-before、acquire/release、seq_cst、无锁 |

### 工程与构建

| 文件 | 内容 |
|------|------|
| [编译链接](编译链接.md) | 编译四步、符号解析、ODR、LTO/PGO、名字修饰、PLT/GOT、动态库与 ABI |
| [工程规范](工程规范.md) | const 正确性、异常安全、头文件规范、RAII、测试与基准 |

### 系统与性能

| 文件 | 内容 |
|------|------|
| [系统与网络编程](系统与网络编程.md) | 文件 IO、进程/线程、信号、IPC、socket、粘包、epoll、零拷贝 |
| [性能优化与调试](性能优化与调试.md) | perf、伪共享、缓存局部性、分支预测、向量化、core dump、gdb |

### 设计模式

| 文件 | 内容 |
|------|------|
| [设计模式](设计模式.md) | 单例、工厂、观察者、策略、CRTP |
| [C++ 题库](../../09-interview/C++题库.md) | 108 题：对象模型/内存、移动语义、模板、并发、STL、编译链接、现代 C++——先自己说，再看答案 |

## 重点

- **RAII 与智能指针**：资源管理的地基，配合移动语义理解
- **C 互操作**：`extern "C"` 关掉名字修饰；C ABI 稳定是各种库都暴露 C API 的原因
- **移动语义**：`std::move` 只是类型转换；返回值靠 RVO，别乱 `move`
- **UB**：别名、越界、未初始化、有符号溢出都是"编译器自由区"
- **模板**：SFINAE / concepts / CRTP——读库代码迟早要用
- **并发**：happens-before 是理解 atomic 和锁的钥匙；伪共享影响多线程性能
- **性能**：先测再优化；缓存 > 指令级；**向量化取决于数据布局**（SoA 优先）
- **工程**：ODR / 符号 / ABI 是"能编过但跑挂"类问题的根源；测试 + sanitizer 是底线
