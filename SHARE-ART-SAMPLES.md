# 分享模板美术样板（本地审阅）

本轮仅重画草莓牛奶手账、活力徽章板和一天生活拼贴；另外五套模板保留 V1.4 的构图。

- **草莓牛奶手账**：草莓邮票页头、装订孔、粉色波点、原创餐食插画与错落餐桌纸片。
- **活力徽章板**：洞洞板、织带奖牌、活动签条、可爱运动鞋与蝴蝶结；只展示真实活动和既有统计。
- **一天生活拼贴**：逐条餐食纸片、运动票据、学习网格、心情邮票、小确幸便签和日记信纸。

保留模板 ID、分享选项、隐私开关、系统分享与下载入口。文字仍由 Canvas 按字素测量换行，用户输入不会进入 HTML、SVG 或资源地址。记录少时收成小卡片，长文字完整撑开纸面；容量超限沿用原有明确提示，不截掉正文。

## 改动范围

`share-art-strawberry.js`、`share-art-badges.js`、`share-art-collage.js` 分别持有主题和版面。`assets/share-art/` 存放 16 份原创本地 SVG。原 `share-layouts-a.js` / `share-layouts-b.js` 接入三套版面，`share-journal.js` 仅增加本地 SVG、旋转纸片、阴影和按内容确定高度的绘制能力。

`sw.js` 为整套资源设置新的开发缓存版本，并预缓存新增绘制模块与 SVG。`package.json` 补充语法检查和样板验证命令。

`app.js` 仅同步离线状态检查的缓存版本常量。没有修改 `model.js`、`storage.js`、`activity.js`、月历、打卡、库存或备份代码；`prepareJournalShare` 的数据筛选、统计和隐私逻辑也保持原样。

## 预览与复现

```sh
npm run check
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:share-art
```

默认输出 `/workspace/artifacts/jizhi-share-art/`（可用 `SHARE_ART_OUTPUT` 改目录）：

- `strawberry.png`、`badges.png`、`collage.png`：实际 PNG 样板，使用示例记录。
- `*-sparse.png`、`*-long-text.png`、`*-square.png`、`*-range.png`：稀疏、长文、方图与跨年检查图。
- `chromium-art-results.json`：完整文本、安全、尺寸与数据不变检查结果。

本地 Chromium 手机尺寸验证不代替真实 iPhone Safari / 主屏幕 PWA 保存相册的体验验收。本轮没有推送、合并或部署。

## 验证结果

- `npm run check`：全部绘制模块与现有模块语法检查通过。
- `npm test`：121 项单元测试全部通过。
- 样板浏览器验证：24 次真实 PNG 验证 + 3 次空记录拒绝通过；长文尾标记实际绘入 Canvas，三种格式、换行 Emoji、跨年范围、隐私开关、HTML 纯文本及原始数据不变通过。
- 八套分享回归：24 张真实 PNG、全部原模板与三种格式通过；包含带署名贴纸的方图。
- V1.4 App 全链路：8 个实际下载 PNG、36 项手机/安全区检查、85 个缓存资源、断网重载及 PNG/JSON 导出通过。旧测试对每张图片统一高 ≥1200px 的假设已调整，以允许稀疏记录自然收成小卡片，同时保留正尺寸与容量检查。

上述浏览器结果为本地 Chromium；本轮没有 iPhone 实机或 WebKit 验证。
