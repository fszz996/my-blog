/*!
 * local-search.js —— 本地搜索（零后端、零密钥）
 * ============================================================================
 * 【为什么有这个文件】
 *   主题模板在 `local_search.enable: true` 且 `algolia_search.enable: false` 时会输出
 *     <script src="/js/search/local-search.js">
 *   但仓库里只有 algolia.js，没有这个文件 —— 于是搜索按钮点开是 404、面板永远空白。
 *   这里按主题已有的 DOM 结构与样式类（local-search.pug / local-search.styl）重写一份：
 *   · 数据源是 hexo-generator-search 生成的 /search.xml（构建产物，站点自带）
 *   · 首次打开面板时才去取，取到后缓存在内存，同一页面内不再重复请求
 *   · 纯前端打分排序：标题命中权重高于正文，多关键词取「全部命中」优先
 *   · 关键词高亮用 <em class="search-keyword">，正文摘要截取首个命中位置前后一段
 *
 * 【可调参数】在引入本脚本之前写 window.__LOCAL_SEARCH__ = {...} 覆盖：
 *     window.__LOCAL_SEARCH__ = { path: '/search.xml', limit: 20 }
 *
 * 【依赖】只依赖主题的 btf.animateIn / btf.animateOut（utils.js 已提供），
 *         取不到时降级成直接 display 切换，不影响功能。
 *
 * 【pjax】面板挂在 #page 之外，换页不会被替换；但换页时要收起并恢复滚动。
 * ========================================================================== */
