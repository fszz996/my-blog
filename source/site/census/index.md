---
title: 站点数据
date: 2026-11-22 20:20:00
comments: false
description: 本站的访问量与运行天数；51LA、百度统计与 GitHub 贡献日历尚未接通，页尾写了接入方法。
---

<link rel="stylesheet" href="/css/census.css?v=20261123">

<div class="census">
<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">📈</span>
<div class="census-sec__text">
<div class="census-sec__title">访问量</div>
<div class="census-sec__desc">由不蒜子统计，无需登录、没有后端</div>
</div>
<a class="census-sec__link" href="https://busuanzi.ibruce.info/" target="_blank" rel="noopener">不蒜子<i>↗</i></a>
</div>
<div id="statistic" class="census-kpis">
<div class="content">
<div class="census-kpi"><span class="census-kpi__icon">👣</span><span class="census-kpi__label">总访问量</span><span class="census-kpi__num" data-bz="site_pv">--</span></div>
<div class="census-kpi"><span class="census-kpi__icon">🧍</span><span class="census-kpi__label">访客数</span><span class="census-kpi__num" data-bz="site_uv">--</span></div>
<div class="census-kpi"><span class="census-kpi__icon">📄</span><span class="census-kpi__label">本页访问</span><span class="census-kpi__num" data-bz="page_pv">--</span></div>
</div>
</div>
</section>

<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">🗓</span>
<div class="census-sec__text">
<div class="census-sec__title">运行时长</div>
<div class="census-sec__desc">从建站那天算起</div>
</div>
</div>
<div class="census-card">
<div class="stat-days">
<div class="stat-days__num"><span id="site-days">--</span><em>天</em></div>
<div class="stat-days__meta">2026 年 11 月 22 日 上线 · 记录 CTF 与学习过程</div>
</div>
</div>
</section>

<section class="census-sec">
<div class="census-sec__head">
<span class="census-sec__icon">🧩</span>
<div class="census-sec__text">
<div class="census-sec__title">还没接通的数据</div>
<div class="census-sec__desc">需要自己去申请，配好后按下面几行改就能出现在这页</div>
</div>
</div>
<div class="census-card">
<ol class="stat-todo">
<li><b>百度统计</b>（地域分布 / 访问趋势 / 来源构成）：注册后拿 <code>access_token</code> 与 <code>site_id</code>，填进 <code>source/js/census.js</code> 顶部，再把 <code>dataUrl</code> 指向自己的代理接口；本页目前没有引入这个脚本，接通后把 <code>&lt;script src="/js/census.js"&gt;</code> 与对应的图表容器加回来。</li>
<li><b>51LA</b>（实时访客）：注册后把 <code>YOUR_51LA_ID</code> 换成自己的 ID；脚本原本内联在本页，已随改版一并移除，需要时按 51LA 后台给的 <code>quote.js</code> 地址重新贴一段。</li>
<li><b>GitHub 贡献日历</b>：需要自建 gitcalendar 数据仓库，配好后把 <code>_config.yml</code> 里 <code>gitcalendar.enable</code> 改回 <code>true</code>。</li>
</ol>
<div class="stat-tip">这几项都是「可选的增强」，不配也不影响站点正常访问；当前的访问量已经由不蒜子在全站统计。</div>
</div>
</section>

<div class="census-note">
<span>📈 访问量：<a href="https://busuanzi.ibruce.info/" target="_blank" rel="noopener">不蒜子</a></span>
<span>🛠 本站：Hexo + Fomalhaut</span>
</div>
</div>

<style>
.stat-days{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px 16px;text-align:center}
.stat-days__num{font-size:44px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:var(--theme-color)}
.stat-days__num em{font-size:15px;font-weight:500;font-style:normal;margin-left:6px;opacity:.6;color:var(--font-color)}
.stat-days__meta{font-size:12.5px;opacity:.6;color:var(--font-color)}
.stat-todo{margin:0;padding:18px 22px 8px 40px;font-size:13.5px;line-height:1.9;color:var(--font-color)}
.stat-todo li{margin-bottom:6px}
.stat-todo code{font-size:12.5px;padding:1px 5px;border-radius:5px;background:rgba(128,128,128,.14)}
.stat-tip{margin:0 18px 18px;font-size:12.5px;opacity:.6;color:var(--font-color)}
</style>

<script>
(function () {
  var start = new Date(2026, 10, 22) // 2026-11-22 建站
  var days = Math.floor((Date.now() - start.getTime()) / 86400000)
  var el = document.getElementById('site-days')
  if (el && isFinite(days) && days >= 0) el.textContent = days
})()

// 不蒜子只认 id，而且全站侧栏「小站资讯」卡里已经有同 id 的节点；
// 这里给 KPI 换成 data-bz，再把不蒜子写好的数字同步过来（谁先渲染都不影响）。
;(function () {
  var map = { site_pv: 'busuanzi_value_site_pv', site_uv: 'busuanzi_value_site_uv', page_pv: 'busuanzi_value_page_pv' }
  var deadline = Date.now() + 20000
  function pick(id) {
    var els = document.querySelectorAll('#' + id)
    for (var i = 0; i < els.length; i++) {
      var v = (els[i].textContent || '').trim()
      if (v && v !== '--' && v !== '—') return v
    }
    return ''
  }
  function sync() {
    var done = true
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue
      var mine = document.querySelector('[data-bz="' + k + '"]')
      if (!mine || (mine.textContent || '').trim() !== '--') continue
      var v = pick(map[k])
      if (v) mine.textContent = v
      else done = false
    }
    if (done || Date.now() > deadline) clearInterval(timer)
  }
  var timer = setInterval(sync, 700)
  sync()
})()
</script>