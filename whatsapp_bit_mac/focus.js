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
set visible of targetProcess to true
set targetWindow to front window of targetProcess
try
  if (value of attribute "AXMinimized" of targetWindow) is true then
    set value of attribute "AXMinimized" of targetWindow to false
  end if
end try
set frontmost of targetProcess to true
perform action "AXRaise" of targetWindow
delay 0.2
set isMinimized to false
try
  set isMinimized to value of attribute "AXMinimized" of targetWindow
end try
return (frontmost of targetProcess) and (visible of targetProcess) and (not isMinimized)
end tell`;
    let stdout;
    try {
      ({ stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 5000 }));
    } catch (error) {
      throw new Error(`${error.message}。请在 macOS「系统设置 → 隐私与安全性 → 辅助功能」中允许本程序控制窗口`);
    }
    if (String(stdout).trim() !== 'true') throw new Error('目标浏览器窗口没有显示在屏幕最前面');
  };
}

module.exports = { createWindowFocuser };
