# 机智定食 · jizhi-meals

可在 iPhone 主屏幕打开的私人餐食手账，支持餐食日历、食材库存和 JSON 备份。纯静态网页，无需服务器或苹果开发者账号。

## 免费发布到 GitHub Pages

1. 登录 GitHub，打开本仓库的 [Settings → Pages](https://github.com/hujizhigululu-beep/jizhi-meals/settings/pages)。手机上看不到 Settings 时，可在 Safari 中请求桌面网站。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. 在 **Branch** 选择 **main**，文件夹选择 **/ (root)**，点击 **Save**。
4. 等待 GitHub 完成发布。Pages 设置页会显示发布地址；部署进度可在仓库的 Actions 中查看。
5. 发布成功后打开：https://hujizhigululu-beep.github.io/jizhi-meals/

注意：上述网址只有在 Pages 发布成功后才可使用。仓库文件已上传不代表网站已经上线。

## 安装到 iPhone 主屏幕

建议使用 iOS 15.4 或更新版本。

1. 用 **Safari** 打开已发布的网址，首次打开保持联网。
2. 点击 **分享 → 添加到主屏幕**。较新 iOS 如显示“作为网页 App 打开”，请开启；名称可保留“机智定食”。
3. 点击 **添加**，再从主屏幕上的图标打开。
4. 打开 **我的设置**，等待显示“离线资源已缓存”。之后可开启飞行模式，关闭再打开应用，确认手账仍能显示和操作。

若网站显示 404，请先核对 Pages 设置和部署是否完成，不要把仓库的 github.com 页面当作应用网址。若没有“添加到主屏幕”，先确认正在使用 Safari，并在分享菜单中向下滚动查看。

## 保存与迁移数据

餐食和库存保存在当前设备的浏览器本地，不会自动同步到 GitHub、其他手机或其他浏览器。主屏幕应用与 Safari 中的记录也应在安装后核对。

- 在 **我的设置 → 导出 JSON 备份** 保存到“文件”或 iCloud Drive，并确认文件已保存。
- 更换设备、网站地址，或安装后没有看到原记录时，在原位置导出，再在新位置选择 **导入 / 恢复**。
- 导入会替换整本手账，确认前会显示内容摘要；请先备份现有数据。
- 清理网站数据或删除主屏幕应用可能导致记录丢失，请定期备份。

## 开发与资源

直接使用静态 HTTP 服务托管仓库根目录；正式安装和离线缓存需 HTTPS（本地开发可用 localhost）。

食物插画来自 OpenMoji，授权与逐项来源见 [资源说明](assets/credits.html)。应用图标和牛奶纸盒为本项目原创。
