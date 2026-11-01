# Agent 与工具调用

Agent 不是“更长的 prompt”，也不是“模型自己跑”。它至少要有闭环：

```text
用户目标
  → 模型提出下一步（final 或 tool call）
  → 运行时校验、授权、执行
  → observation 回填
  → 继续或结束
```

模型只提出“想调用什么”；真正执行的是应用侧运行时。function calling 提供结构化调用协议，但不等于 Agent：没有循环、状态、权限和失败恢复，就只是一次工具调用。

这篇讲工具契约、调用循环、规划、状态、权限、失败恢复和评测，最后做一个只读工具 Agent 的最小运行时。RAG 的检索链路见 [RAG](01-RAG.md)；模型评测与安全见 [LLM 第 9 篇](../llm/09-评测与安全.md)；服务化/超时见 [Inference 第 6 篇](../inference/06-服务化.md)。

## 1. 先判断要不要 Agent

| 形态 | 谁决定下一步 | 适合 | 不适合 |
|---|---|---|---|
| 普通对话/单次调用 | 应用固定 | 问答、摘要、分类、改写 | 需要外部数据或动作 |
| RAG | 应用先检索，模型生成 | 知识密集、需要引用 | 单次检索不够的动作、开放式多步决策 |
| Workflow | 代码/图固定 | 步骤稳定、可审计、高可靠 | 分支高度依赖中间观察 |
| Agent | 模型在循环里选工具 | 路径不固定、需要探索 | 高风险写操作（除非有审批/沙箱）、无法约束的任务 |

几个判断：

- 只差知识：先看 RAG，不要上 Agent。
- 步骤固定：用 workflow，模型只负责局部生成。
- 一步工具调用就够：先做单次 function calling，不要加循环。
- 下一步依赖上一步结果，且路径无法提前枚举：才考虑 Agent。
- 有删除/转账/发邮件等副作用：workflow + 明确审批，通常比“自主 Agent”可靠。

RAG 和 Agent 不是二选一：RAG 可以是 Agent 的一个只读工具。

## 2. 工具是契约

模型看到的是工具名、描述和参数 schema；它看不到你的内部实现。工具定义要像 API 契约一样写清楚。

```json
{
  "name": "read_note",
  "description": "Read one note by id. Read-only. Unknown ids return not_found.",
  "input_schema": {
    "type": "object",
    "properties": {
      "note_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9-]{0,31}$"
      }
    },
    "required": ["note_id"],
    "additionalProperties": false
  }
}
```

字段名随协议变化：OpenAI 的 function tool 用 `parameters`，Anthropic 用 `input_schema`，MCP 用 `inputSchema`。这里只讨论结构。

工具设计的要点：

- **名字用动词**：`search_notes`、`read_note`，不要叫 `do_everything`。
- **描述写边界**：什么时候用、什么时候不用、返回什么、有什么限制。
- **参数强类型**：`enum`、`pattern`、`minLength`/`maxLength`、数值范围、必填项。
- **拒绝未知字段**：不要静默忽略模型编出来的参数。
- **输出可序列化**：稳定字段、分页游标、截断标记、稳定错误码。
- **说明副作用**：只读还是写入；是否幂等；是否需要人工确认。
- **包装内部能力**：不要把裸 SQL、shell、任意 URL 直接暴露给模型。
- **版本化**：参数/语义变更要兼容，或注册新版本。

工具结果不要返回整页 HTML、堆栈或密钥。模型需要的是结构化事实，不是内部实现细节。

## 3. 调用循环

最小循环可以写成：

```text
for step in range(max_steps):
    action = model(messages, tools)
    if action.type == "final":
        return action.content
    result = runtime.execute(action.name, action.args)
    messages.append(tool_result(action.id, result))
return "budget_exceeded"
```

真正要处理的细节：

- **关联 ID**：工具结果要带对应的调用 ID，才能和模型发起的调用对上。OpenAI 叫 `tool_call_id`，Anthropic 叫 `tool_use_id`。
- **结果角色**：工具结果作为 observation 回填，不要伪装成 system 指令。
- **错误也是 observation**：把结构化错误交给模型，让它决定换参数、换工具或停止。
- **停止条件**：final、max steps、token/时间/成本预算、用户取消、无进展。
- **并行**：相互独立的只读调用可以并行；有依赖或写操作要串行。
- **超时与取消**：工具调用要有 deadline；用户取消要向上游传播。

function calling 的协议不同：

