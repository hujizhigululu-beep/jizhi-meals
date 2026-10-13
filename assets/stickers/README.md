# 内置轻量贴纸

`catalog.json` 定义稳定 ID、分类与 SVG 资源。记录只引用 ID；原始图片不写入记录或 JSON 备份。旧版 8 个 ID、资源路径和署名保持兼容，图库扩展至 28 枚。

`stickers.js` 是运行时目录，`STICKER_GROUPS` 按吃饭、学习、运动、心情、生活、装饰排序。原来的 `STICKERS`、`STICKER_IDS`、`getSticker`、`stickerById`、`stickerPath` API 继续可用。`src` 是相对项目根目录的固定离线资源地址；`file` 是相对本贴纸目录的资源地址，新贴纸可复用 `../share-art/` 或 `../notebook-ui/` 中的原创图案。

- `milk.svg`：复用机智定食原有 `assets/milk-carton.svg` 原创奶盒。
- `strawberry.svg`：复用已有 OpenMoji 草莓路径。作者为 OpenMoji contributors，授权 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，来源 [OpenMoji](https://openmoji.org/)。图像路径未修改；补充标题及署名说明。使用处与导出图片保留署名。
- `book.svg`、`shoe.svg`、`star.svg`、`heart.svg`、`bow.svg`、`fork.svg`：为机智定食制作的原创 SVG 贴纸。
- 新增 10 枚原创图案：书包、哑铃、睡脸、开心笑脸、小猫、画笔、耳机、购物袋、扫帚、洗衣。采用奶油白描边、浅棕色线条和马卡龙辅助色。
- 其余 10 枚复用本项目原创分享插画与小冰箱插画，包括可颂、便当、布丁、铅笔、散步路牌、相机、小冰箱、小花、草莓邮票和信封；不新增外部图片或网络资源。

`sticker-picker.js` 只读取白名单 ID，提供分类、最近、常用与已选贴纸展示。打开或切换分类不写入记录，也不会生成“最近使用”数据；没有最近记录时会明确显示常用推荐。每个 ID 只生成一个可操作按钮，已选贴纸显示在上方，可再次点击移除。实际选择数量、最近使用持久化和备份兼容由应用的数据层负责；每一天和每张分享卡片仍最多选择 3 枚。

日页使用 `data-day-sticker` / `data-day-sticker-group`，分享编辑器使用 `data-share-sticker` / `data-share-sticker-group`。两个场景都输出 `data-sticker-group`。选择器不接收自定义图片路径，用户参数不会进入 HTML 或图片地址。

新增或替换资源时保留已发布 ID，使用预设展示位置，避免图片内容进入记录数据；第三方资源应同时更新目录中的来源与授权字段。图库模块、目录与所有本地 SVG 应同时加入 PWA 离线缓存。草莓的 OpenMoji 署名在选择器与已有导出逻辑中继续保留。
