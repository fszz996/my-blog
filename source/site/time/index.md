---
title: 旧时光
date: 2026-11-22 20:30:00
comments: false
---

{% timeline 本站建设进程 %}

<!-- timeline 2026-11 -->

1. **11-22 建站**：用 Hexo + Fomalhaut 主题起站，站点名、作者、头像、社交链接换成自己的；关掉还没配好的 Algolia、Twikoo 评论、AI 助手和贡献日历，搜索改用零后端的本地搜索

<!-- endtimeline -->

<!-- timeline 2026-11-23 -->

1. **11-23 收尾**：清掉模板自带的演示内容 —— 关于页重写为个人介绍，删掉用不上的「朋友圈」，友人帐与页脚占位头像全部换成自己的
2. 画廊的 54 张外链占位图换成用代码生成的 16 张壁纸（`tools/generate-wallpapers.py`，可随时重新生成），不再依赖图床
3. 导航重排为「首页 / 文章 / 收藏 / 关于」四组，补上分类、标签入口
4. 修掉本地搜索 404：主题模板引用的 `/js/search/local-search.js` 其实不存在，补了一份实现（首次打开才取 `search.xml`、标题优先排序、关键词高亮），并配上 `tools/tests/local-search.test.cjs` 回归测试
5. 默认壁纸从 picsum 外链换成本地生成的壁纸，首屏不再等外网；顺手删掉两段「线路延时」脚本和两枚名不副实的页脚徽标

<!-- endtimeline -->

{% endtimeline %}

{% note default flat %}
以后的改动也会记在这里，当作给自己的施工日志。想看更细的技术笔记，写在 <a href="/archives/">归档</a> 里的文章里。
{% endnote %}