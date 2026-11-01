# Tokenizer

LLM 的第一步不是 Transformer，而是把文本切成 token。

tokenizer 决定：

- 词表多大
- 同一段文本会变成多少个 token
- 序列长度、注意力成本、KV cache 显存
- 中文、代码、数字、emoji 会不会被切得很碎

同一个模型，换 tokenizer 或词表，成本和效果都会变。

## 1. Tokenizer 做什么

两个方向：

```text
encode: 文本 → token ID 序列
decode: token ID 序列 → 文本
```

一个 tokenizer 至少包含：

- 词表：token → ID
- 合并规则或切分模型
- 特殊 token：BOS、EOS、PAD、UNK、chat template 标记
- 归一化规则：大小写、Unicode、空白

token 不等于 word，也不等于 character：

```text
"unbelievable" → ["un", "believ", "able"]   （示意）
"你好"         → ["你", "好"] 或 ["你好"]    （取决于词表）
```

同一个字符串，不同 tokenizer 的 token 数可能差一倍。

## 2. 三种粒度

| 粒度 | 词表 | 序列长度 | 问题 |
|---|---|---|---|
| 字符 | 小 | 长 | 序列太长，语义单元太碎 |
| 词 | 大 | 短 | OOV、形态变化、中文词边界 |
| 子词 | 中 | 中 | 需要训练合并规则；仍是折中 |

LLM 基本都用子词：

- **BPE**：从字符/字节开始，反复合并出现最多的相邻对
- **WordPiece**：按似然增益合并，BERT 系常用
- **Unigram**：从大词表开始，删掉低概率 token，SentencePiece 支持
- **Byte-level BPE**：从 256 个字节开始，GPT-2 系常用

## 3. BPE

BPE 的训练过程：

1. 把文本拆成初始单元（字符或字节）
2. 统计相邻单元对的出现次数
3. 合并出现最多的一对，记一条 merge 规则
4. 重复，直到词表达到目标大小

一个经典例子：

```text
low lower newest widest
```

初始是字符；出现较多的 `e r`、`e s t` 等会先被合并，慢慢形成 `er`、`est`、`lower` 这类子词。

编码时按 merge 规则顺序应用；解码时把 token 拼回字节/字符。

BPE 的取舍：

- 词表越大，序列越短，但 embedding/输出层参数越多
- 词表越小，序列越长，注意力和 KV cache 成本越高
- 常见词更容易成为整词 token；低频词被拆成子词

## 4. WordPiece、SentencePiece、字节级 BPE

### WordPiece

BERT 使用。和 BPE 类似，但合并标准不是“出现次数最多”，而是“合并后训练语料似然提升最大”。

特点：

- continuation 用 `##` 标记，比如 `playing` → `play ##ing`
- 有 `[UNK]`，未登录词会变成 `[UNK]`
- 特殊 token：`[CLS]`、`[SEP]`、`[MASK]`、`[PAD]`

### SentencePiece

把原始文本直接当输入，不依赖语言特定的分词：

- 空格用 `▁` 表示，比如 `▁hello`
- 支持 BPE 和 Unigram 两种模型
- Llama 1/2 常用 SentencePiece BPE；Llama 3 换成 128k 词表的 BPE（tiktoken 系）
- T5 系常用 Unigram

好处是中文、日文、代码不需要先做 word segmentation；代价是空白和 Unicode 规则要看清。

### 字节级 BPE

GPT-2 使用：

- 初始词表是 256 个字节
- 任何 Unicode 都能用 UTF-8 字节表示
- 不需要 `UNK`
- 空格常显示成 `Ġ`，换行是 `Ċ`

代价是：一个中文汉字通常占 3 个字节，可能被切成多个 token；非 ASCII 语言的压缩率通常不如英文。

## 5. 词表与压缩率

常用指标：

$$
\text{compression}=\frac{\text{bytes}}{\text{tokens}},
\qquad
\text{fertility}=\frac{\text{tokens}}{\text{words}}
$$

- 英文常见约 4 字符/token
- 中文常见约 1–2 字符/token，取决于词表和是否字节级
- 代码的 token 数波动很大，和缩进、标识符、数字有关

词表大小的权衡：

| 词表 | 优点 | 缺点 |
|---|---|---|
| 32k | embedding 小，训练快 | 序列更长，稀有词切得碎 |
| 64k–128k | 压缩率和参数平衡 | 输出层变大 |
| 200k+ | 多语言/代码覆盖好 | softmax、embedding、显存更贵 |

