# MCP 与工具生态

MCP（Model Context Protocol）不是 Agent 框架，也不是“让模型直接调用某个 API”的 SDK。它标准化的是：

```text
Host（LLM 应用）
  → Client（每个 server 一个连接）
  → JSON-RPC 2.0
  → Server（提供 tools / resources / prompts）
```

模型仍然由 Host 调用；MCP 负责把外部能力和上下文以统一协议接进来。Agent 的循环、权限、重试仍由应用控制。工具调用的基础见 [Agent 与工具调用](02-Agent与工具调用.md)；结构校验见 [结构化输出](03-结构化输出.md)。

这篇按当前 MCP `2026-07-28` 讲角色、三个 primitives、协议字段、安全和落地，最后做一个最小 stdio server/client。

## 1. Host、Client、Server

| 角色 | 做什么 | 例子 |
|---|---|---|
| Host | 运行 LLM、管理对话和权限 | IDE、桌面应用、聊天客户端 |
| Client | 维护与一个 server 的连接 | Host 内部的连接器 |
| Server | 提供 tools/resources/prompts | 本地文件、数据库、SaaS 适配器 |

一个 Host 可以连多个 server；通常每个 server 一个 client。server 可以是本地进程，也可以是远程服务。

传输：

- **stdio**：本地子进程，按行分隔的 JSON-RPC；低延迟，适合本地工具。
- **Streamable HTTP**：远程服务，HTTP POST + 可选 SSE；支持标准 HTTP 认证，规范建议用 OAuth 获取 token。

MCP 和常见概念的分工：

- **function calling**：模型 API 层的“调用意图 + 参数”协议。
- **MCP**：应用和外部能力之间的连接协议；可以给模型提供工具，也可以提供资源和 prompt。
- **RAG**：检索上下文；RAG 可以作为 MCP server 的一个 resource/tool。
- **Agent**：决定下一步、循环、权限、失败恢复；MCP 只是它接工具的一种方式。

不要把 MCP 当成“更高级的 function calling”。两者在不同层，而且 MCP 不规定模型怎么选工具。

## 2. 三个 server primitives

| primitive | 谁控制 | 用途 | 方法 |
|---|---|---|---|
| Tools | 模型/应用 | 执行动作、查询 | `tools/list`、`tools/call` |
| Resources | 应用/用户 | 提供上下文数据 | `resources/list`、`resources/read` |
| Prompts | 用户 | 可复用提示模板 | `prompts/list`、`prompts/get` |

### Tools

工具是**模型可发起**的动作。server 用 `inputSchema` 描述参数，client 把它转成模型可用的工具定义。

工具可以返回：

- 文本/图片/音频等内容
- 资源链接或嵌入资源
- 结构化结果（`structuredContent`，可配 `outputSchema`）

工具设计要点：

- 名字稳定、唯一、可读；不要用空格/特殊字符。
- `description` 写清何时用、返回什么、有什么副作用。
- `inputSchema` 用 JSON Schema 2020-12；参数强类型、必填、`additionalProperties:false`。
- `outputSchema` 可选；有结构化结果时加，client 应校验。
- `annotations` 只是提示（`readOnlyHint`、`destructiveHint`、`idempotentHint` 等），**不可信**，不能拿来当权限判断。

### Resources

资源是**应用驱动**的上下文，不是动作。用 URI 标识，例如 `file:///project/README.md` 或自定义 `notes://...`。

- `resources/list` 列出可用资源
- `resources/read` 读取内容（文本或 base64 blob）
- `resources/templates/list` 暴露参数化 URI 模板
- 资源不存在返回 `-32602`，不要返回空 `contents` 掩盖错误
- 资源 URI、路径、权限都要在 server 端校验；`file://` 要防目录穿越

Resource 和 Tool 的区别：读一篇文档可以是 resource；执行搜索/写入可以是 tool。很多能力两边都能做，选哪个取决于交互模型和权限。

### Prompts

Prompt 是用户可选的模板，不是模型自动执行的工具。适合：

