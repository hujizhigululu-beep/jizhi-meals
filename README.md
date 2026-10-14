# 🍓 机智定食-ai测试版本

基于正式版 V1.5.0（9c41c32）的独立 API 连通性实验。保留草莓牛奶手账、餐食、库存、日记、学习运动、月历、贴纸和 PNG 分享。本期只增加固定消息连接测试。

- 正式版：https://hujizhigululu-beep.github.io/jizhi-meals/
- 独立测试版：https://jizhi-dingshi-ai-test.hujizhigululu.chatgpt.site/
- 原仓库实验分支：feature/ai-test。禁止合并到正式 main 或改变正式版 Pages 来源。
- 测试版为独立 Sites 域名，默认仅站点所有者访问；手机可能需要登录创建站点的账号。

## 手机测试

1. 在「我的设置」展开「🍓 草莓邮局 · AI 连接实验室」。
2. Base URL 默认 https://www.jiemomo.com/v1，手动填写独立、低额度测试 Key 和中转站模型 ID。
3. 点击「测试连接」，只发送「你好，请用一句话回复：草莓邮局连接成功」。最多等待 30 秒，可以取消。
4. 查看模型实际文本或失败原因；完成后点击「清除本次密钥」。刷新后重新填写 Key。

Key 只在当前页面内存，不保存到 localStorage、sessionStorage、IndexedDB、JSON 备份或分享图片。请拒绝浏览器和密码管理器保存 Key。前端直连有密钥风险，不要使用正式或高额度密钥。

仅允许 HTTPS，已有 Base 路径后接 /chat/completions，不再添加 /v1；也接受完整 endpoint。不拉取模型列表、不发送生活记录、不使用额外代理、不放宽浏览器安全设置。网络失败可能来自 CORS、TLS、重定向或服务不可达，浏览器不一定能区分。

## 隔离与开发

测试手账从空数据开始，不自动复制正式数据。主数据、升级备份和查看偏好均以 jizhi-ai-test- 命名；缓存以 jizhi-ai-test-shell- 命名。Service Worker 仅处理自身 scope 内同源 GET，AI POST 不进入缓存。Manifest 名称和 ID 独立，资源使用相对路径。手账可离线，连接测试必须联网。

原 JSON 格式兼容，本次实验建议使用测试记录。Node 24 下运行 npm run check、npm test；专项浏览器检查 npm run test:ai-browser 需要开发环境 Playwright（应用无运行时第三方依赖）。

验证与回退见 [AI 测试版交付记录](AI-TEST.md)，插画授权见 [资源说明](assets/credits.html)。
