#!/bin/zsh

# 首次运行：清除下载隔离标记，在这台 Mac 上进行临时签名，然后打开程序。
set -euo pipefail
cd "${0:A:h}"

if [[ ! -d "BitWhatsAppWatch.app" ]]; then
  echo "未找到 BitWhatsAppWatch.app。请把本脚本和应用放在同一个文件夹。"
  read '?按回车退出……'
  exit 1
fi

echo "正在修复应用签名，请稍候……"
/usr/bin/xattr -dr com.apple.quarantine "BitWhatsAppWatch.app" 2>/dev/null || true
if ! /usr/bin/codesign --force --deep --sign - "BitWhatsAppWatch.app"; then
  echo "签名失败。请把上方错误信息发给我。"
  read '?按回车退出……'
  exit 1
fi
if ! /usr/bin/codesign --verify --deep --strict --verbose=2 "BitWhatsAppWatch.app"; then
  echo "签名校验失败。请把上方错误信息发给我。"
  read '?按回车退出……'
  exit 1
fi
echo "修复完成，正在打开程序。"
/usr/bin/open "BitWhatsAppWatch.app"
