#!/usr/bin/env node
'use strict';
/**
 * tools/fix-subpath.cjs —— 部署到子路径时，把产物里的「根绝对路径」补上前缀
 * ============================================================================
 * 【为什么需要】
 *   GitHub Pages 的项目站地址是 https://<用户>.github.io/<仓库名>/，
 *   但站里有一批写死的 `/assets/…`、`/css/…`、`/js/…` 引用（主题配置里的 inject 注入、
 *   内联 <style> 里的 url(/assets/…)、manifest.json 的图标、CSS 里的 url(/assets/…) 等），
 *   它们不会经过 Hexo 的 url_for，所以在子路径下会 404。
 *
 * 【为什么放在构建之后、而不是改源码】
 *   这些路径在「根路径部署」（自有域名、Vercel）时是正确的。改成写死 /my-blog 会把
 *   以后再改域名变成一次全仓库替换。所以只在部署子路径时对 public/ 做一次后处理，
 *   源码保持环境无关。
 *
 * 【用法】
 *   node tools/fix-subpath.cjs --prefix /my-blog      # 部署版
 *   node tools/fix-subpath.cjs --prefix /            # 根路径：直接跳过
 *
 * 【幂等】只匹配「引号/括号紧跟 /assets/」这种形态，已经带前缀（/my-blog/assets/…）的
 *   不会再被匹配，重复执行结果不变。外链（https://cdn…/assets/…）也不会被误伤。
 */

const fs = require('node:fs');
const path = require('node:path');

function parsePrefix(argv) {
  const i = argv.indexOf('--prefix');
  const raw = i >= 0 ? (argv[i + 1] || '') : '';
  const cleaned = raw.replace(/^\/+|\/+$/g, '');
  return cleaned ? '/' + cleaned + '/' : '/';
}

const prefix = parsePrefix(process.argv.slice(2));
if (prefix === '/') {
  console.log('[fix-subpath] 前缀是 /（根路径部署），不需要处理，跳过');
  process.exit(0);
}

const PUBLIC_DIR = path.join(process.cwd(), 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('[fix-subpath] 找不到 public/，先跑 hexo generate');
  process.exit(1);
}

// 只处理文本类产物；图片/字体二进制不碰
const TEXT_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.webmanifest', '.svg']);
// 站内这些一级目录下的资源都要加前缀
const SEGMENTS = 'assets|js|css|fonts|images|img';

function escapeReg(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const RULES = [
  // href="/assets/…    src='/js/…    content="/css/…    这类「引号 + 根路径」
  { re: new RegExp('(["\'`])/(' + SEGMENTS + ')/', 'g'), to: '$1' + prefix + '$2/' },
  // CSS / 内联样式里的 url(/assets/…)   url("/assets/…)   url('/assets/…)
  { re: new RegExp('(url\\(\\s*["\'`]?)/(' + SEGMENTS + ')/', 'g'), to: '$1' + prefix + '$2/' },
  // PWA manifest 的入口与作用域必须是目录（以 / 结尾）
  { re: /("start_url"\s*:\s*")\/(?=")/g, to: '$1' + prefix },
  { re: /("scope"\s*:\s*")\/(?=")/g, to: '$1' + prefix },
  // 兜底：hexo-generator-baidu-sitemap 会拿 config.url 再拼一次 url_for 的结果，
  // url 自带子路径时就会生成 /my-blog/my-blog/…（sitemap.xml 不受影响）。
  // 重复前缀永远不是合法地址，直接收敛成一份。
  { re: new RegExp(escapeReg(prefix + prefix.slice(1)), 'g'), to: prefix }
];

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (TEXT_EXTS.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

const files = walk(PUBLIC_DIR, []);
let touched = 0;
let totalHits = 0;
const report = [];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  let hits = 0;

  for (const rule of RULES) {
    after = after.replace(rule.re, (match, ...groups) => {
      hits++;
      return rule.to.replace(/\$(\d)/g, (_, n) => groups[Number(n) - 1]);
    });
  }

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    touched++;
    totalHits += hits;
    report.push({ file: path.relative(PUBLIC_DIR, file), hits });
  }
}

report.sort((a, b) => b.hits - a.hits);
for (const r of report.slice(0, 15)) console.log(`  ${String(r.hits).padStart(4)}  ${r.file}`);
if (report.length > 15) console.log(`  …… 其余 ${report.length - 15} 个文件略`);

console.log(`[fix-subpath] 前缀 ${prefix}：改了 ${touched} 个文件、${totalHits} 处引用`);