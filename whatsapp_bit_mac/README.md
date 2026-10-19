# 比特 WhatsApp 消息监控（macOS Apple Silicon）

适用设备：M 系列芯片 Mac，macOS 12 或更高版本。

## 使用

1. 解压 GitHub Actions 提供的 macOS Apple Silicon 构建包，打开其中的 `release` 文件夹。保持 `BitWhatsAppWatch.app` 和 `Open-on-Mac.command` 在同一个文件夹，首次运行时双击 `Open-on-Mac.command`。
2. 在同一台 Mac 上启动比特浏览器，确保本地 API 已开启（默认 `127.0.0.1:54345`）。
3. 打开需要监控的比特窗口，在其中登录 `web.whatsapp.com`。
4. 程序默认监控所有已打开窗口。也可以切换“按分组”，选择分组后只看该分组当前已打开的窗口。
5. “忽略已静音聊天”默认勾选，静音群或联系人有未读消息时不点亮绿点。取消勾选可恢复全部未读统计。
6. 有未读消息时列表显示绿点。点击窗口行会切到对应 WhatsApp 页面并把浏览器窗口置前；点击后绿点清除，新消息到来时再显示。

首次切换窗口时，macOS 可能要求允许本程序使用“辅助功能”和“自动化”。请在“系统设置 → 隐私与安全性”中允许。如果 macOS 阻止脚本首次打开，可以在 Finder 中按住 Control 点击 `Open-on-Mac.command`，选择“打开”。

程序每 5 秒检查一次。勾选忽略静音时，程序仅根据当前聊天列表中可识别的未读标记和静音标识统计，不使用无法区分静音状态的标签标题总数；未加载到列表中的聊天可能暂时无法提醒。取消勾选后会再次使用标题总数。数据只在本机处理；WhatsApp 更新界面后，识别规则可能需要调整。程序不会发送消息，也不会启动或关闭比特窗口。

## 重新构建

项目根目录的 `.github/workflows/bit-whatsapp-watch-mac.yml` 可在 GitHub Actions 的 Apple Silicon Mac 运行器上打包并进行临时签名。`build_mac_zip.py` 只供排查和临时修复；正式交付以 GitHub 原生构建包为准。

在 macOS 上本地构建：

```bash
npm ci
npm run build:mac
codesign --force --deep --sign - dist/BitWhatsAppWatch-darwin-arm64/BitWhatsAppWatch.app
```