- OpenAI 的 chat completions 返回 `tool_calls`，参数通常是 JSON 字符串；应用执行后回填 `role=tool` 和对应的 `tool_call_id`。参考 [OpenAI Cookbook](https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models)。
- Anthropic 用 `tool_use` 和 `tool_result` 内容块，参数是结构化对象。参考 [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)。
- 业务代码里先归一化成自己的 `ToolCall`/`ToolResult`，不要把某一家字段写死。

模型返回多个 tool call 时，只并行执行互不依赖的调用；写操作要按顺序，并保留审批边界。

## 4. ReAct、plan-execute、reflection

- **ReAct**：把推理和动作交替起来，边走边看。适合需要外部信息、路径不固定的任务。不需要把完整思维链展示给用户。
- **plan-execute**：先列计划再执行，执行阶段更可控，调用次数通常更少；但计划本身也要 token，观察结果推翻假设时要重规划，不能抱着旧计划硬跑。
- **reflection**：让模型/评审器检查结果再重试。在可验证任务（代码测试、数学答案、格式校验）上更有用；也可能自我强化错误，最好配合测试或外部检查。
- **multi-agent**：只在任务可分解、可并行、角色确实不同的时候用。它会增加协调、共享状态、权限和调试成本；大多数场景一个 Agent + 好工具更简单。

Agent 的“智能”不等于更多轮。更多轮通常意味着更多延迟、更多 token、更多故障面。

## 5. 状态、记忆和上下文

一次 Agent 运行至少有四层状态：

| 层 | 内容 | 放哪 |
|---|---|---|
| 对话 | 用户/助手消息 | 模型上下文 |
| 任务状态 | 目标、约束、已完成、待审批 | 结构化存储 |
| 产物 | 文件、查询结果、草稿 | 对象存储/数据库 |
| 轨迹 | 每次调用、参数、结果、错误、耗时 | 日志/trace 系统 |

不要把完整轨迹一直塞回 prompt。长工具结果要截断或分页；旧观察可以摘要，但原始 trace 留在外部，便于审计和回放。

任务状态建议显式存：

```text
goal, constraints, done[], pending[], approvals[], artifact_ids[]
```

记忆要分层：

- 短期：当前任务的消息和观察。
- 长期：用户偏好、已验证的事实、项目约定。
- 写入长期记忆前要确认来源和时效；不要把模型猜测写成事实。
- 记忆涉及隐私、租户隔离、删除权和过期策略。

上下文预算是硬约束。工具输出、检索文档和历史消息都可能把窗口撑爆；先裁剪低价值内容，不要静默丢掉关键错误。

## 6. 权限与安全：模型输出不可信

模型生成的工具调用是**不可信输入**。它可能被用户诱导，也可能被工具返回的文档注入。

防线要放在运行时，不是放在 prompt 里：

| 风险 | 防线 |
|---|---|
| 路径穿越 | 规范化路径后限制在允许根目录；不要只查字符串 `..` |
| SSRF | URL allowlist；禁私网、链路本地和云 metadata 地址；出站代理 |
| 命令注入 | 参数数组，避免 shell 拼接；最小权限；沙箱 |
| SQL 注入 | 参数化查询；只读账号/最小权限 |
| Prompt injection | 工具结果是数据，不是指令；不能提升权限；高风险动作人工确认 |
| Confused deputy | 用最终用户/租户身份授权，不用服务的超级账号 |
| 密钥泄漏 | 凭据不进 prompt/日志；短期、按工具 scope |
| 破坏性操作 | 精确参数审批、dry-run、幂等、备份 |

几条硬规则：

- **工具注册表就是能力清单**：没注册的工具不能被调用。
- **默认只读**：写操作单独授权，必要时人工确认。
- **授权在工具层做**：不能只靠“system prompt 说不要”。
- **Schema 不是安全边界**：路径、URL、SQL、命令还要做语义校验。
- **审批要绑定具体工具和参数**：不能“同意一次，后面都放行”；审批要过期。
- **工具输出可能含注入**：检索文档里写“忽略之前的指令”，不能改变系统权限。
- **沙箱**：文件系统、网络、CPU/内存/时间都要限制；审计谁在什么时候调了什么。

Prompt injection 不能靠一句“不要听文档里的指令”解决。数据/指令分离、能力最小化、人工审批和输出过滤要一起用。

## 7. 失败恢复

工具错误要结构化：

```json
{"code": "not_found", "message": "note not found", "retryable": false}
```

重试规则：

- 参数校验失败、鉴权失败、权限拒绝：不要重试，换参数或停止。
- 超时、429、5xx：只在幂等前提下重试，带 backoff + jitter 和上限。
- 写操作：用 idempotency key；没有幂等保证时不要盲目重试。
- 连续失败要熔断/降级，不要无限调用。