- 代码审查、总结、翻译等固定工作流
- few-shot 示例
- 带参数的提示模板

`prompts/list` 发现，`prompts/get` 取具体消息。不要让 prompt 绕过应用的工具权限。

## 3. 当前协议：2026-07-28

MCP 用 JSON-RPC 2.0。当前规范强调**无状态**：

- 每个请求在 `params._meta` 里带协议版本、客户端能力（必需）和客户端信息（建议）
- 必需的 `_meta` 字段缺失 → `-32602`
- server 不依赖同一连接上的前一个请求来推断上下文
- 需要跨请求的状态，用显式 ID/资源，不靠连接本身

`server/discover` 是 server 必须实现的方法，让 client 查询：

- `supportedVersions`
- `capabilities`（tools/resources/prompts 等）
- `serverInfo`（名称/版本，仅用于展示/日志，不可用于安全决策）

client 可以不先 discover，直接发请求；但 stdio 兼容旧 server 时，先发 discover 再回退到旧握手更稳。旧版 `initialize` 会话仍然可能出现在已有实现里，客户端要按版本文档做兼容。

响应结果带 `resultType`：

- `"complete"`：完成
- `"input_required"`：需要多轮输入（如 elicitation）
- 旧 server 可能没有 `resultType`，client 要按兼容规则处理

当前版本里 `sampling`/`logging` 已标记 deprecated；新实现优先 elicitation、直接接模型 API、stderr/OpenTelemetry。选型时不要照着旧教程硬套。

传输与认证：

- stdio：本地进程；凭据从环境/配置拿，不要把密钥写进工具参数
- Streamable HTTP：远程；用 OAuth/短期 token，按用户和租户做授权
- 不要把用户 token 原样透传给下游（token passthrough），这会把 confused deputy 风险放大

## 4. 工具定义与错误

一个工具定义的核心：

```json
{
  "name": "read_note",
  "title": "Read note",
  "description": "Read one note by id. Read-only; unknown ids return not_found.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "note_id": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,31}$"}
    },
    "required": ["note_id"],
    "additionalProperties": false
  },
  "annotations": {"readOnlyHint": true}
}
```

工具名建议 1～128 字符，只用字母、数字、下划线、连字符、点；同一个 server 内唯一。跨 server 聚合时要做命名空间，否则两个 `search` 会撞名。

MCP 有两种错误：

1. **协议错误**：请求结构/未知工具/未知方法，返回 JSON-RPC `error`
   - 未知工具：`-32602`
   - 未知方法：`-32601`
2. **工具执行错误**：参数业务校验失败、下游 API 失败，返回 `result` + `isError: true`
   - 模型可以根据错误内容修正参数后重试
   - 不要把内部堆栈/密钥放进错误文本

client 要验证工具结果，server 要验证工具输入；两边都不能因为“schema 写了”就跳过运行时检查。

## 5. 安全与权限

MCP 把外部能力接进来，安全边界比普通函数调用更大。规范强调用户同意、数据最小化、工具谨慎执行；协议本身不能替你完成授权。

最小防线：

- **用户同意**：显示将调用哪个 server/tool、参数是什么；写操作/敏感读取必须确认。
- **server 信任**：只接 allowlist 内的 server；记录来源/版本；远程 server 要评估供应链。
- **工具描述不可信**：tool description/annotations 可能来自恶意 server；不要据此放宽权限。
- **输入校验**：路径规范化、URI allowlist、SQL 参数化、命令参数数组、SSRF 防护。
- **最小权限**：按用户/租户授权，不用服务的超级账号；token 按 server/tool scope。
- **跨 server 隔离**：工具名冲突、数据泄漏、共享上下文都要隔离；不同 trust domain 不混。
- **人在回路**：高风险动作逐次确认；审批绑定具体 tool + 参数。
- **持久授权**：可以对该工具/该 server“始终允许”，但要有明确范围、可见开关、撤销入口和审计；不能默认开启或不可撤销地放行全部。
- **限流/超时/审计**：每个 server/tool 单独限流；记录调用、参数（脱敏）、结果、耗时。
- **输出清洗**：工具结果是不可信输入，可能含 prompt injection；不要让它改变系统指令或权限。