上下文窗口按 token 算，不是按字符算。`max_tokens=4096` 对中文、代码、英文代表的字符数完全不同。

## 6. 中文、代码、数字

### 中文

- 字符级/BPE 可能把常用词合成一个 token，也可能一字一 token
- 字节级 BPE 下一个汉字通常 3 字节，可能占 1–3 个 token
- 繁体/简体、全角/半角、空格和标点都会影响切分
- 多语言词表要检查中文的 fertility，不能只看英文 benchmark

### 代码

- 缩进空格可能被合并成 token，也可能单独占 token
- 标识符会被拆成常见子词，比如 `get_user_id` → `get` + `_` + `user` + `_` + `id`
- 数字经常被拆成多位，影响算术和复制
- 代码生成对空白、括号、缩进敏感；tokenizer 的空白规则要确认

### 数字

不同 tokenizer 对数字的切法不同：

```text
12345 → ["123", "45"] 或 ["1", "2", "3", "4", "5"]
```

数字切得碎，模型做算术、对齐、格式化会更吃力；切得整，词表又会膨胀。

## 7. 从零训练一个小 BPE

下面是一个字节级 BPE 的最小实现，只用来理解 merge 过程；生产环境用 Hugging Face `tokenizers` 或 SentencePiece。

??? note "代码：从零训练 BPE"
    ```python
    from collections import Counter

    def pair_counts(ids):
        return Counter(zip(ids, ids[1:]))

    def merge(ids, pair, new_id):
        out = []
        i = 0
        while i < len(ids):
            if i + 1 < len(ids) and (ids[i], ids[i + 1]) == pair:
                out.append(new_id)
                i += 2
            else:
                out.append(ids[i])
                i += 1
        return out

    def train_bpe(text, num_merges):
        ids = list(text.encode("utf-8"))
        merges = []
        for new_id in range(256, 256 + num_merges):
            counts = pair_counts(ids)
            if not counts:
                break
            pair = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
            ids = merge(ids, pair, new_id)
            merges.append((pair, new_id))
        return merges

    def encode(text, merges):
        ids = list(text.encode("utf-8"))
        for pair, new_id in merges:
            ids = merge(ids, pair, new_id)
        return ids

    def build_vocab(merges):
        vocab = {i: bytes([i]) for i in range(256)}
        for pair, new_id in merges:
            vocab[new_id] = vocab[pair[0]] + vocab[pair[1]]
        return vocab

    def decode(ids, merges):
        vocab = build_vocab(merges)
        return b"".join(vocab[i] for i in ids).decode("utf-8", errors="replace")

    lines = [
        "the quick brown fox jumps over the lazy dog",
        "a fast brown fox jumps over a lazy dog",
        "the quick red fox jumps over the sleepy dog",
        "pack my box with five dozen liquor jugs",
        "how vexingly quick daft zebras jump",
        "the five boxing wizards jump quickly",
        "sphinx of black quartz judge my vow",
        "你好，世界。今天天气很好。",
        "机器学习模型需要高质量的数据。",
        "分词器决定了序列长度和推理成本。",
        "中文和代码的切分方式不一样。",
        "def add(x, y):",
        "    return x + y",
        "for i in range(10):",
        "    print(i)",
        "print('hello world')",
        "attention is all you need",
        "tokens are not words",
        "byte level bpe handles unicode",
        "the lazy dog sleeps in the sun",
    ]
    train_text = "\n".join(lines)

    for n in [0, 25, 50, 100]:
        merges = train_bpe(train_text, n)
        ids = encode(train_text, merges)
        ratio = len(train_text.encode("utf-8")) / len(ids)
        print(n, "merges, vocab", 256 + n, "tokens", len(ids), "ratio", round(ratio, 2))

    merges = train_bpe(train_text, 100)
    vocab = build_vocab(merges)
    print("first merges",
          [(vocab[a].decode("utf-8", "replace"),
            vocab[b].decode("utf-8", "replace")) for (a, b), _ in merges[:5]])
    print("roundtrip", decode(encode(train_text, merges), merges) == train_text)
    ```

输出：

```text
0 merges, vocab 256 tokens 648 ratio 1.0
25 merges, vocab 281 tokens 503 ratio 1.29
50 merges, vocab 306 tokens 429 ratio 1.51
100 merges, vocab 356 tokens 332 ratio 1.95
first merges [('e', ' '), ('s', ' '), ('t', 'h'), ('th', 'e '), ('y', ' ')]
roundtrip True
```

