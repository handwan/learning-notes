# C 语言要点

C++ 岗也躲不开 C：CUDA kernel、库的 C API（TensorRT/ONNX Runtime）、FFI、读 C 库源码。这篇收 **C 特有 / 与 C++ 行为不同 / C 工程实战**的内容，C 基础语法不重复。

> 本机 gcc 13.3 / g++ 实测（编译对比 + 运行 + ASan）。

## 1. 什么时候会碰到 C

- **CUDA**：kernel 是 C 风格（`__global__` 函数、"指针 + 长度"接口、无异常）
- **加速/推理库的 C API**：TensorRT、ONNX Runtime、cuDNN、NVML——稳定 ABI 都用 C
- **FFI**：Python ctypes/cffi、Go/Rust/C# 调 `.so`，靠的都是 C ABI
- **读源码**：SQLite、ffmpeg、zlib、hiredis 全是 C；Linux 内核风格代码
- **嵌入式/驱动**：基本是 C 的世界

**根因**：C ABI 跨编译器/跨语言稳定；C++ ABI 不稳定（同一编译器不同版本都可能变）——所以"公共接口"都开 C 口子。

## 2. C 有、C++ 没有

| 特性 | C | C++ |
|------|:---:|:---:|
| 变长数组 VLA：`int a[n]` | ✅ C99（但 `static`/文件作用域不行：实测 `variably modified 'a' at file scope`） | ❌ `ISO C++ forbids variable length array` |
| `_Generic` 类型分派宏 | ✅ C11（实测按类型选出 `int`/`double`） | ❌ |
| `restrict` 指针 | ✅ C99 | ❌ 不是关键字（实测编译错；用扩展 `__restrict`） |
| 复合字面量 `(struct P){1,2}` | ✅ C99（实测可用） | ❌ |
| 乱序指定初始化 `{.y=2,.x=1}` | ✅ | C++20 只准按声明顺序（实测 `designator order ... does not match`） |
| `void*` 隐式转成 `T*` | ✅（`int* q = p;`） | ❌ 必须 `static_cast`（实测 `invalid conversion from 'void*'`） |
| 字符串字面量可写：`char* s = "hi"` | ✅（默认不报错；写了是 UB） | ❌ 必须 `const char*`（实测 `forbids converting a string constant`） |
| `int f()` = 参数任意 | ✅（不检查，实测 `f(42)` 编译通过） | ❌ 表示无参（实测 `too many arguments to function 'int f()'`） |
| 省略 `struct`/`enum` 关键字 | ❌ 必须写 `struct Foo`（实测 `unknown type name 'Foo'`；惯用 `typedef struct{...} Foo`） | ✅ 直接 `Foo` |
| `const int N=5; int a[N];` | ❌ `const` 不是常量表达式（实测报错） | ✅ 编译期常量 |
| `bool` | 宏（`stdbool.h`；C23 起成为关键字） | 内置关键字 |
| 柔性数组 `struct F { int n; char data[]; }` | ✅ C99（一次分配"头 + 变长数据"） | ❌ |

**记法**：C 更"裸"（什么都让你看见、也什么都不帮你兜）；C++ 用类型系统替你挡了一部分。

## 3. 同名不同义

| 写法 | C 的含义 | C++ 的含义 |
|------|---------|-----------|
| `sizeof('a')` | **4**（字符常量类型是 `int`，实测） | **1**（`char`，实测） |
| `(char)200` | **-56**（`char` 符号性实现定义：x86 默认 signed；`-funsigned-char` 可改，实测） | 同样 -56 |
| `inline` | C99：本编译单元**不生成实体**——没有外部定义就链接失败（实测 `undefined reference to 'f'`） | 链接级合并，多个 TU 都放头文件里没事 |
| `const` | 只读变量（不是编译期常量） | 常量表达式（可用于数组长度、模板参数） |
| `enum` | 就是 `int` 的别名集 | 有底层类型；`enum class` 是强类型 |
| 函数参数里的 `int a[10]` | 退化成 `int*`（`sizeof` 拿不到长度） | 同样退化（但 C++ 可用引用 `int(&a)[10]` 保留） |
| `static` 函数 | 文件内可见（限制符号） | 同样，且可用于类成员 |

## 4. C 的数据布局：结构体、对齐与容器技巧

**struct 布局与 padding**（实测）：

