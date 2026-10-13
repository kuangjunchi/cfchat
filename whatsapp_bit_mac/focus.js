const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const defaultExecFileAsync = promisify(execFile);

function createWindowFocuser({ api, execFileAsync = defaultExecFileAsync, platform = process.platform }) {
  return async profileId => {
    if (platform !== 'darwin') return;
    const id = String(profileId);
    const pids = await api('/browser/pids', { ids: [id] });
    const pid = Number(pids?.[id]);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('找不到浏览器窗口进程，请刷新窗口列表');

    const script = `tell application "System Events"
set targetProcess to first application process whose unix id is ${pid}
set frontmost of targetProcess to true
perform action "AXRaise" of front window of targetProcess
end tell`;
    try {
      await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 5000 });
    } catch (error) {
      throw new Error(`${error.message}。请在 macOS「系统设置 → 隐私与安全性 → 辅助功能」中允许本程序控制窗口`);
    }
  };
}

module.exports = { createWindowFocuser };
