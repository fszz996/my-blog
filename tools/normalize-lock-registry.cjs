#!/usr/bin/env node
'use strict';
/**
 * tools/normalize-lock-registry.cjs —— 把 package-lock.json 里的镜像源换回官方 registry
 * ============================================================================
 * 【为什么需要】
 *   本仓库的 lock 是在国内用 npmmirror 生成的，`packages[*].resolved` 里 1300 多个包的
 *   下载地址都指向 https://registry.npmmirror.com/…。GitHub Actions 的 runner 在境外，
 *   从这个镜像批量拉包会大量超时，`npm ci` 直接失败（实测 CI 两次都卡在「安装依赖」）。
 *
 *   npm ci 会严格按 lock 里的 resolved 地址下载，改 registry 配置也没用；
 *   所以在上传 runner 上、安装之前把主机名换回官方源。版本号与 integrity 都不动，
 *   依赖版本不会漂移。
 *
 * 【用法】
 *   node tools/normalize-lock-registry.cjs            # 就地改写 package-lock.json
 *   node tools/normalize-lock-registry.cjs --check    # 只报告会改多少处，不写文件
 *
 * 【注意】只在 CI 里跑。本地开发保持 npmmirror 更好用；这个脚本会改文件，
 *   所以用它之后记得 `git checkout package-lock.json`（或直接跑在 runner 的临时工作区）。
 */

const fs = require('node:fs');
const path = require('node:path');

const LOCK = path.join(process.cwd(), 'package-lock.json');
const FROM = /https?:\/\/registry\.npmmirror\.com\//g;
const TO = 'https://registry.npmjs.org/';

if (!fs.existsSync(LOCK)) {
  console.error('[normalize-lock] 找不到 package-lock.json');
  process.exit(1);
}

const before = fs.readFileSync(LOCK, 'utf8');
const hits = (before.match(FROM) || []).length;
const after = before.replace(FROM, TO);

console.log(`[normalize-lock] 命中 ${hits} 处 npmmirror 地址`);

if (process.argv.includes('--check')) {
  console.log('[normalize-lock] --check 模式，不写文件');
  process.exit(0);
}

if (hits === 0) {
  console.log('[normalize-lock] 已经是官方源，无需改写');
  process.exit(0);
}

fs.writeFileSync(LOCK, after, 'utf8');
console.log(`[normalize-lock] 已改写，全部指向 ${TO}`);