读法：

- merge 数增加，token 数减少，压缩率上升
- 这个语料只有 648 字节，词表 356，压缩率远低于生产 tokenizer
- 生产 BPE 会先做 pre-tokenization（按空白/标点/正则切），避免跨词合并；这里为了短，直接在整段字节流上合并
- `roundtrip True` 说明字节级 BPE 可以无损还原；归一化、截断、特殊 token 才可能造成信息丢失

## 8. 特殊 token 与 chat template

常见特殊 token：

- `BOS` / `EOS`：序列开始/结束
- `PAD`：batch padding
- `UNK`：未登录词（字节级 BPE 通常不需要）
- `MASK`：masked LM
- chat 标记：`<|user|>`、`<|assistant|>`、`<|im_start|>` 等

chat template 负责把多轮对话拼成模型训练时的格式：

```text
<|user|>
你好
<|assistant|>
你好，有什么可以帮你？
<|eos|>
```

注意：

- 模板一般由 tokenizer 的 `apply_chat_template` 处理，不要手拼
- 手拼容易多一个/少一个 BOS/EOS，或者角色标记不一致
- 不同模型的特殊 token 不同；换模型必须换模板
- 用户输入里不能随意出现特殊 token，否则可能破坏对话结构

## 9. 常见坑

1. **把 token 当 word**
   上下文长度、价格、显存都按 token 算，不是按字数/词数。

2. **tokenizer 和模型不匹配**
   vocab、特殊 token ID、chat template 必须和 checkpoint 一致；只换权重不换 tokenizer 会输出乱码或错位。

3. **重复加 BOS/EOS**
   模板/数据管线已经加了特殊 token，训练代码又加一次，序列会多出标记。

4. **padding/truncation 方向错**
   训练通常右侧 padding，生成时不少框架用左侧；关键是 `padding_side` 和 attention mask 要对齐。

5. **归一化丢信息**
   大小写、重音、全半角、空白被改掉后，decoder 不一定能还原原文。

6. **中文/代码切得太碎**
   只看英文 benchmark 不够；要统计目标语言的 fertility 和实际 token 成本。

7. **词表和 embedding 不匹配**
   换词表必须同步改 `vocab_size`、embedding、lm_head；不能只换 tokenizer。

8. **tokenizer 版本漂移**
   重新训练/tokenizer 升级会改变 ID；checkpoint 要带 tokenizer 配置和版本。

9. **特殊 token 注入**
   用户输入包含 `<|eos|>` 等标记时，可能提前截断或改变角色；要转义/过滤。

10. **用字符数估上下文**
    `max_tokens` 是 token 数；中文、代码、英文的字符/token 比例不同。

11. **decode 不去特殊 token**
    日志里出现 `<pad>`、`<eos>` 很常见；展示时用 `skip_special_tokens=True`。

12. **以为 tokenizer 可逆**
    归一化、截断、特殊 token、非法字节都会让 decode 不等于原文。

## 10. 要点回顾

1. tokenizer = 文本 ↔ token ID；token 不等于 word/char
2. 子词算法：BPE、WordPiece、Unigram、字节级 BPE
3. BPE 从字符/字节开始，反复合并出现最多的相邻对
4. 词表越大序列越短，但 embedding/输出层越贵；要平衡
5. 上下文、成本、KV cache 都按 token 算
6. 中文、代码、数字的切分差异很大，要看目标语言的 fertility
7. 特殊 token 和 chat template 必须和模型匹配
8. tokenizer 要和 checkpoint 一起保存，版本/词表不能漂移

## 参考

- Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units*（BPE）：<https://arxiv.org/abs/1508.07909>
- Kudo and Richardson, *SentencePiece*：<https://arxiv.org/abs/1808.06226>
- Wu et al., *Google's Neural Machine Translation System*（WordPiece）：<https://arxiv.org/abs/1609.08144>
- Radford et al., *Language Models are Unsupervised Multitask Learners*（GPT-2 字节级 BPE）：<https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf>
- Llama Team, *The Llama 3 Herd of Models*：<https://arxiv.org/abs/2407.21783>
- Hugging Face, Tokenizers：<https://huggingface.co/docs/tokenizers/>
- Hugging Face, Chat templating：<https://huggingface.co/docs/transformers/chat_templating>
- OpenAI, tiktoken：<https://github.com/openai/tiktoken>