MCP 不是“装一个 server 就自动安全”。Host 才是权限和用户交互的最终执行点。

## 6. 工程落地

- **发现与缓存**：`server/discover` 有缓存；`tools/list`/`resources/list` 还有分页和缓存；按 TTL 和权限刷新。
- **渐进发现**：server 多时不要一次把所有工具塞进模型上下文；先按任务/权限筛，再加载。
- **命名空间**：`server.tool` 或前缀；记录 server 版本。
- **版本固定**：server 版本、协议版本、schema 版本都记录；升级前跑契约测试。
- **超时/取消**：tool call 要有 deadline；用户取消要传到 server；长任务用进度/显式任务 ID。
- **错误分类**：协议错误和工具执行错误分开；不要把 `isError` 当 JSON-RPC 错误。
- **测试**：用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 手工检查；再写契约、权限、超时、注入的自动测试。
- **观测**：按 server/tool 统计成功率、p95、错误码、token/成本；记录 trace id。
- **兼容**：旧 server 可能用 `initialize`；新 client 先 discover，再按版本回退。

## 7. 评测

MCP 接入的评测，不只看“模型会不会选工具”：

| 维度 | 指标 |
|---|---|
| 发现 | discover 成功、capabilities 正确、版本兼容 |
| 工具 | 选择正确率、参数合法率、未知工具处理 |
| 资源 | URI 正确、读取成功、权限拒绝正确 |
| 错误 | 协议错误 vs 执行错误分类、可恢复率 |
| 性能 | 发现/调用 p95、超时、限流 |
| 安全 | 越权/注入/跨租户/恶意 server 拦截 |
| 兼容 | 新旧协议、分页、缓存、断线重连 |

测试集要包含：未知工具、坏参数、资源不存在、路径穿越、超大输出、超时、权限拒绝、恶意 tool description、跨 server 重名。

## 8. 实验：最小 MCP stdio server/client

这个实验按 MCP `2026-07-28` 实现一个**最小子集**：

- JSON-RPC over stdio
- `server/discover`
- `tools/list`、`tools/call`
- `resources/list`、`resources/read`
- 每请求 `_meta`
- 只读工具、URI allowlist、两类错误

不是完整 MCP：没有 HTTP/OAuth、prompts、notifications、pagination、elicitation、sampling，也没有真实 LLM。目的是看清协议边界，不是做兼容性认证。

