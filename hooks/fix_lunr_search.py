"""构建后修复 lunr.js 的 TokenSet bug（否则部分词搜不到）。

lunr 2.3.9（Material 内置、2020 年后停更）构造词条树时，用"标签 + 子节点 id"
拼接当结构键；数字标签 + 多位 id 会歧义 → 不同子树被错误合并，出现"假词条"。
Material 给每个查询词自动加 *，前缀查询命中假词条时 lunr 抛异常 → 0 结果。

修复：给搜索 worker 追加补丁重写 toString（拼接加分隔符），不改变检索语义。
"""

import glob
import os

MARKER = "/* mkdocs-fix: lunr-tokenset */"

PATCH = (
    "\n"
    + MARKER
    + """
;(function () {
  var l = self.lunr
  if (!l || !l.TokenSet || !l.TokenSet.prototype) return
  l.TokenSet.prototype.toString = function () {
    if (this._str) return this._str
    var str = this.final ? "1" : "0"
    var labels = Object.keys(this.edges).sort()
    for (var i = 0; i < labels.length; i++)
      str += labels[i] + ":" + this.edges[labels[i]].id + ";"
    return str
  }
})();
"""
)


def on_post_build(config):
    pattern = os.path.join(
        config["site_dir"], "assets", "javascripts", "workers", "search.*.min.js"
    )
    for path in glob.glob(pattern):
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        if MARKER in text:  # 幂等：serve 增量重建时不要重复追加
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(text + PATCH)