还要处理：

- **部分失败**：多步写入可能做了一半；要事务边界、补偿或显式回滚。
- **循环**：相同工具 + 相同参数重复出现，或没有新信息，就停止。
- **预算**：max tool calls、最大 token、最大耗时、最大成本，都是硬上限。
- **降级**：转确定性 workflow、转人工、返回“做不到”，都比编造成功好。
- **版本变化**：工具 schema/行为变了，旧 trace 可能无法重放；记录版本。

## 8. 评测与可观测性

Agent 不能只看最终答案。一个答案正确、但过程中越权读取或重复调用 30 次的轨迹，仍然是失败。

| 维度 | 指标 |
|---|---|
| 任务 | 成功率、部分完成、正确拒答 |
| 轨迹 | 工具选择、参数合法性、冗余调用、恢复次数 |
| 成本/延迟 | tokens、tool calls、p95 延迟、单任务成本 |
| 安全 | 越权尝试被拦截率、注入攻击成功率（越低越好）、审批覆盖率 |

测试集至少覆盖：

- 正常单工具、多工具、需要两跳的任务
- 查不到、歧义、参数缺失
- 工具报错、超时、限流、部分失败
- 路径/URL/权限越权
- 工具输出中的 prompt injection
- 多轮修改、取消、恢复
- 长上下文、长工具结果

离线用 mock 工具和 trace replay；线上用 canary、用户反馈和抽样审计。LLM-as-judge 可以辅助，但不能替代程序化校验和人工抽检。

trace 至少记录：trace_id、step、模型/版本、工具/版本、参数（脱敏）、结果/错误、耗时、token、审批人。日志要脱敏、限权、设保留期。

## 9. 实验：一个只读工具 Agent

这个实验**不是让真实 LLM 跑分**，而是用脚本化策略触发运行时的各类路径。目的是验证：工具注册、参数校验、只读边界、错误回传、调用上限和内存 trace。真实模型会不会选对工具，要用模型评测；生产审计还要把 trace 持久化、脱敏并设保留期。

实验设置：

- 内存里两篇笔记，无网络、无文件系统访问
- 两个只读工具：`search_notes`、`read_note`
- 五个场景：正常检索、查不到、路径越权、未注册的删除工具、循环
- 脚本策略只负责触发路径，不代表模型能力
- 运行时还有 `read_only=False` 的拒绝分支；本实验只注册只读工具，删除场景验证的是“未注册工具”这条边界