```c
struct node { int id; char tag; double val; };
/* sizeof = 16：id 偏移 0、tag 偏移 4、val 偏移 8
   （tag 后面补 3 字节，让 double 8 字节对齐；结构体总大小按最大对齐取整） */
```

规则：**每个成员按自身大小对齐；整体按最大成员对齐补齐**。所以：

- 成员按从大到小排能省内存（`double, int, char` 比 `char, int, double` 紧凑）
- 跨 cache line 的结构体会让热点字段多一次内存访问（C++ 性能篇的"数据布局"同理）

**`offsetof` + `container_of`**（C 的"从成员指针反推结构体"）：

```c
#define container_of(ptr, type, member) \
    ((type*)((char*)(ptr) - offsetof(type, member)))
/* 实测：已知 &n.val，能还原出 struct node* 并读到 id=7 */
```

**柔性数组**（C99）：`struct flex { int n; char data[]; }`——`malloc(sizeof(struct flex) + n)` 一次分配"头部 + 变长数据"（实测），比"指针指向另一块内存"更少一次分配/访问。

**指针算术**：`p + 1` 是按**元素大小**跳；两个指针相减得到 `ptrdiff_t`（元素个数）；`void*` 的算术是 GCC 扩展（按字节，标准 C 不允许）。

**别名规则（strict aliasing）**：编译器默认假设"不同类型的指针不指向同一块内存"（`char*` 例外，可以别名任何东西）。所以要"把 float 当 int 读"不能直接转指针——用 `memcpy` 或 `union`（后者是 C 的合法双关）。

## 5. C 的经典陷阱

**① `strncpy` 不保证 `'\0'`**：

```c
char dst[16]; memset(dst, 'X', sizeof dst);
strncpy(dst, "abc", 3);       /* 只拷 3 字节，不写结束符 */
strlen(dst);                   /* 实测 22 —— 一路越界读找 '\0'（UB！） */
dst[3] = '\0';                 /* 正确姿势：自己补 */
```

→ 要么手动补，要么用 `snprintf` / `strlcpy`。

**② `memcpy` 区域重叠是 UB**：重叠必须用 `memmove`（实测 `ababcdehij` 正确）。

**③ `strtok` 不可重入**（内部静态状态，嵌套解析会互相破坏）→ 用 POSIX `strtok_r`：

```c
#define _GNU_SOURCE            /* ← 关键！见 ④ */
char *save, *tok = strtok_r(a, ";", &save);
```

**④ 特征宏（feature test macro）的坑**：`-std=c17` 是**严格 ISO 模式**，POSIX 函数（`strtok_r`、`strdup`、`getline`……）**不可见**——实测直接隐式声明 → 返回值被当 int → **段错误**。解决：`#define _GNU_SOURCE` 或编译用 `-std=gnu17`（gcc 默认）。**写可移植 C 必须在意这个**。

**⑤ `atoi` 分不出错误**：`atoi("abc")=0`、`atoi("12x")=12`（实测）→ 用 `strtol` 带 `endptr` 检测（实测剩余 `"x"`）。

**⑥ 打印 64 位用 `PRIu64`**：`printf("%" PRIu64, x)`——跨平台不用猜 `%lu` 还是 `%llu`（实测打印 `18446744073709551615`）。

**⑦ `malloc/realloc/free`**：

- `realloc` 失败返回 NULL 且**原指针还在**——别写 `p = realloc(p, n)` 直接覆盖（失败就泄漏）
- `free(NULL)` 合法（别自己判断）；`free` 后置 NULL 防 double free
- 分配与释放必须**同侧**（`malloc`↔`free`；混 `new` 会被 ASan 抓：实测 `alloc-dealloc-mismatch (operator new vs free)`）

**⑧ 宏的多次求值**：`#define SQ(x) ((x)*(x))` → `SQ(i++)` 实测 `=6` 且 `i` 变 4（自增了两次）→ 能写成函数就写函数，或 C11 `_Generic` 做类型安全宏。

**⑨ 有符号溢出是 UB、无符号回绕是定义行为**（C 与 C++ 一致）；整数除法/取余在 C99 起也明确定义（向零取整、余数符号跟被除数）。

**⑩ 缓冲区**：`sprintf`/`strcat` 不查长度 → `snprintf`；`gets` 永远别用。

