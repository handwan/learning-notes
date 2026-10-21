# C 语言要点

C++ 项目里仍会遇到 C：CUDA kernel、库的 C API、FFI、读 C 源码。这篇只收**读 C 代码、写 C 接口**真正会用到的部分；少见的语言特性不展开。

## 1. 什么时候会碰到 C

- **CUDA**：kernel 是 C 风格——指针 + 长度、无异常、无 STL
- **库的 C API**：TensorRT、ONNX Runtime、cuDNN、NVML
- **FFI**：Python ctypes、Go/Rust/C# 调 `.so`
- **读源码**：SQLite、ffmpeg、zlib、Linux 内核

根因：**C 的 ABI（调用约定、符号名）在平台层面稳定**；C++ 的名字修饰、异常、STL 布局都不稳定，所以公共接口通常提供 C 接口。

## 2. 读 C 代码的最小知识

### 2.1 声明怎么读

```c
int *p[10];      // 数组：10 个 int*
int (*p)[10];    // 指针：指向 int[10]
int (*f)(int);   // 函数指针：接收 int，返回 int
```

从变量名往外读：先看 `[]` / `()`，再看 `*`。

### 2.2 指针与数组

```c
int a[10];
int* p = a;      // 数组名退化为首元素指针
sizeof(a);       // 40（4 字节 int × 10）
sizeof(p);       // 8（64 位指针）
```

1. 数组作函数参数会退化成指针，`sizeof` 拿不到长度 → 额外传 `n`
2. `p + 1` 按元素大小跳，不是按字节
3. `malloc(sizeof(ptr))` 是常见错误 → 用 `sizeof(*ptr)` 或 `n * sizeof(T)`

### 2.3 struct / typedef / 不透明指针

```c
/* stack.h：外部只看到类型名和函数 */
typedef struct Stack Stack;
Stack* stack_create(void);
void   stack_destroy(Stack* s);
int    stack_push(Stack* s, int v);

/* stack.c：实现定义在这里 */
struct Stack { int* data; int size; int cap; };
```

改实现不用改头文件，调用方也不需要知道字段。

### 2.4 头文件与链接

- `static` 函数/全局变量：只在当前文件可见
- `extern`：声明（不是定义）
- 头文件守卫：`#pragma once` 或 `#ifndef`
- `inline`：C99 下本编译单元不生成外部定义；头文件里通常写 `static inline`

### 2.5 宏

```c
#define SQUARE(x) ((x) * (x))      /* 参数求值两次：SQUARE(i++) 重复自增（UB） */
#define STR(x) #x                   /* 字符串化 */
#define CAT(a, b) a##b              /* 拼接 */
#define CHECK(x) do { if (!(x)) return -1; } while (0)
```

- 多语句宏用 `do { } while (0)` 包住
- 宏参数没有类型检查；能用函数实现就用函数

## 3. C 与 C++ 的常见差异

| 差异 | C | C++ |
|---|---|---|
| `void*` → `T*` | 隐式转换 | 必须 `static_cast` |
| `const` | 只读变量，不是常量表达式 | 可用于数组长度、模板参数 |
| `struct` / `enum` | 必须写关键字 | 可省略 |
| 字符串字面量 | `char* s = "hi"` 可以编译（写入是 UB） | 必须 `const char*` |
| `int f()` | 参数未指定（旧式声明） | 表示无参（写 `int f(void)`） |
| `bool` | `<stdbool.h>`；C23 才成关键字 | 内置 |
| 指定初始化 | 可乱序 `{.y=2,.x=1}` | C++20 必须按声明顺序 |
| `sizeof('a')` | 4（字符常量是 `int`） | 1（`char`） |

## 4. 内存与布局

### 4.1 struct 对齐

```c
struct node { int id; char tag; double val; };
/* id: 0, tag: 4, val: 8, sizeof = 16 */
```

规则：成员按自身大小对齐；整体按最大成员补齐。成员从大到小排能省 padding。

### 4.2 malloc / realloc / free

```c
int* p = malloc(n * sizeof *p);
if (!p) { /* 处理失败 */ }

int* q = realloc(p, m * sizeof *q);
if (!q) {
    /* 失败：p 仍然有效，不要覆盖 */
} else {
    p = q;
}

free(p);
p = NULL;
```

- `realloc` 失败返回 NULL，原指针仍有效；不要写 `p = realloc(p, n)`
- `free(NULL)` 合法
- `malloc` ↔ `free`，不能和 `new` / `delete` 混用（见[内存管理](内存管理.md)）

### 4.3 memset / memcpy 的 size

```c
int a[10];
memset(a, 0, sizeof a);     /* 对数组：整个 40 字节 */

int* p = a;
memset(p, 0, sizeof p);     /* ❌ 只清了指针本身（8 字节），数组没动 */
```

- `memset` 按字节填，只适合 0 / 0xFF 这类值
- `memcpy` 区域重叠必须用 `memmove`
- 结构体有 padding 时，`memcmp` 比较不可靠

### 4.4 packing

```c
#pragma pack(push, 1)
struct Header { uint8_t type; uint32_t len; };   /* 5 字节，不补 padding */
#pragma pack(pop)
```

也可以用 `__attribute__((packed))`。网络协议、文件格式常用；普通结构体不要添加，会降低访问性能。

### 4.5 volatile

