"""从 Electron 官方 macOS ZIP 组装 Apple Silicon 应用，保留 Unix 权限与符号链接。"""

import copy
import json
import plistlib
import shutil
import subprocess
import zipfile
from pathlib import Path


SOURCE_ZIP = Path("vendor/electron-v38.3.0-darwin-arm64.zip")
APP_NAME = "BitWhatsAppWatch.app"
OUTPUT_ZIP = Path("dist/比特WhatsApp消息监控-macOS-AppleSilicon-修复版.zip")
STAGE = Path("stage")


def prepare_stage():
    if STAGE.resolve().parent != Path.cwd().resolve():
        raise RuntimeError("请在项目目录运行构建脚本")
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir()
    for name in ("main.js", "cdp.js", "preload.js", "renderer.js", "index.html", "style.css"):
        shutil.copy2(name, STAGE / name)
    package = json.loads(Path("package.json").read_text(encoding="utf-8"))
    package.pop("devDependencies", None)
    package.pop("scripts", None)
    (STAGE / "package.json").write_text(json.dumps(package, ensure_ascii=False), encoding="utf-8")
    shutil.copytree("node_modules/ws", STAGE / "node_modules/ws")
    Path("dist").mkdir(exist_ok=True)
    subprocess.run(["node", "node_modules/@electron/asar/bin/asar.mjs", "pack", "stage", "dist/app.asar"], check=True)


def build_zip():
    with zipfile.ZipFile(SOURCE_ZIP) as source, zipfile.ZipFile(OUTPUT_ZIP, "w") as output:
        for old in source.infolist():
            if not old.filename.startswith("Electron.app/"):
                continue
            new = copy.copy(old)
            new.filename = old.filename.replace("Electron.app/", APP_NAME + "/", 1)
            if new.filename == APP_NAME + "/Contents/Info.plist":
                info = plistlib.loads(source.read(old))
                info["CFBundleDisplayName"] = "比特 WhatsApp 消息监控"
                info["CFBundleName"] = "BitWhatsAppWatch"
                info["CFBundleIdentifier"] = "cn.xiaochi.bitwhatsappwatch"
                output.writestr(new, plistlib.dumps(info))
            else:
                with source.open(old) as reader, output.open(new, "w") as writer:
                    shutil.copyfileobj(reader, writer, length=1024 * 1024)
        asar = zipfile.ZipInfo(APP_NAME + "/Contents/Resources/app.asar")
        asar.create_system = 3
        asar.external_attr = 0o100644 << 16
        asar.compress_type = zipfile.ZIP_DEFLATED
        with Path("dist/app.asar").open("rb") as reader, output.open(asar, "w") as writer:
            shutil.copyfileobj(reader, writer, length=1024 * 1024)
        helper = zipfile.ZipInfo("Open-on-Mac.command")
        helper.create_system = 3
        helper.external_attr = 0o100755 << 16
        helper.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(helper, Path("Open-on-Mac.command").read_bytes())


if __name__ == "__main__":
    prepare_stage()
    build_zip()
    print(OUTPUT_ZIP)
