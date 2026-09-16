# 核心：Target

**现代 CMake 只有一条主线：一切围绕 target。**

## 1. 什么是 target

target 是构建产物：可执行文件、库。

```cmake
add_executable(app main.cpp)                  # 可执行文件
add_library(mylib STATIC src/a.cpp)           # 静态库
add_library(mylib SHARED src/a.cpp)           # 动态库（STATIC/SHARED 二选一）
add_library(header_only INTERFACE)            # 纯头文件库（无源文件）
target_include_directories(header_only INTERFACE include)
```

## 2. target_* 命令（现代写法）

把"include 目录、依赖、编译选项、宏"**挂到 target 上**，并自动传播给使用者：

```cmake
target_include_directories(mylib PUBLIC include)

target_compile_options(mylib PRIVATE -Wall -Wextra)

target_compile_definitions(mylib PRIVATE VERSION=1)

target_compile_features(mylib PUBLIC cxx_std_17)      # 比设 CMAKE_CXX_STANDARD 更好

target_link_libraries(mylib PUBLIC fmt::fmt)

target_sources(mylib PRIVATE src/b.cpp)

set_target_properties(mylib PROPERTIES CXX_VISIBILITY_PRESET hidden)
```

## 3. PUBLIC / PRIVATE / INTERFACE

决定属性**是否传播给使用者**：

| 关键字 | 自己用 | 传给别人 |
|--------|:------:|:--------:|
| `PRIVATE` | ✅ | ❌ |
| `PUBLIC` | ✅ | ✅ |
| `INTERFACE` | ❌ | ✅ |

**例子**：

```cmake
# mylib 的公共头文件里 #include <fmt/format.h>
# → 用 mylib 的人也需要 fmt 的头文件
target_link_libraries(mylib PUBLIC fmt::fmt)            # 传下去 ✅

# mylib 内部用 pthread，但头文件不暴露 pthread
target_link_libraries(mylib PRIVATE Threads::Threads)   # 不传 ✅
```

**判断法则**：

- 出现在**公共头文件**里的依赖 → `PUBLIC`
- 只在 **.cpp 内部**用的 → `PRIVATE`
- 只有头文件的库 → `INTERFACE`

**用错后果**：该 `PUBLIC` 写成 `PRIVATE` → 使用者编译/链接报错（找不到头文件 / `undefined reference`）。

## 4. 属性的传递性

```
app ──link──→ mylib ──PUBLIC──→ fmt
```

`app` 链接 `mylib` 后，**自动获得** fmt 的 include 和链接（因为 mylib 用 PUBLIC 传了）。

这就是现代 CMake 的威力：**使用者只写一行 `target_link_libraries(app PRIVATE mylib)`，include/依赖全自动**。

## 5. ALIAS（别名 target）

```cmake
add_library(mylib src/a.cpp)
add_library(MyLib::mylib ALIAS mylib)     # 起别名
```

- 库自己内部用 `mylib`
- 外部/导出后用 `MyLib::mylib`（带命名空间）
- 好处：**消费侧写法一致**（不管 add_subdirectory 还是 find_package，都写 `MyLib::mylib`）

常见的 `fmt::fmt`、`Qt5::Core` 就是 ALIAS / IMPORTED target 的命名空间。

## 6. 查询属性

```cmake
get_target_property(OUT mylib TYPE)
message(${OUT})
```

## 7. 反面教材（旧写法，别用）

```cmake
include_directories(include)          # ❌ 全局，影响所有 target
link_libraries(foo)                   # ❌ 全局
set(CMAKE_CXX_FLAGS "-Wall")          # ❌ 全局
add_definitions(-DX)                  # ❌ 全局
```

**问题**：作用在目录级，影响所有 target，不传播、不可控。**一律用 `target_*`**。

## 8. 一句话

> target 自带 include / 依赖 / 选项，通过 `PUBLIC/PRIVATE/INTERFACE` 决定是否传播；使用者 `target_link_libraries` 一行搞定。