表示"可能被外部修改"（MMIO、信号处理），每次访问都必须实际读取内存。**它不解决线程同步**——线程共享数据用 `atomic` / `mutex`。

### 4.6 所有权

谁分配、谁释放、回调里的指针活多久——写进头文件注释。

## 5. 六个常见陷阱

1. **`strncpy` 不保证 `'\0'`**：目标不补结束符，`strlen` 会越界 → `snprintf(dst, sizeof dst, "%s", src)`（`dst` 是数组时）
2. **`memcpy` 区域重叠是 UB** → `memmove`
3. **`sizeof(ptr)` 当数组长度** → 传长度，或 `sizeof(*ptr)`
4. **有符号/无符号混用**：`int i = -1; i < sizeof(x)` 永远为假（`sizeof` 是 `size_t`）
5. **`atoi` 分不出错**：`atoi("abc") == 0`、`atoi("12x") == 12` → `strtol` + `endptr`
6. **`printf` 格式**：`size_t` 用 `%zu`，`uint64_t` 用 `PRIu64`（`<inttypes.h>`）

补充：整数提升——小于 `int` 的类型先提升到 `int`；有符号和无符号混用会转成无符号。有符号溢出是 UB，见[未定义行为](未定义行为.md)。

## 6. 写 C API / FFI 的套路

### 6.1 不透明指针

见 §2.3：`typedef struct Stack Stack;` + `create/destroy`，实现全部定义在 `.c` 里。

### 6.2 回调 + `void* user_data`

```c
typedef void (*visit_fn)(int value, void* user_data);
void for_each(int* arr, int n, visit_fn fn, void* ud);
```

C 没有闭包，状态靠 `user_data` 显式传；C++ 的不捕获 lambda 可以转成函数指针。

### 6.3 错误处理

| 风格 | 适合 |
|---|---|
| 返回码 | 一般函数 |
| `errno` | POSIX 系统调用 |
| out-param | 既要状态又要结果 |

### 6.4 goto cleanup（C 版 RAII）

```c
int load(const char* path) {
    FILE* f = NULL;
    char* buf = NULL;
    int rc = -1;

    f = fopen(path, "r");
    if (!f) goto done;
    buf = malloc(4096);
    if (!buf) goto done;

    rc = 0;
done:
    free(buf);          /* free(NULL) 合法 */
    if (f) fclose(f);
    return rc;
}
```

一个出口统一释放，避免每个错误分支重复写清理代码。

### 6.5 `extern "C"`

C++ 会做名字修饰（`int add(int,int)` → `_Z3addii`），C 不会。所以 C++ 调 C 要：

```cpp
extern "C" int c_add(int a, int b);
```

头文件双兼容：

```c
#ifdef __cplusplus
extern "C" {
#endif
/* 声明 */
#ifdef __cplusplus
}
#endif
```

原理和动态库细节见[编译链接](编译链接.md) §12。

### 6.6 跨边界规则

| 规则 | 原因 |
|---|---|
| 只传 POD、指针、函数指针、`void*` | 跨 ABI 只有这些布局稳定 |
| 异常不能穿过 C 栈帧 | C 没有异常表 |
| 分配/释放必须同侧 | `new`↔`delete`、`malloc`↔`free` |
| 字符串用 `const char*` | `std::string` 布局不稳定 |
| 回调用函数指针 + `void*` | C 没有闭包 |

## 7. 工具链

```bash
cc -std=c17 -Wall -Wextra -Wpedantic main.c
cc -std=gnu17 ...      # 需要 POSIX 函数（strtok_r/strdup/getline）时
cc -fsanitize=address,undefined -g main.c
```

- `-std=c17` 是严格 ISO 模式，POSIX 函数不可见；改用 `-std=gnu17` 或 `#define _GNU_SOURCE`
- ASan 抓越界、悬垂、泄漏；UBSan 抓未定义行为
- 断言：`assert(cond)` 只在 debug 生效（`NDEBUG` 关闭）；编译期用 `_Static_assert`
- 导出 `.so` 用 `-fvisibility=hidden`，只显式标要导出的符号

## 8. 标准版本

| 版本 | 关键词 |
|---|---|
| C89/C90 | 原始 ANSI C |
| C99 | `//` 注释、`long long`、指定初始化、`stdint.h`、`inline` |
| C11 | `_Static_assert`、`stdatomic.h`、匿名 struct/union |
| C17 | 修 bug，几乎无新特性 |
| C23 | `bool/true/false` 关键字、`nullptr`、`typeof`、`auto` |

## 9. 要点回顾

1. **C 在项目里的位置**：CUDA、C API、FFI、源码；根因是 C ABI 稳定
2. **读声明**：从变量名往外读；数组会退化，`sizeof` 要分清数组和指针
3. **C 与 C++**：`void*`、`const`、`struct` 关键字、字符串字面量、`int f()`、`bool`
4. **内存**：struct 对齐、`realloc` 失败原指针有效、`memset/memcpy` 的 size、packing、所有权
5. **陷阱**：`strncpy`、`memcpy` 重叠、`sizeof(ptr)`、有符号/无符号、`atoi`、格式化
6. **接口**：不透明指针、回调 + `user_data`、错误码/`errno`/out-param、`goto cleanup`、`extern "C"`
7. **工具链**：`-Wall -Wextra -Wpedantic`、`c17` vs `gnu17`、ASan/UBSan
