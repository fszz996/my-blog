/**
 * Butterfly
 * lazyload
 * replace src to data-lazy-src
 */

'use strict'

const urlFor = require('hexo-util').url_for.bind(hexo)

function lazyload (htmlContent) {
  const bg = hexo.theme.config.lazyload.placeholder ? urlFor(hexo.theme.config.lazyload.placeholder) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  // 2026-11-23 支持豁免：带 class="no-lazyload" 的 <img> 原样保留 src。
  // 用途是首屏就要显示的站点级小图（如导航栏左上角头像）——它们本来就该立刻出现，
  // 被换成占位 gif 再等 JS 换回来，会闪一下，JS 失败时还会一直空着。
  // 约束：类名要写在 src 之前（Pug 的 img.no-lazyload(src=...) 就是这种顺序）。
  return htmlContent.replace(/(<img(?![^>]*\bno-lazyload\b)[^>]*? src=)/ig, `$1 "${bg}" data-lazy-src=`)
}

hexo.extend.filter.register('after_render:html', function (data) {
  const config = hexo.theme.config.lazyload
  if (!config.enable) return
  if (config.field !== 'site') return
  return lazyload.call(this, data)
})

hexo.extend.filter.register('after_post_render', data => {
  const config = hexo.theme.config.lazyload
  if (!config.enable) return
  if (config.field !== 'post') return
  data.content = lazyload.call(this, data.content)
  return data
})