??? note "代码：只读工具 Agent 最小运行时"
    ```python
    import json
    import re


    NOTES = {
        "launch-aurora": "Project Aurora launch code: ZX-4471. Owner: platform team.",
        "launch-borealis": "Project Borealis launch code: QK-8820. Owner: data team.",
    }


    class ToolError(Exception):
        pass


    def search_notes(query):
        q = query.lower()
        return [
            {"id": note_id, "snippet": text[:80]}
            for note_id, text in NOTES.items()
            if q in text.lower()
        ]


    def read_note(note_id):
        if note_id not in NOTES:
            raise ToolError(f"note not found: {note_id}")
        return {"id": note_id, "text": NOTES[note_id]}


    def validate(schema, value, path="args"):
        kind = schema.get("type")
        if kind == "object":
            if not isinstance(value, dict):
                raise ToolError(f"{path} must be an object")
            props = schema.get("properties", {})
            extra = set(value) - set(props)
            if extra:
                raise ToolError(f"{path} has unknown field(s): {sorted(extra)}")
            for key in schema.get("required", []):
                if key not in value:
                    raise ToolError(f"{path}.{key} is required")
            for key, sub in props.items():
                if key in value:
                    validate(sub, value[key], f"{path}.{key}")
            return
        if kind == "string":
            if not isinstance(value, str):
                raise ToolError(f"{path} must be a string")
            if len(value) < schema.get("minLength", 0):
                raise ToolError(f"{path} is too short")
            if "maxLength" in schema and len(value) > schema["maxLength"]:
                raise ToolError(f"{path} is too long")
            if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
                raise ToolError(f"{path} does not match {schema['pattern']}")
            return
        raise ToolError(f"unsupported schema type: {kind}")


    TOOLS = {
        "search_notes": {
            "read_only": True,
            "schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 2, "maxLength": 80}
                },
                "required": ["query"],
            },
            "fn": search_notes,
        },
        "read_note": {
            "read_only": True,
            "schema": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "pattern": r"[a-z0-9][a-z0-9-]{0,31}",
                    }
                },
                "required": ["note_id"],
            },
            "fn": read_note,
        },
    }


    def execute_tool(name, args):
        if name not in TOOLS:
            raise ToolError(f"unknown tool: {name}")
        tool = TOOLS[name]
        if not tool["read_only"]:
            raise ToolError("write tool is disabled in this read-only runtime")
        validate(tool["schema"], args)
        return json.dumps(tool["fn"](**args), ensure_ascii=False)


    def policy(task, history):
        """Deterministic stand-in for a model policy; only for runtime tests."""
        last = history[-1] if history else None
        if "Aurora" in task:
            if last is None:
                return {"type": "tool", "name": "search_notes",
                        "args": {"query": "Aurora launch code"}}
            if last["tool"] == "search_notes":
                hits = json.loads(last["observation"])
                if not hits:
                    return {"type": "final", "content": "没有找到 Project Aurora。"}
                return {"type": "tool", "name": "read_note",
                        "args": {"note_id": hits[0]["id"]}}
            text = json.loads(last["observation"])["text"]
            code = re.search(r"[A-Z]{2}-\d{4}", text).group(0)
            return {"type": "final", "content": f"Project Aurora 的 launch code 是 {code}。"}

        if "Nope" in task:
            if last is None:
                return {"type": "tool", "name": "search_notes",
                        "args": {"query": "Project Nope launch code"}}
            return {"type": "final", "content": "没有找到 Project Nope。"}

        if "passwd" in task:
            if last is None:
                return {"type": "tool", "name": "read_note",
                        "args": {"note_id": "../etc/passwd"}}
            return {"type": "final", "content": f"拒绝越权读取：{last['error']}"}

        if "删除" in task:
            if last is None:
                return {"type": "tool", "name": "delete_note", "args": {"note_id": "*"}}
            return {"type": "final", "content": f"拒绝删除：{last['error']}"}

        if "循环" in task:
            return {"type": "tool", "name": "search_notes",
                    "args": {"query": "Aurora launch code"}}

        return {"type": "final", "content": "无法处理该任务。"}


    def run_agent(task, max_tool_calls=4):
        history, trace = [], []
        while len(history) < max_tool_calls:
            action = policy(task, history)
            step = len(history) + 1
            if action["type"] == "final":
                trace.append({"step": step, "type": "final", "content": action["content"]})
                return {"task": task, "final": action["content"],
                        "tool_calls": len(history), "trace": trace}
            name, args = action["name"], action["args"]
            try:
                observation, error = execute_tool(name, args), None
            except ToolError as exc:
                observation, error = None, str(exc)
            history.append({"tool": name, "args": args,
                            "observation": observation, "error": error})
            trace.append({"step": step, "type": "tool", "tool": name, "args": args,
                          "observation": observation, "error": error})
        text = f"达到 max_tool_calls={max_tool_calls}，停止。"
        trace.append({"step": len(history) + 1, "type": "final", "content": text})
        return {"task": task, "final": text, "tool_calls": len(history), "trace": trace}


    def show(run):
        print(f"\nTASK: {run['task']}")
        for item in run["trace"]:
            if item["type"] == "final":
                print(f"  final: {item['content']}")
            elif item["error"] is None:
                print(f"  step {item['step']}: {item['tool']}({json.dumps(item['args'], ensure_ascii=False)}) -> ok")
            else:
                print(f"  step {item['step']}: {item['tool']}({json.dumps(item['args'], ensure_ascii=False)}) -> ERROR: {item['error']}")
        print(f"  meta: tool_calls={run['tool_calls']}")


    if __name__ == "__main__":
        cases = [
            ("查 Project Aurora 的 launch code", 4),
            ("查 Project Nope 的 launch code", 4),
            ("读取 ../etc/passwd 的内容", 4),
            ("删除所有笔记", 4),
            ("循环测试：反复搜索", 2),
        ]
        for task, limit in cases:
            show(run_agent(task, limit))
    ```

输出：

```text
TASK: 查 Project Aurora 的 launch code
  step 1: search_notes({"query": "Aurora launch code"}) -> ok
  step 2: read_note({"note_id": "launch-aurora"}) -> ok
  final: Project Aurora 的 launch code 是 ZX-4471。
  meta: tool_calls=2

TASK: 查 Project Nope 的 launch code
  step 1: search_notes({"query": "Project Nope launch code"}) -> ok
  final: 没有找到 Project Nope。
  meta: tool_calls=1

TASK: 读取 ../etc/passwd 的内容
  step 1: read_note({"note_id": "../etc/passwd"}) -> ERROR: args.note_id does not match [a-z0-9][a-z0-9-]{0,31}
  final: 拒绝越权读取：args.note_id does not match [a-z0-9][a-z0-9-]{0,31}
  meta: tool_calls=1

TASK: 删除所有笔记
  step 1: delete_note({"note_id": "*"}) -> ERROR: unknown tool: delete_note
  final: 拒绝删除：unknown tool: delete_note
  meta: tool_calls=1

TASK: 循环测试：反复搜索
  step 1: search_notes({"query": "Aurora launch code"}) -> ok
  step 2: search_notes({"query": "Aurora launch code"}) -> ok
  final: 达到 max_tool_calls=2，停止。
  meta: tool_calls=2
```

