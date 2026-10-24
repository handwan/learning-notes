/* 主页"随机知识点"：从搜索索引抽一条"文章 + 标题"跳过去（标题记录自带锚点）。
 * 事件委托绑定，兼容 Material 的 navigation.instant（整站只加载一次本脚本）。 */
(function () {
  var INDEX_URL = "search/search_index.json";
  var cache = null;

  function load() {
    if (!cache) {
      cache = fetch(new URL(INDEX_URL, document.baseURI))
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          return res.json();
        })
        .then(function (data) {
          return data.docs || [];
        });
    }
    return cache;
  }

  function pick(docs) {
    // 先随机文章、再随机其标题（排除主页与无锚点记录，避免长文吃香）
    var byPage = new Map();
    docs.forEach(function (d) {
      var parts = d.location.split("#");
      if (!parts[0] || !parts[1]) return;
      if (!byPage.has(parts[0])) byPage.set(parts[0], []);
      byPage.get(parts[0]).push(d);
    });
    var groups = Array.from(byPage.values());
    if (!groups.length) return null;
    var group = groups[Math.floor(Math.random() * groups.length)];
    return group[Math.floor(Math.random() * group.length)];
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest("a[data-random]");
    if (!link) return;
    e.preventDefault();
    load()
      .then(pick)
      .then(function (doc) {
        if (doc) window.location.href = new URL(doc.location, document.baseURI).href;
      })
      .catch(function (err) {
        console.warn("random jump failed:", err);
      });
  });
})();