??? note "代码：最小 MCP stdio server/client"
    ```python
    import json
    import re
    import subprocess
    import sys
    import urllib.parse


    PROTOCOL = "2026-07-28"
    SERVER_INFO = {"name": "notes-mcp", "version": "1.0.0"}
    CLIENT_INFO = {"name": "demo-client", "version": "1.0.0"}

    NOTES = {
        "launch-aurora": "Project Aurora launch code: ZX-4471. Owner: platform team.",
        "launch-borealis": "Project Borealis launch code: QK-8820. Owner: data team.",
    }

    TOOLS = {
        "search_notes": {
            "title": "Search notes",
            "description": "Search the read-only note store. Returns matching note ids and snippets.",
            "inputSchema": {
                "type": "object",
                "properties": {"query": {"type": "string", "minLength": 2, "maxLength": 80}},
                "required": ["query"],
                "additionalProperties": False,
            },
            "readOnlyHint": True,
        },
        "read_note": {
            "title": "Read note",
            "description": "Read one note by id. Only ids in the local note store are allowed.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "string", "pattern": r"[a-z0-9][a-z0-9-]{0,31}"}
                },
                "required": ["note_id"],
                "additionalProperties": False,
            },
            "readOnlyHint": True,
        },
    }

    RESOURCES = {
        "notes://launch-aurora": {
            "name": "launch-aurora",
            "title": "Aurora launch note",
            "mimeType": "text/plain",
        },
        "notes://launch-borealis": {
            "name": "launch-borealis",
            "title": "Borealis launch note",
            "mimeType": "text/plain",
        },
    }


    def ok(request_id, result):
        result.setdefault("resultType", "complete")
        result.setdefault("_meta", {"io.modelcontextprotocol/serverInfo": SERVER_INFO})
        return {"jsonrpc": "2.0", "id": request_id, "result": result}


    def rpc_error(request_id, code, message, data=None):
        error = {"code": code, "message": message}
        if data is not None:
            error["data"] = data
        return {"jsonrpc": "2.0", "id": request_id, "error": error}


    def validate_meta(params):
        meta = params.get("_meta", {})
        if "io.modelcontextprotocol/protocolVersion" not in meta:
            return "missing protocolVersion"
        if "io.modelcontextprotocol/clientCapabilities" not in meta:
            return "missing clientCapabilities"
        return None


    def check_tool_args(tool_name, args):
        schema = TOOLS[tool_name]["inputSchema"]
        if not isinstance(args, dict):
            return "arguments must be an object"
        extra = set(args) - set(schema["properties"])
        if extra:
            return f"unexpected argument(s): {sorted(extra)}"
        for key in schema["required"]:
            if key not in args:
                return f"missing argument: {key}"
        for key, spec in schema["properties"].items():
            if key not in args:
                continue
            value = args[key]
            if spec["type"] == "string":
                if not isinstance(value, str):
                    return f"{key} must be a string"
                if len(value) < spec.get("minLength", 0):
                    return f"{key} is too short"
                if "maxLength" in spec and len(value) > spec["maxLength"]:
                    return f"{key} is too long"
                if "pattern" in spec and not re.fullmatch(spec["pattern"], value):
                    return f"{key} does not match pattern"
        return None


    def call_tool(name, args):
        if name not in TOOLS:
            return None, -32602, f"Unknown tool: {name}"
        problem = check_tool_args(name, args)
        if problem:
            return {"content": [{"type": "text", "text": problem}], "isError": True}, None, None
        if name == "search_notes":
            q = args["query"].lower()
            hits = [
                f"{note_id}: {text}"
                for note_id, text in NOTES.items()
                if q in text.lower()
            ]
            text = "\n".join(hits) if hits else "no matches"
        else:
            note_id = args["note_id"]
            if note_id not in NOTES:
                return {"content": [{"type": "text", "text": "note not found"}], "isError": True}, None, None
            text = NOTES[note_id]
        return {"content": [{"type": "text", "text": text}], "isError": False}, None, None


    def handle(request):
        if request.get("jsonrpc") != "2.0" or "id" not in request:
            return rpc_error(request.get("id"), -32600, "Invalid Request")
        request_id = request["id"]
        method = request.get("method")
        params = request.get("params", {})
        problem = validate_meta(params)
        if problem:
            return rpc_error(request_id, -32602, problem)

        version = params["_meta"]["io.modelcontextprotocol/protocolVersion"]
        if method != "server/discover" and version != PROTOCOL:
            return rpc_error(request_id, -32022, "Unsupported protocol version",
                             {"supportedVersions": [PROTOCOL]})

        if method == "server/discover":
            return ok(request_id, {
                "supportedVersions": [PROTOCOL],
                "capabilities": {"tools": {"listChanged": False}, "resources": {}},
                "instructions": "Read-only notes demo server.",
                "ttlMs": 3600000,
                "cacheScope": "public",
            })

        if method == "tools/list":
            tools = []
            for name, spec in TOOLS.items():
                item = {k: v for k, v in spec.items() if k != "readOnlyHint"}
                item["annotations"] = {"readOnlyHint": spec["readOnlyHint"]}
                tools.append({"name": name, **item})
            return ok(request_id, {"tools": tools, "ttlMs": 300000, "cacheScope": "public"})

        if method == "tools/call":
            name = params.get("name")
            args = params.get("arguments", {})
            result, code, message = call_tool(name, args)
            if code is not None:
                return rpc_error(request_id, code, message)
            return ok(request_id, result)

        if method == "resources/list":
            resources = [
                {"uri": uri, "name": info["name"], "title": info["title"], "mimeType": info["mimeType"]}
                for uri, info in RESOURCES.items()
            ]
            return ok(request_id, {"resources": resources, "ttlMs": 300000, "cacheScope": "public"})

        if method == "resources/read":
            uri = params.get("uri", "")
            parsed = urllib.parse.urlparse(uri)
            if parsed.scheme != "notes" or uri not in RESOURCES:
                return rpc_error(request_id, -32602, "Resource not found", {"uri": uri})
            note_id = parsed.netloc
            return ok(request_id, {
                "contents": [{"uri": uri, "mimeType": "text/plain", "text": NOTES[note_id]}],
                "ttlMs": 60000,
                "cacheScope": "private",
            })

        return rpc_error(request_id, -32601, f"Method not found: {method}")


    def serve():
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                response = rpc_error(None, -32700, "Parse error")
            else:
                response = handle(request)
            sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()


    class Client:
        def __init__(self):
            self.proc = subprocess.Popen(
                [sys.executable, __file__, "--server"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            self.next_id = 0

        def request(self, method, params=None):
            self.next_id += 1
            params = dict(params or {})
            params["_meta"] = {
                "io.modelcontextprotocol/protocolVersion": PROTOCOL,
                "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
                "io.modelcontextprotocol/clientCapabilities": {},
            }
            message = {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}
            self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.proc.stdin.flush()
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(self.proc.stderr.read())
            return json.loads(line)

        def close(self):
            self.proc.stdin.close()
            self.proc.wait(timeout=5)


    def text(result):
        return result["result"]["content"][0]["text"]


    def main():
        client = Client()
        try:
            discover = client.request("server/discover")["result"]
            print("discover:", discover["supportedVersions"], discover["_meta"]["io.modelcontextprotocol/serverInfo"])

            tools = client.request("tools/list")["result"]["tools"]
            print("tools:", [(t["name"], t["annotations"]["readOnlyHint"]) for t in tools])

            search = client.request("tools/call", {
                "name": "search_notes", "arguments": {"query": "Aurora launch code"}
            })
            print("search_notes:", text(search))

            read = client.request("tools/call", {
                "name": "read_note", "arguments": {"note_id": "launch-aurora"}
            })
            print("read_note:", text(read))

            resources = client.request("resources/list")["result"]["resources"]
            print("resources:", [r["uri"] for r in resources])

            resource = client.request("resources/read", {"uri": "notes://launch-aurora"})
            print("read resource:", resource["result"]["contents"][0]["text"])

            blocked_resource = client.request("resources/read", {"uri": "notes://../etc/passwd"})
            print("blocked resource:", blocked_resource["error"])

            blocked_tool = client.request("tools/call", {
                "name": "delete_note", "arguments": {"note_id": "*"}
            })
            print("blocked tool:", blocked_tool["error"])

            bad_arg = client.request("tools/call", {
                "name": "read_note", "arguments": {"note_id": "../etc/passwd"}
            })
            print("bad arg:", bad_arg["result"]["content"][0]["text"],
                  "isError=", bad_arg["result"]["isError"])
        finally:
            client.close()


    if __name__ == "__main__":
        if "--server" in sys.argv:
            serve()
        else:
            main()
    ```

