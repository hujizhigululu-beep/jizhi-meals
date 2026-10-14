# 机智定食-ai测试版本 · 交付记录

日期：2026-10-14（北京时间）。正式版基线：9c41c32d148e4d0bf50c4c70f3baf047f6fc5da7，V1.5.0。

## 地址与部署

- 正式版：https://hujizhigululu-beep.github.io/jizhi-meals/
- 测试版：https://jizhi-dingshi-ai-test.hujizhigululu.chatgpt.site/
- 实验分支：https://github.com/hujizhigululu-beep/jizhi-meals/tree/feature/ai-test
- 未新建 GitHub 测试仓库。当前 GitHub connector 无新建仓库及 Pages 管理接口，采用用户允许的独立方案：Sites 独立域名与部署源。无需修改 GitHub Pages 设置。
- 默认仅所有者可访问；手机可能需要登录创建站点的账号。没有修改正式 Pages、main，也没有创建合并 PR。

正式网站首次检查 HTTP 200，HTML SHA-256 为 9BF6DB4CC911E480604A3E9D8F6B6AB4F9728D4D038ABC8B5F5EB8CFFC8608AB。最新 Pages workflow 为 dynamic/pages/pages-build-deployment，来自 main 基线提交且成功。Pages 管理接口不可读，来源依据公开 workflow 和实际资源核对。

## 文件变更

- ai-api.js：HTTPS/URL校验、固定 Chat Completions 消息、30秒超时、取消、HTTP/协议/网络提示、密钥回显屏蔽。
- ai-lab.js、ai-lab.css：默认折叠表单、隐藏/显示/清除密钥、安全提示、手机布局。
- ai-entry.js：独立入口与按需加载；AI 加载错误不阻断基础手账。
- index.html、notebook-header.js、settings-view.js、manifest.webmanifest：测试名称、标识、设置入口及相对资源路径。
- storage.js、app.js、sw.js：全部9个数据/备份/偏好键隔离，独立缓存前缀、明确scope和请求范围。库存算法、数据模型不改。
- package.json、新增 ai-api/ai-isolation 单测和 ai-lab 浏览器回归；继承浏览器fixtures改测试namespace，storage单测调整独立key断言。
- README.md、本文档。无应用运行时新增第三方依赖。

## 验证

完整语法检查通过；238项Node测试全部通过（原218项、10项API、10项隔离）。模拟API覆盖请求形状、HTTPS拒绝、URL拼接、成功文本、HTTP错误、超时取消、回显屏蔽。隔离测试确认正式9个键原样、迁移备份独立、缓存删除范围、路径scope、POST/跨源API不缓存。

Chromium 14项、WebKit 13项专项通过：手机320/390/430px无溢出；密钥刷新清除、JSON无密钥、取消/超时及真实基础操作通过。Chromium实测SW仅清理测试缓存、作用域为测试目录，离线重开后可保存餐食。WebKit运行环境不支持SW，相关实测由Chromium完成。

真实中转站无Key的OPTIONS预检返回204。实际Chromium浏览器从localhost以无效模拟Key和模拟模型ID发送固定测试句，得到可读HTTP401鉴权失败；该次请求跨域可达，没有真实模型成功回复。部署域名的核验记录见下方。

## 未验证与用户操作

没有真实API Key，未验证真实鉴权、模型权限、余额或模型成功回复。模拟成功、预检和无效密钥返回不算真实AI连接成功。请用户在手机上自行填Key和模型测试，不要发到聊天或仓库。

尚未在真实iPhone Safari/安卓Chrome、主屏幕PWA或系统密码管理器实测。浏览器引擎及手机尺寸模拟不能代替真机。私有站点的手机登录需要用户本人账号。

## 回退

关闭或停止使用测试站点即可，不影响正式版。保留或删除实验分支均可，禁止合并正式main。Sites更新从独立部署项目发布，不改正式Pages。不得将真实Key放入代码、配置、日志、截图或报告。

跨域说明参考 [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)，请求形状参考 [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat)。中转站支持范围以实际验证为准。

## 发布后实测

独立 Sites 发布成功，部署源提交为 0d75e0f9abc3ce16b52b701930213fada5cac69f。以平台提供的所有者站点服务访问机制，仅对本站请求发送平台鉴权头；该头不发送给中转站、不进入源代码、备份或报告。

发布域名的真实 Chromium 浏览器实测：HTTP 200；标题「机智定食-ai测试版本」；390×844手机尺寸页面横向溢出为0。浏览器从实际测试域名直接向配置中转站发固定测试消息，使用明显无效的模拟Key/模型ID，得到可读HTTP401鉴权失败。该次请求跨域可达，未验证真实Key及模型成功回复。完成后密钥已清除；截图不含密钥。

未登录的正常浏览器显示「需要登录」，因此手机需登录创建该站点的ChatGPT账号。真实手机的登录、主屏幕安装及真实Key调用需要用户本人验证，不能用所有者服务访问或桌面手机尺寸代替。

发布后正式网址仍HTTP200，HTML SHA-256与首次检查完全一致，HTML无ai-entry.js；远程main仍9c41c32d148e4d0bf50c4c70f3baf047f6fc5da7。原本地main工作区干净。实验分支已独立推送，未合并，也未改变正式Pages来源。无需用户手动修改任何GitHub设置。