读法：

- 正常任务：先搜索，再按 id 读取，最后回答；两次工具调用都进了 trace。
- 查不到：搜索返回空列表，策略明确说“没有找到”，没有编造 launch code。
- 路径越权：`../etc/passwd` 在进入 handler 前就被 schema 的 `pattern` 拒绝，没有发生文件读取。
- 删除：`delete_note` 不在 `TOOLS` 注册表里，运行时直接拒绝；注册表就是能力边界。
- 循环：同一搜索重复到上限后停止，避免无限调用。
- 这些检查验证的是运行时边界，不是模型选择工具的能力。

这个实现刻意保持最小：没有超时、重试、审批、沙箱、并发和真正的模型调用。文章前面说的这些是生产系统要补的，不是这段代码已经具备的。

## 10. 常见坑

1. **把 function calling 当 Agent**
   单次工具调用没有循环、状态、权限和恢复，不是 Agent。

2. **工具描述含糊**
   “处理数据”这种描述会让模型乱选；写清何时用、参数单位、返回结构。

3. **只做 JSON Schema**
   路径、URL、SQL、命令还需要语义校验；schema 不保证安全。

4. **把工具输出当指令**
   检索文档/网页/邮件里的“忽略之前指令”不能改变工具和权限。

5. **用服务账号越权**
   Agent 有超级权限，用户没有；必须用最终用户/租户身份做授权。

6. **写操作没有幂等和确认**
   重试可能重复转账/发邮件；写工具要有 idempotency key 和审批。

7. **没有 max steps/预算**
   模型可能循环；调用次数、token、时间、成本都要有硬上限。

8. **重复调用不检测**
   相同工具 + 相同参数反复出现，说明没有进展，应停止或换策略。

9. **所有错误都重试**
   参数错误、权限错误重试没有意义；只重试幂等的瞬时错误。

10. **只看最终答案**
    过程越权、重复调用、泄漏密钥，就算答案对也是失败。

11. **把完整 trace 塞回 prompt**
    上下文会爆，还会放大注入；摘要给模型，原始 trace 放日志。

12. **默认多 Agent**
    协调成本和故障面变大；一个 Agent + 清晰工具通常更稳。

13. **没有取消和超时**
    用户走了、上游断了，工具还在跑；要传播取消和 deadline。

## 11. 要点回顾

1. Agent = 模型决策 + 工具契约 + 执行循环 + 状态 + 权限/恢复，不是更长的 prompt
2. 先判断要不要 Agent：知识用 RAG，固定步骤用 workflow，路径不固定才用循环
3. 工具要有清晰描述、强类型参数、结构化结果、稳定错误码和副作用说明
4. 模型只提出调用；运行时负责校验、授权、执行、回填和记录
5. 工具调用要有 max steps、预算、超时、取消、循环检测和降级
6. 模型输出和工具输出都不可信；权限要在工具层强制，默认只读
7. 写操作要幂等、审批、dry-run/补偿；不能盲目重试
8. 评测看任务成功率 + 轨迹 + 成本/延迟 + 安全，不只看最终答案
9. 这个实验验证的是运行时边界；真实模型能力要另做评测

## 参考

- OpenAI Cookbook, *How to call functions with chat models*：<https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models>
- Anthropic, *Tool use with Claude*：<https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview>
- JSON Schema：<https://json-schema.org/>
- Model Context Protocol：<https://modelcontextprotocol.io/>
- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*：<https://arxiv.org/abs/2210.03629>
- Schick et al., *Toolformer: Language Models Can Teach Themselves to Use Tools*：<https://arxiv.org/abs/2302.04761>
- Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning*：<https://arxiv.org/abs/2303.11366>
- OWASP, *Top 10 for LLM Applications*：<https://genai.owasp.org/llm-top-10/>
- RAG 检索链路：[RAG](01-RAG.md)
- 模型评测与安全：[LLM 第 9 篇](../llm/09-评测与安全.md)
- 服务化/超时：[Inference 第 6 篇](../inference/06-服务化.md)