;(function () {
  'use strict'

  var DEFAULTS = {
    path: '/search.xml', // hexo-generator-search 的输出路径（_config.yml 的 search.path）
    limit: 20,           // 最多展示多少条
    debounce: 120,       // 输入防抖（毫秒）
    snippet: 56          // 摘要长度（字）
  }
  var CFG = {}
  for (var dk in DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, dk)) CFG[dk] = DEFAULTS[dk]
  }
  var userCfg = window.__LOCAL_SEARCH__
  if (userCfg && typeof userCfg === 'object') {
    for (var uk in userCfg) {
      if (userCfg[uk] !== undefined && userCfg[uk] !== null) CFG[uk] = userCfg[uk]
    }
  }

  var LABELS = {
    loading: '正在加载搜索数据…',
    empty: '没有找到相关内容，换个关键词试试？',
    failed: '搜索数据加载失败，请刷新页面后重试',
    hits: function (n) { return '共 ' + n + ' 条结果' }
  }

  var db = null          // [{ title, url, text, lt, lc }]
  var loading = false
  var waiters = []
  var timer = null
  var lastQuery = ''

  // 站点根前缀：兼容部署在子目录（GitHub Pages 项目站 /my-blog/ 之类）。
  // 取本脚本自己的 src 去掉 /js/search/local-search.js 得到前缀；
  // 如果脚本本身来自 CDN（异源），就退回空前缀（站点部署在根路径）。
  var ROOT = (function () {
    var all = Array.prototype.slice.call(document.getElementsByTagName('script'))
    var self = document.currentScript
    if (!self || !/local-search\.js/.test(self.src || '')) {
      for (var i = all.length - 1; i >= 0; i--) {
        if (/local-search\.js/.test(all[i].src || '')) { self = all[i]; break }
      }
    }
    if (!self || !self.src) return ''
    try {
      var u = new URL(self.src, location.href)
      if (u.origin !== location.origin) return ''
      var m = u.pathname.match(/^(.*?)\/?js\/search\/local-search\.js$/)
      return m ? (m[1] || '') : ''
    } catch (e) { return '' }
  })()

  function searchPath() {
    var p = String(CFG.path || '/search.xml')
    if (!ROOT) return p
    return ROOT + '/' + p.replace(/^\/+/, '')
  }

  function $(sel, root) { return (root || document).querySelector(sel) }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)) }

  function dialog() { return $('#local-search .search-dialog') }
  function mask() { return $('#search-mask') }
  function input() { return $('.local-search-box--input') }
  function wrap() { return $('#local-search .search-wrap') }
  function results() { return $('#local-search-results') }
  function loadingBox() { return $('#loading-database') }
  function statusText() { return $('#loading-status') }

  function animateIn(el) {
    if (window.btf && btf.animateIn) btf.animateIn(el, 'to_show 0.5s')
    else el.style.display = 'block'
  }
  function animateOut(el) {
    if (window.btf && btf.animateOut) btf.animateOut(el, 'to_hide 0.5s')
    else el.style.display = ''
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeReg(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  // 正文里去掉多余空白，避免摘要里出现一长串空格
  function normalize(text) { return String(text || '').replace(/\s+/g, ' ').trim() }

  // search.xml 的 <content> 是整段 HTML（还塞了 <figure class="highlight"> 代码块），
  // 直接取 textContent 会把标签字面量当成正文。这里先扔掉代码块/脚本，再剥标签、还原常见实体。
  function stripHtml(html) {
    return String(html || '')
      .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
  }

  // ---------- 打开 / 关闭 ----------
  var lastOverflow = ''

  function openSearch() {
    var box = dialog()
    if (!box) return
    lastOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 遮罩必须在对话框之前显示：z-index 1000 < 1001，点空白处靠它接事件
    var mk = mask()
    if (mk) animateIn(mk)
    animateIn(box)

    if (db) {
      // 数据已在内存：直接露出输入框并聚焦
      showWrap()
      var inp0 = input()
      if (inp0) {
        inp0.focus()
        if (inp0.value.trim()) doSearch(inp0.value)
      }
      return
    }

    // 首次打开：先显示「正在加载搜索数据」，加载完再露出输入框
    ensureDB(function () {
      showWrap()
      var inp = input()
      if (inp) {
        inp.focus()
        if (inp.value.trim()) doSearch(inp.value)
      }
    })
  }

  function closeSearch() {
    var box = dialog()
    if (!box) return
    var mk = mask()
    if (mk) animateOut(mk)
    animateOut(box)
    document.body.style.overflow = lastOverflow || ''
  }

  // ---------- 数据加载 ----------
  function parseXML(text) {
    var doc = new window.DOMParser().parseFromString(text, 'text/xml')
    if (!doc || doc.getElementsByTagName('parsererror').length) throw new Error('search.xml 解析失败')
    return Array.prototype.map.call(doc.getElementsByTagName('entry'), function (entry) {
      var title = entry.getElementsByTagName('title')[0]
      var urlEl = entry.getElementsByTagName('url')[0]
      var linkEl = entry.getElementsByTagName('link')[0]
      var content = entry.getElementsByTagName('content')[0]
      var t = title ? title.textContent : ''
      var c = content ? normalize(stripHtml(content.textContent)) : ''
      var href = urlEl ? urlEl.textContent : (linkEl ? linkEl.getAttribute('href') : '/')
      return {
        title: t,
        url: String(href || '/').trim(),
        text: c,
        lt: t.toLowerCase(),
        lc: c.toLowerCase()
      }
    })
  }

  function ensureDB(done) {
    if (db) { if (done) done(); return }
    if (done) waiters.push(done)
    if (loading) return
    loading = true

    var lb = loadingBox()
    if (lb) lb.style.display = ''
    var st = statusText()
    if (st) st.textContent = LABELS.loading

    fetch(searchPath(), { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.text()
      })
      .then(function (text) {
        db = parseXML(text)
        loading = false
        if (lb) lb.style.display = 'none'
        if (st) st.textContent = ''
        flush()
        var inp = input()
        if (inp && inp.value.trim()) doSearch(inp.value)
      })
      .catch(function (err) {
        loading = false
        if (lb) lb.style.display = 'none'
        if (st) st.textContent = ''
        if (results()) {
          results().innerHTML = '<p class="search-result">' + escapeHtml(LABELS.failed) + '</p>'
          showWrap()
        }
        console.error('local-search:', err)
      })
  }

  function flush() {
    var list = waiters.slice()
    waiters.length = 0
    for (var i = 0; i < list.length; i++) {
      try { list[i]() } catch (e) { console.error(e) }
    }
  }

  function showWrap() {
    var w = wrap()
    if (w) w.style.display = 'block'
  }

  // ---------- 检索 ----------
  function tokenize(query) {
    return normalize(query).toLowerCase().split(/\s+/).filter(Boolean)
  }

  function score(item, tokens) {
    var total = 0
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i]
      var inTitle = item.lt.indexOf(tk) !== -1
      var inText = item.lc.indexOf(tk) !== -1
      if (!inTitle && !inText) return 0 // 必须全部命中，否则算不相关
      total += (inTitle ? 8 : 0) + (inText ? 1 : 0)
      // 标题开头命中再补一点，让人名/系列文章排前面
      if (inTitle && item.lt.indexOf(tk) === 0) total += 4
    }
    return total
  }

  function highlight(text, tokens) {
    var out = escapeHtml(text)
    for (var i = 0; i < tokens.length; i++) {
      if (!tokens[i]) continue
      out = out.replace(new RegExp('(' + escapeReg(tokens[i]) + ')', 'gi'), '<em class="search-keyword">$1</em>')
    }
    return out
  }

  function snippet(item, tokens) {
    var text = item.text
    if (!text) return ''
    var lower = item.lc
    var pos = -1
    for (var i = 0; i < tokens.length; i++) {
      var p = lower.indexOf(tokens[i])
      if (p !== -1 && (pos === -1 || p < pos)) pos = p
    }
    if (pos === -1) return escapeHtml(text.slice(0, CFG.snippet)) + (text.length > CFG.snippet ? '…' : '')
    var start = Math.max(0, pos - Math.floor(CFG.snippet / 2))
    var piece = text.slice(start, start + CFG.snippet)
    return (start > 0 ? '…' : '') + highlight(piece, tokens) + (start + CFG.snippet < text.length ? '…' : '')
  }

  function render(list, tokens) {
    var box = results()
    if (!box) return
    showWrap()

    if (!list.length) {
      box.innerHTML = '<p class="search-result">' + escapeHtml(LABELS.empty) + '</p>'
      return
    }

    var html = ['<div class="search-result-list">']
    for (var i = 0; i < list.length; i++) {
      var it = list[i]
      html.push(
        '<div class="local-search__hit-item">',
        '<a href="' + escapeHtml(it.url) + '">' + highlight(it.title || it.url, tokens) + '</a>',
        '<p class="search-result">' + snippet(it, tokens) + '</p>',
        '</div>'
      )
    }
    html.push('</div>')
    box.innerHTML = html.join('')
  }

  function doSearch(query) {
    if (!db) return
    var tokens = tokenize(query)
    lastQuery = query
    if (!tokens.length) {
      var box = results()
      if (box) box.innerHTML = ''
      var st = statusText()
      if (st) st.textContent = ''
      var w = wrap()
      if (w) w.style.display = 'none'
      return
    }

    var hits = []
    for (var i = 0; i < db.length; i++) {
      var s = score(db[i], tokens)
      if (s > 0) hits.push({ item: db[i], score: s })
    }
    hits.sort(function (a, b) { return b.score - a.score })
    var shown = hits.slice(0, CFG.limit).map(function (h) { return h.item })
    render(shown, tokens)
    var st2 = statusText()
    if (st2) st2.textContent = hits.length ? LABELS.hits(hits.length) : ''
  }

  function scheduleSearch(value) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () { doSearch(value) }, CFG.debounce)
  }

  // ---------- 事件绑定 ----------
  var composing = false

  function bind() {
    // 打开：导航栏放大镜
    var btn = $('#search-button')
    if (!btn || btn.getAttribute('data-ls-bound') === '1') return
    btn.setAttribute('data-ls-bound', '1')
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      openSearch()
    })
  }

  function bindGlobalOnce() {
    if (document.documentElement.getAttribute('data-ls-global') === '1') return
    document.documentElement.setAttribute('data-ls-global', '1')

    // 关闭方式：叉号 / 遮罩 / ESC
    document.addEventListener('click', function (e) {
      var t = e.target
      if (!t || !t.closest) return
      if (t.closest('#local-search .search-close-button') || t.closest('#search-mask')) {
        e.preventDefault()
        closeSearch()
      }
    })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' ||
        e.code === 'Escape' ||
        e.keyCode === 27) {
        var box = dialog()
        if (box && box.style.display === 'block') closeSearch()
      }
      // 回车跳到第一条结果
      if ((e.key === 'Enter' || e.keyCode === 13) && e.target && e.target.classList && e.target.classList.contains('local-search-box--input')) {
        var first = $('#local-search-results .local-search__hit-item a')
        if (first) {
          e.preventDefault()
          window.location.href = first.getAttribute('href')
        }
      }
    })

    // 输入
    document.addEventListener('input', function (e) {
      var t = e.target
      if (!t || !t.classList || !t.classList.contains('local-search-box--input')) return
      if (composing) return
      ensureDB()
      scheduleSearch(t.value)
    })

    // 中文输入法：组合期间不搜，选词完成再搜
    document.addEventListener('compositionstart', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('local-search-box--input')) composing = true
    })
    document.addEventListener('compositionend', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('local-search-box--input')) {
        composing = false
        ensureDB()
        scheduleSearch(e.target.value)
      }
    })

    // pjax 换页：收起面板，避免遮罩留在新页面上
    document.addEventListener('pjax:beforeSend', function () {
      var box = dialog()
      var mk = mask()
      if (box && box.style.display === 'block') {
        box.style.display = ''
        box.style.animation = ''
      }
      if (mk) {
        mk.style.display = ''
        mk.style.animation = ''
      }
      document.body.style.overflow = ''
    })
  }

  function init() {
    bind()
    bindGlobalOnce()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  // pjax 换页后导航栏是新的节点，需要重新挂一次打开事件（全局监听只挂一次）
  document.addEventListener('pjax:complete', bind)

  // 给调试/外部调用留个口子
  window.fomalLocalSearch = { open: openSearch, close: closeSearch, search: doSearch }
})()