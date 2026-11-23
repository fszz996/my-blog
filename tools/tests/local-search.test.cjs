'use strict';
/**
 * local-search 回归测试（纯 Node，不联网、不起服务）
 * ---------------------------------------------------------------------------
 * 背景：主题模板在开启本地搜索时会输出 /js/search/local-search.js，但仓库里原本
 *       没有这个文件（搜索点开是 404）。补上的实现跑在浏览器里，这里用一个最小
 *       DOM 桩 + cheerio（只用来解析 search.xml）把它整条链路跑一遍：
 *         取数 → 解析 → 去 HTML 标签 → 打分排序 → 渲染高亮
 *
 * 跑法：node --test tools/tests/local-search.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const root = path.resolve(__dirname, '../..');
const scriptPath = path.join(root, 'themes/fomalhaut/source/js/search/local-search.js');
const xmlPath = path.join(root, 'public/search.xml');

const code = fs.readFileSync(scriptPath, 'utf8');

// 断言用的样例数据：不依赖 public/ 是否构建过；结构与 hexo-generator-search 一致
const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<search>
  <entry>
    <title>Hello World · 开站第一天</title>
    <url>/posts/8b9651a9.html</url>
    <content type="html"><![CDATA[
      <h2 id="x">为什么开这个站</h2>
      <p>这是第一篇，讲为什么开博。GitHub 主页在 <a href="https://github.com/fszz996">fszz996</a>。</p>
      <figure class="highlight shell"><table><tr><td class="code"><pre><span class="line">$ echo "only-in-code-block"</span></pre></td></tr></table></figure>
    ]]></content>
  </entry>
  <entry>
    <title>外挂标签速查</title>
    <url>/posts/56032921.html</url>
    <content type="html"><![CDATA[<p>note、tabs、timeline 这些标签的用法速查。</p>]]></content>
  </entry>
</search>`;

function makeElement(extra) {
  const el = Object.assign({
    style: {},
    _attrs: {},
    textContent: '',
    innerHTML: '',
    value: '',
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; },
    setAttribute(name, value) { this._attrs[name] = String(value); },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    closest() { return null; }
  }, extra || {});
  el.classList = el.classList || { contains: () => false, add() {}, remove() {} };
  return el;
}

function makeDom(scriptSrc) {
  const src = scriptSrc || 'http://localhost:4000/js/search/local-search.js';
  const els = {
    '#local-search .search-dialog': makeElement(),
    '.local-search-box--input': makeElement(),
    '#local-search .search-wrap': makeElement(),
    '#local-search-results': makeElement(),
    '#loading-database': makeElement(),
    '#loading-status': makeElement(),
    '#search-button': makeElement(),
    '#search-mask': makeElement()
  };
  els['#local-search .search-wrap'].style.display = 'none';

  const listeners = {};
  const doc = {
    readyState: 'complete',
    body: { style: {} },
    documentElement: makeElement(),
    currentScript: { src },
    querySelector(sel) { return els[sel] || null; },
    querySelectorAll() { return []; },
    getElementsByTagName(tag) {
      if (tag === 'script') return [{ src }];
      return [];
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {}
  };
  return { doc, els, listeners };
}

// DOMParser 桩：只实现本脚本用到的那几个方法，底层交给 cheerio 的 xml 模式
function makeDOMParser() {
  return function DOMParser() {
    this.parseFromString = function (text) {
      const $ = cheerio.load(text, { xmlMode: true });
      const wrapEl = (el) => ({
        textContent: $(el).text(),
        getAttribute: (name) => $(el).attr(name),
        getElementsByTagName: (tag) => $(el).find(tag).toArray().map(wrapEl)
      });
      return {
        getElementsByTagName: (tag) => $(tag).toArray().map(wrapEl)
      };
    };
  };
}

function load({ xml = SAMPLE_XML, fetchImpl, scriptSrc } = {}) {
  const { doc, els, listeners } = makeDom(scriptSrc);
  const fetchCalls = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    document: doc,
    location: { href: 'http://localhost:4000/', origin: 'http://localhost:4000' },
    URL,
    DOMParser: makeDOMParser(),
    setTimeout,
    clearTimeout,
    fetch(url) {
      fetchCalls.push(url);
      if (fetchImpl) return fetchImpl(url);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(xml) });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'local-search.js' });
  return { sandbox, doc, els, listeners, fetchCalls };
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

test('首次打开才取数据，取到后露出输入框并隐藏 loading', async () => {
  const { sandbox, els, fetchCalls } = load();

  assert.equal(fetchCalls.length, 0, '挂载时不应该立刻请求');
  sandbox.fomalLocalSearch.open();
  assert.deepEqual(fetchCalls, ['/search.xml'], '打开搜索时才请求 search.xml');

  await tick();
  assert.equal(els['#loading-database'].style.display, 'none', '取到数据后要收起 loading');
  assert.equal(els['#local-search .search-wrap'].style.display, 'block', '输入框容器要显示出来');
  assert.equal(els['#search-mask'].style.display, 'block', '遮罩要一起显示，否则点空白关不掉');

  sandbox.fomalLocalSearch.close();
  assert.equal(els['#search-mask'].style.display, '', '关闭时遮罩一起收起');
  assert.equal(els['#local-search .search-dialog'].style.display, '', '关闭时面板一起收起');
});

test('关键词命中：标题优先、正文可搜、结果带高亮与正确链接', async () => {
  const { sandbox, els } = load();
  sandbox.fomalLocalSearch.open();
  await tick();

  sandbox.fomalLocalSearch.search('github');
  const html = els['#local-search-results'].innerHTML;
  assert.match(html, /\/posts\/8b9651a9\.html/, '命中文章要给出链接');
  assert.match(html, /<em class="search-keyword">GitHub<\/em>/i, '命中词要高亮');
  assert.match(els['#loading-status'].textContent, /共 1 条结果/, '状态栏给出结果数');
});

test('正文里的 HTML 标签与代码块不会漏进摘要', async () => {
  const { sandbox, els } = load();
  sandbox.fomalLocalSearch.open();
  await tick();

  sandbox.fomalLocalSearch.search('github');
  const html = els['#local-search-results'].innerHTML;
  assert.doesNotMatch(html, /<h2/, '不应把正文标签原样塞进结果');
  assert.doesNotMatch(html, /&lt;h2/, '也不应把转义后的标签当成正文展示');

  sandbox.fomalLocalSearch.search('only-in-code-block');
  assert.match(els['#local-search-results'].innerHTML, /没有找到相关内容/, '代码块内容不参与检索');
});

test('多个关键词需要全部命中；空查询清空结果', async () => {
  const { sandbox, els } = load();
  sandbox.fomalLocalSearch.open();
  await tick();

  sandbox.fomalLocalSearch.search('开站 github');
  assert.match(els['#local-search-results'].innerHTML, /\/posts\/8b9651a9\.html/, '两个词都命中同一篇');

  sandbox.fomalLocalSearch.search('开站 timeline');
  assert.match(els['#local-search-results'].innerHTML, /没有找到相关内容/, '分布在不同文章里不算命中');

  sandbox.fomalLocalSearch.search('   ');
  assert.equal(els['#local-search-results'].innerHTML, '', '空查询清空列表');
  assert.equal(els['#local-search .search-wrap'].style.display, 'none', '空查询收起结果区');
});

test('数据请求失败时给出可读提示，而不是空白', async () => {
  const { sandbox, els } = load({
    fetchImpl: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
  });
  sandbox.fomalLocalSearch.open();
  await tick();
  assert.match(els['#local-search-results'].innerHTML, /搜索数据加载失败/);
});

test('部署在子目录时按脚本自身路径推出数据地址', async () => {
  // 模拟 GitHub Pages 项目站：脚本在 /my-blog/js/search/local-search.js，
  // 数据就该去 /my-blog/search.xml 取，而不是写死的 /search.xml
  const { sandbox, fetchCalls } = load({ scriptSrc: 'http://localhost:4000/my-blog/js/search/local-search.js' });
  sandbox.fomalLocalSearch.open();
  await tick();
  assert.deepEqual(fetchCalls, ['/my-blog/search.xml']);
});

test('脚本来自异源 CDN 时退回站点根路径', async () => {
  const { sandbox, fetchCalls } = load({ scriptSrc: 'https://cdn.example.com/js/search/local-search.js' });
  sandbox.fomalLocalSearch.open();
  await tick();
  assert.deepEqual(fetchCalls, ['/search.xml']);
});

test('真实构建产物 public/search.xml 能被同一套解析逻辑读出来', { skip: !fs.existsSync(xmlPath) }, async () => {
  const realXml = fs.readFileSync(xmlPath, 'utf8');
  const { sandbox, els } = load({ xml: realXml });
  sandbox.fomalLocalSearch.open();
  await tick();

  const entries = (realXml.match(/<entry>/g) || []).length;
  assert.ok(entries > 0, '构建产物里应至少有 1 篇可搜索的文章');

  sandbox.fomalLocalSearch.search('Hexo');
  assert.match(els['#local-search-results'].innerHTML, /search-result/, '真实数据也应渲染出摘要');
});