## 6. C 的工程惯用法（API 设计）

**不透明指针 + create/destroy**（C 的"封装"，头文件只暴露类型名）：

```c
/* stack.h */
typedef struct Stack Stack;          /* 只说是"存在这个类型"，不暴露实现 */
Stack* stack_create(void);
void   stack_destroy(Stack* s);
int    stack_push(Stack* s, int v);
int    stack_pop(Stack* s, int* out);   /* out-param 兼返回值 */
/* stack.c 里 struct Stack { ... }; ——实现细节全藏在这 */
```

实测：外部编译单元只能拿到 `Stack*`，字段一个都看不到——**改实现不改头文件**，也不会破坏调用方。

**回调带 `void* user_data`**（C 没有闭包，状态靠显式传）：

```c
typedef void (*visit_fn)(int value, void* user_data);
void for_each(int* arr, int n, visit_fn fn, void* ud);
/* 实测：同一个 for_each 既能求和，也能打印 */
```

**侵入式链表**（Linux `list_head` 风格，零额外分配）：

```c
struct list_head { struct list_head *next, *prev; };
struct task { int pid; struct list_head link; };   /* 链在业务结构里 */
/* 遍历时用 container_of 还原：实测按 pid=101 303 202 输出 */
```

**错误处理三种风格**（同一件事的取舍）：

| 风格 | 例子 | 适合 |
|------|------|------|
| 返回码 | `void* p = malloc(n); if (!p) ...` | 指针/一般函数 |
| `errno` | `fopen` 失败 → 查 `errno`（实测 `errno=2`：No such file or directory） | POSIX 系统调用 |
| out-param | `int pop(Stack*, int* out)`（实测） | 既要状态又要结果 |

**共同约定**：

- **内存所有权写进文档**：谁分配、谁释放、回调里的指针活多久
- 头文件守卫（`#ifndef`/`#pragma once`）；不需要外部的函数加 `static`
- 导出 API 用 `-fvisibility=hidden` + 显式标 `__attribute__((visibility("default")))`：实测 `.so` 里只导出想要的符号（`api_public`），内部函数不泄漏

**宏进阶**（实测）：`#x` 字符串化（`STR(1+2)` → `"1 + 2"`）、`a##b` 拼接（`CAT(x,y)` → `xy`）、`__VA_ARGS__` 可变成 `LOG(fmt, ...)`。

## 7. 工具链与调试

- **编译选项**：`-Wall -Wextra -Wpedantic`（写 C 至少这三件套；`-Wwrite-strings` 还能把"字符串字面量给 `char*`"变成警告）
- **标准选择**：`-std=c17`（严格 ISO）vs `-std=gnu17`（带 GNU/POSIX 扩展，gcc 默认）——见 §5④ 的坑
- **消毒器**（C/C++ 通用，强烈建议开发期常开）：
  - ASan：实测堆越界 `heap-buffer-overflow`（写 `a[4]`，数组只有 4 个元素）
  - 编译 `-fsanitize=address,undefined -g`；UBSan 抓未定义行为
- **静态/动态库**：`ar` 打 `.a`、`-fPIC -shared` 出 `.so`、`nm -D` 看导出符号、`ldd` 看依赖（细节见 C++ 的[编译链接](编译链接.md)篇）

## 8. 互操作：C ABI 与 `extern "C"`

**C++ 会做名字修饰（name mangling）**（`nm` 实测）：

```
C++ 里 int add(int,int) 的符号 → _Z3addii
C 里   int c_add(int,int) 的符号 → c_add
```

所以 **C++ 调 C 必须 `extern "C"`**：

```cpp
extern "C" int c_add(int a, int b);     // 按 C 的符号名找
```

实测：不加就链接失败（`undefined reference to c_add(int, int)`）；加上后 C 目标文件 + C++ 程序混编成功。

```bash
gcc -std=c17 -c cfunc.c -o cfunc.o
g++ -std=c++20 main.cpp cfunc.o -o app     # 直接混编
```

**跨语言边界的规则**（FFI/ctypes 同理）：

