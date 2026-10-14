# 草莓邮局 · 第二期交付记录

独立测试站：https://jizhi-dingshi-ai-test.hujizhigululu.chatgpt.site/
邮局直接入口：https://jizhi-dingshi-ai-test.hujizhigululu.chatgpt.site/#postoffice
原仓库分支：feature/ai-test；正式版main、网址和Pages来源不改。站点当前访问配置为public，保持现有设置，没有扩大访问权限。

## 本期功能

- 四项独立多行编辑：用户设定、角色设定、写作预设、邮局任务指令。逐项保存/恢复默认，不自动覆盖编辑；最原终一、小tt仅提供简要可编辑示例。
- 选择一个日期，日记（含心情/小确幸）、餐食、运动、学习默认不选。只按选择整理当天内容，发送前可改全文；改变日期/选择时，手写补充需确认才会替换。
- 生成使用当前编辑的四项提示词，按用户、角色、写作、任务、日期记录的順序完整发送；自然语言来信，不要求JSON。可设大致篇幅，120秒超时、取消、明确失败说明、用户主动重新生成。长预设警示上下文未知，不静默删字；finish_reason=length显示不完整。
- 只有点收藏才本地保存日期、角色、正文、生成时间；可读历史、删除，不修改日记。来信与已保存预设进入现有JSON备份/恢复；schema1—4旧备份兼容，schema4可选postOffice扩展，损坏或未知字段拒绝覆盖原JSON。
- Key/Base/模型选择共享页面会话，不持久化。Base+Key填好后自动GET /models，模型ID搜索/选择，保留手填后备；更改接口/Key取消旧请求及旧列表。生成生活来信仍必须用户点击。
- 一期数据首次邮局保存前留完整原文到jizhi-ai-test-book-ai2-upgrade-backup，失败不覆盖。数据与cache使用独立AI命名空间，新SW按整体缓存，新增模块可离线加载。

## 文件

新增：post-office.js、post-office-view.js、post-office-entry.js、post-office.css、ai-session.js、tests/post-office.test.mjs、tests/post-office.browser.mjs、本文档。
更新：ai-api.js、ai-lab.js、app.js、model.js、storage.js、settings-view.js、notebook-header.js、index.html、sw.js、package.json、README.md及针对版本/新字段的既有测试。应用没有新增运行时依赖。

## 验证边界

271项Node测试、所有JS语法检查通过。浏览器专项与发布后验证完成后追加。
用户截图已显示一期真实Key的HTTP200及模型回复；我们未读取或提取该Key。本期自动模型列表、长预设生成及收藏流程的自动测试使用模拟API与人工记录，真实Key模型清单、真实角色文笔、真手机体验仍需用户手动验证。

每预设/记录/信件的技术上限为300000字符，邮局收藏最多1000封，总文本上限1500000字符；超限明确提示原文保留，不截断。受浏览器存储配额限制，保存失败时提示且不覆盖原数据。模型上下文/tokenizer容量未提供，不宣称准确token估计；总输入字符较长时生成前明确提醒。

接口形状参考 [OpenAI Models](https://developers.openai.com/api/reference/resources/models/methods/list) 与 [Chat Completions](https://developers.openai.com/api/reference/resources/chat)。中转站是否提供/models仍取决于该站实际支持范围。

## 完成的浏览器回归

Chromium 21项、WebKit 20项全套专项通过；恢复/清空/发送预览清理另补3项×两个引擎，全部通过。没有未捕获JS错误或Key日志，320/390/430px无横向溢出，输入16px、按钮至少44px。Chromium验证隔离SW及离线邮局、收藏和基础手账；WebKit环境不提供SW，相关流程由Chromium覆盖。一期连接实验室SW离线专项1项也通过。

回归覆盖自动模型发现、失败手填、改Key/Base取消旧目录、35000字符Tavo全文、分项保存/恢复、两角色独立、预览精确payload、主动生成/再生成、120秒超时、取消及切页、显式收藏/删除后再收藏、JSON新旧恢复与一期原JSON升级备份、clear/restore丢弃旧内存草稿，以及原餐食/库存/日记/学习运动保存。

## 发布后核验

第二期已发布到原独立测试网址，Site版本2，源提交fae2fb62a4db81574f45eb0d4e4f684d0ba1ce4b；现有public访问方式保持不变。公开站点Chromium手机390×844入口HTTP200，邮局默认全部生活类别不选，0横向溢出。用明显无效的模拟Key、人工探测内容，实际浏览器分别GET /v1/models及POST /v1/chat/completions，两者返回可读HTTP401；刷新后无Key/发送草稿。没有真实Key或真实生活数据传输，不声称已验证真实模型清单与第二期模型正文。

正式版HTTP200，HTML SHA-256仍为9BF6DB4CC911E480604A3E9D8F6B6AB4F9728D4D038ABC8B5F5EB8CFFC8608AB；远程main仍9c41c32d148e4d0bf50c4c70f3baf047f6fc5da7。未改正式Pages，未合并main。本地实验分支已推送。

更新前建议先导出JSON；若旧测试窗口仍显示一期，关闭所有测试版窗口/主屏幕应用后重开，让整套新离线资源生效。Key仍需重新填写。真手机Safari/安卓Chrome与真实Key的模型目录、角色文笔、长上下文支持由用户验收。