输出：

```text
discover: ['2026-07-28'] {'name': 'notes-mcp', 'version': '1.0.0'}
tools: [('search_notes', True), ('read_note', True)]
search_notes: launch-aurora: Project Aurora launch code: ZX-4471. Owner: platform team.
read_note: Project Aurora launch code: ZX-4471. Owner: platform team.
resources: ['notes://launch-aurora', 'notes://launch-borealis']
read resource: Project Aurora launch code: ZX-4471. Owner: platform team.
blocked resource: {'code': -32602, 'message': 'Resource not found', 'data': {'uri': 'notes://../etc/passwd'}}
blocked tool: {'code': -32602, 'message': 'Unknown tool: delete_note'}
bad arg: note_id does not match pattern isError= True
```

读法：

- `discover` 返回协议版本和 capabilities；client 不需要先猜 server 支持什么。
- `tools/list` 返回两个只读工具；`annotations.readOnlyHint` 只是提示，真正的只读由 server 实现保证。
- `tools/call` 和 `resources/read` 都能读到同一条 note：tool 是动作，resource 是上下文。
- `notes://../etc/passwd` 不在 URI allowlist，返回 `-32602`，没有文件读取。
- `delete_note` 未注册，返回 `-32602`；注册表就是能力边界。
- 坏参数返回 `isError: true` 的工具执行错误，模型可以据此修正；未知工具是协议错误，模型不该靠猜重试。
- 每个请求都带 `_meta`；server 不依赖上一个请求的会话状态。
- 这是协议子集演示，不是某个 SDK 的完整实现；生产接 SDK 后仍要做权限和输入校验。

