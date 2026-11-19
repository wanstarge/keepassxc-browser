# 自用 Firefox 版本维护

维护分支：`personal/firefox-signed`。两个功能修复及测试单独留在 `fix/autocomplete-viewport` 的一个提交中，上游 PR 不包含本目录和个人打包配置。

## 固定身份与版本

- 扩展名称：KeePassXC-Browser (wanstarge fork)，属于非官方分支。
- 独立 ID：`keepassxc-browser-scrollfix@wanxingge.site`。首次 AMO 接受后保持不变；后续版本在同一个扩展条目下提交。
- 当前个人版本：`1.10.4.1002`。这是基于上游 `1.10.4.1` 的个人版本号；1001 是首次打包验证版本，1002 统一了文本换行。下一次使用 `1.10.4.1003`，不能重复提交同一个版本号。更新上游基线时重新选择大于已发布版本的号码。
- 运行范围：Firefox 142+，使用内置数据许可界面。向本地 KeePassXC 传输认证信息、网页活动和网页内容，因此没有声明 `none`。
- 使用 Mozilla 自行分发签名（unlisted），当前采用手动安装更新，未配置自动更新服务器。Firefox 正式版不接受自己生成证书的“自签名”。

配置在 `tools/firefox-personal.json`。原始 Firefox 清单继续保持上游样式，个人差异只在输出目录中生成。

## 生成上传文件

需要 Git、PowerShell 7。打包不压缩或转译 JavaScript，不需要 Node.js、Transifex、Qt 或 C++ 编译器。

```powershell
cd E:\Projects\keepassxc-browser
git switch personal/firefox-signed
.\tools\build-personal-firefox.ps1
```

默认输出：

- `build/firefox-personal`：个人版解压目录，含独立 ID。
- `build/keepassxc-browser-personal-1.10.4.1002.zip`：提交给 AMO 的未签名包。
- `build/keepassxc-browser-personal-1.10.4.1002-source.zip`：Git HEAD 的源码包，不含本地报告、node_modules、账号及密钥。
- 同名前缀的 `-build.json`：提交号、工作区是否干净及两个压缩包的 SHA-256。

提交前先 commit 并重新生成，确认 build.json 的 `workingTreeClean` 为 true。输出中的文本统一为 UTF-8/LF，避免 Git 的 Windows 换行转换影响复现。ZIP 时间戳可能不同；解压后的文件内容及清单应一致。可以覆盖版本号试打包，但正式发布应先更新 JSON 配置并提交。

```powershell
npx --yes web-ext@10 lint --source-dir build/firefox-personal --output json
```

当前代码完整测试为 66 项通过、2 项原有跳过。打包配置变化只需要校验生成清单、资源、源文件一致性和 AMO lint；修改功能代码时再运行相应测试及完整必要检查。

## 网页签名与安装

1. 在 https://addons.mozilla.org/developers/ 使用自己的 Mozilla 账号登录，首次使用阅读并接受开发者协议。
2. 提交新扩展，选择 **On your own / 自行分发**，上传个人版本 ZIP。以后在同一扩展下提交新版本。
3. 提供同版本源码 ZIP，以及 `docs/amo-reviewer-notes.md` 中的构建和第三方库说明。警告需要向审核者说明；本地 lint 通过不代表已签名。
4. 完成提交后等待 AMO 校验/签名。下载其返回的签名 XPI，存入 `build/signed`；不要改动 XPI 内的文件。
5. Firefox 的 about:addons 中选择“从文件安装附加组件”。先停用其他 KeePassXC-Browser 版本，避免同页出现两个扩展；不要为了停用而删除原版设置。
6. 独立 ID 使用独立浏览器存储，需要重新配对桌面 KeePassXC。数据库仍保存在桌面版，浏览器配对信息不会自动从官方 ID 迁移。
7. 确认名称和版本、扩展能连接桌面版，选择账号填充，并重试原来的 Apple 登录路径。完成后重启 Firefox 确认签名版仍在。

如以后采用命令行签名，API 凭据只保存在安全凭据存储或由用户提供的临时环境变量中，不能写入仓库或日志。当前流程不依赖 GitHub CLI 授权。

## 桌面版连接许可

Mozilla 签名解决的是 Firefox 是否信任扩展；桌面原生消息清单按扩展 ID 判断谁能连接，两者是不同条件。

桌面源码 `src/browser/NativeMessageInstaller.cpp` 的 `ALLOWED_EXTENSIONS` 保留官方 ID 并增加个人 ID。程序启动时会更新已启用浏览器的注册清单；不要只手工修改生成 JSON，否则会被后续重新生成覆盖。

本机继续直接运行：

```text
E:\Projects\keepassxc\build-win\src\Release\KeePassXC.exe
E:\Projects\keepassxc\build-win\src\Release\keepassxc-proxy.exe
```

重新编译前通过“数据库 → 退出”正常结束 KeePassXC，否则链接器无法覆盖运行中的 EXE：

```powershell
cmake --build E:\Projects\keepassxc\build-win --config Release --parallel 4
```

通过注册表 `HKCU:\Software\Mozilla\NativeMessagingHosts\org.keepassxc.keepassxc_browser` 的默认值定位实际 JSON，检查 `path` 仍是上述 proxy，`allowed_extensions` 同时包含官方和个人 ID。Firefox 与 Tor 可能共享该注册表项，不能仅凭 JSON 文件名判断错误。

## 跟随上游更新

```powershell
git fetch origin
git switch personal/firefox-signed
git merge origin/develop
```

先处理冲突并确认上游是否已有等价修复，避免重复逻辑。更新个人版本，运行必要测试，提交并重新打包，查看构建记录后再上传 AMO。两项修复的上游 PR 分支不推送个人打包提交。个人 ID 不变时，桌面许可补丁无需每个扩展版本都更改。