| 规则 | 原因 |
|------|------|
| 只传 **POD、指针、函数指针、`void*`** | 跨 ABI 只有这些布局是稳定的 |
| **异常不能穿过 C 栈帧** | C 代码没有异常表/清理逻辑 → 崩或 UB；跨 C 的 C++ 接口标 `noexcept` |
| **分配/释放必须同侧** | `new`↔`delete`、`malloc`↔`free`（实测混用被 ASan 抓） |
| 字符串用 `const char*` | `std::string` 跨边界不行；`.c_str()` 只在下次修改前有效 |
| 回调用"函数指针 + `void* user_data`" | C 没有闭包；C++ 的**不捕获 lambda** 可以转函数指针 |

**头文件双兼容**写法（C/C++ 都能 include）：

```c
#ifdef __cplusplus
extern "C" {
#endif
/* 声明... */
#ifdef __cplusplus
}
#endif
```

在 C++ 里包含纯 C 头文件：`extern "C" { #include <c_lib.h> }`（注意**只能包 C 头**——里面若再有 C++ 头会破坏其命名空间/模板）。

**FFI 类型映射**（Python ctypes 视角的常见对应）：

| C | Python ctypes | 备注 |
|---|--------------|------|
| `long long` / `int64_t` | `c_int64` | 打印用 `PRIi64` |
| `_Bool`/`int`（0/1） | `c_bool` / `c_int` | 别用 1 字节以外的假设 |
| `const char*` | `c_char_p` / `c_void_p` | 注意生命周期 |
| 函数指针 | `CFUNCTYPE` | 同回调约定 |
| 结构体 | `ctypes.Structure` | 字段顺序/对齐要与 C 一致 |

## 9. 标准版本

| 版本 | 关键新增 |
|------|---------|
| C89/C90 | 原始 ANSI C |
| C99 | 变长数组、`//` 注释、`long long`、指定初始化、柔性数组、`stdint.h`、`inline` |
| C11 | `_Generic`、`_Static_assert`、原子（`stdatomic.h`）、线程（`threads.h`）、匿名 struct/union |
| C17 | 修 bug 版（几乎无新特性） |
| C23 | `typeof`、`bool/true/false` 变关键字、`nullptr`、`auto` 类型推断（实测 gcc 13 的 `-std=c2x` 可用 typeof/bool/auto/nullptr） |

**C11 原子实测**：

```c
static _Atomic long counter = 0;
/* 4 线程各加 10 万 → 实测 400000（不会丢更新） */
```

对照 C++ 的 [C++11-14](C++11-14.md) / [C++17](C++17.md) / [C++20](C++20.md) / [C++23](C++23.md) 看——两边的内存模型基本对齐。

## 10. 要点回顾

1. **C++ 岗也躲不开 C**：CUDA kernel、库的 C API、FFI、读 C 源码——根因是 C ABI 稳定
2. **C 有 C++ 没有**：VLA、`_Generic`、`restrict`、复合字面量、乱序指定初始化、`void*` 隐式转换、柔性数组（编译对比实测）
3. **同名不同义**：`sizeof('a')`（4 vs 1）、`inline` 的链接语义（C99 无外部定义就链接失败）、`const` 不是常量表达式、`enum`/`struct` 要写关键字
4. **布局**：struct 按成员对齐 + 整体补齐（实测 sizeof=16、offset 0/4/8）；`offsetof` + `container_of` 能从成员指针反推结构体；柔性数组一次分配
5. **陷阱**：`strncpy` 不结尾（实测 strlen 越界 22）、`memcpy` 重叠用 `memmove`、`strtok` 不可重入改用 `strtok_r`、**`-std=c17` 下 POSIX 函数不可见（实测段错误）**、`atoi` 无错误检测用 `strtol`
6. **C 的工程套路**：不透明指针 + create/destroy（封装）、回调 + `void* user_data`、侵入式链表、错误处理三风格、分配/释放同侧
7. **工具链**：`-Wall -Wextra -Wpedantic` + `-std=gnu17`；**ASan/UBSan 开发期常开**（实测抓住越界与 `new`+`free` 混用）；`-fvisibility=hidden` 控制 `.so` 导出
8. **互操作靠 C ABI**：`extern "C"` 关掉名字修饰（`_Z3addii` vs `c_add`；不加就链接失败）；只传 POD/指针/回调；异常不能穿 C 栈帧；分配释放必须同侧
9. **版本**：C99（VLA/指定初始化/柔性数组）→ C11（`_Generic`/原子/线程）→ C23（`typeof`/bool 关键字/`nullptr`/`auto`）