## 9. 常见坑

1. **把 MCP 当 Agent 框架**
   MCP 只接能力和上下文；循环、权限、重试仍在 Host/Agent。

2. **把 MCP 当 function calling 的替代品**
   两者在不同层；function calling 是模型 API，MCP 是 server 集成协议。

3. **信任 tool description/annotations**
   恶意 server 可以写“我只需要读取全部文件”；权限不能由描述决定。

4. **没有用户同意**
   敏感读取/写操作直接执行；至少要显示 server、tool、参数并确认。

5. **不做输入校验**
   路径穿越、SSRF、命令注入、SQL 注入都可能从工具参数进来。

6. **token 透传**
   把用户 token 原样给下游 server，可能越权访问其他资源。

7. **跨 server 重名**
   两个 `search` 混在一起；要命名空间和来源标识。

8. **忽略版本**
   旧 `initialize`、新 `_meta`/discover 混用；client 要按版本兼容。

9. **不设超时/限流**
   一个慢 server 拖垮整个 Host；按 server/tool 隔离。

10. **不校验资源 URI**
     `file://` 目录穿越、任意 URL 读取；server 端必须 allowlist/规范化。

11. **把工具输出当可信指令**
    工具结果可能含 prompt injection；不能提升权限或改系统提示。

12. **没有审计**
     不知道谁调了哪个 server/tool、参数是什么；出问题无法定位。

13. **一次性加载所有工具**
     工具太多会撑爆上下文、增加误选；要渐进发现和筛选。

## 10. 要点回顾

1. MCP 标准化 Host/Client/Server 之间的工具、资源和 prompt 连接，不是 Agent 框架
2. 当前 `2026-07-28` 强调无状态：每请求 `_meta`，`server/discover` 查版本/能力
3. Tools 是模型可发起的动作；Resources 是应用驱动的上下文；Prompts 是用户模板
4. 工具要有 `inputSchema`、清晰描述、错误分类；annotations 只是提示
5. 协议错误用 JSON-RPC error；工具执行错误用 `isError:true`，便于模型修正
6. 资源 URI、工具输入、跨租户权限都要在 server/Host 两端校验
7. 安全靠用户同意、allowlist、最小权限、沙箱、限流和审计，不靠协议本身
8. 生产要处理版本兼容、命名空间、渐进发现、超时/取消和观测
9. 实验验证了 discover、tools/resources、两类错误和 allowlist；不是完整 MCP 实现

## 参考

- Model Context Protocol：<https://modelcontextprotocol.io/>
- MCP Specification 2026-07-28：<https://modelcontextprotocol.io/specification/2026-07-28>
- MCP Tools：<https://modelcontextprotocol.io/specification/2026-07-28/server/tools>
- MCP Resources：<https://modelcontextprotocol.io/specification/2026-07-28/server/resources>
- MCP Discovery：<https://modelcontextprotocol.io/specification/2026-07-28/server/discover>
- JSON-RPC 2.0：<https://www.jsonrpc.org/specification>
- MCP Inspector：<https://github.com/modelcontextprotocol/inspector>
- MCP Reference Servers：<https://github.com/modelcontextprotocol/servers>
- 工具参数校验：[Agent 与工具调用](02-Agent与工具调用.md)
- 结构化输出：[结构化输出](03-结构化输出.md)
