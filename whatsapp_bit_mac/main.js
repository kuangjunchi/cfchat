const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { inspectWindow, activateTab } = require('./cdp');

const execFileAsync = promisify(execFile);
const API_HOST = '127.0.0.1';
const API_PORT = 54345;
const POLL_MS = 5000;
let win;
let mode = 'open';
let groupId = '';
let timer;
let scanning = false;
let profileCache = { key: '', at: 0, profiles: [] };
const entries = new Map();

function api(path, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: API_HOST,
      port: API_PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 4500
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          const result = JSON.parse(raw);
          if (result.success === false) reject(new Error(result.msg || '比特浏览器接口返回失败'));
          else resolve(result.data ?? result);
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('连接比特浏览器超时')));
    req.on('error', reject);
    req.end(data);
  });
}

async function allPages(path, extra = {}) {
  const items = [];
  for (let page = 0; page < 100; page++) {
    const data = await api(path, { page, pageSize: 100, ...extra });
    const batch = Array.isArray(data) ? data : (data.list || data.records || []);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

function send(name, value) {
  if (win && !win.isDestroyed()) win.webContents.send(name, value);
}

function viewEntries() {
  return [...entries.values()].sort((a, b) => {
    if (a.alert !== b.alert) return a.alert ? -1 : 1;
    return Number(a.seq || 0) - Number(b.seq || 0);
  }).map(({ id, seq, name, remark, groupId: entryGroupId, port, hasWhatsapp, count, alert, error }) => ({
    id, seq, name, remark, groupId: entryGroupId, port, hasWhatsapp, count, alert, error
  }));
}

async function refresh() {
  if (scanning) return;
  scanning = true;
  try {
    const ports = await api('/browser/ports');
    const openPorts = ports && typeof ports === 'object' ? ports : {};
    const cacheKey = mode === 'group' ? groupId : 'all';
    if (profileCache.key !== cacheKey || Date.now() - profileCache.at > 60000) {
      profileCache = {
        key: cacheKey, at: Date.now(),
        profiles: await allPages('/browser/list', mode === 'group' && groupId ? { groupId } : {})
      };
    }
    const profiles = profileCache.profiles;
    const profileMap = new Map(profiles.map(profile => [String(profile.id), profile]));
    const selected = Object.entries(openPorts).filter(([id]) => mode === 'open' || (groupId && profileMap.has(id)));
    const seen = new Set(selected.map(([id]) => id));
    for (const id of entries.keys()) if (!seen.has(id)) entries.delete(id);
    for (const [id, portValue] of selected) {
      const profile = profileMap.get(id) || {};
      const port = Number(portValue);
      const old = entries.get(id) || {};
      entries.set(id, {
        ...old, id, port, seq: profile.seq ?? old.seq ?? '',
        name: profile.name || old.name || `窗口 ${String(profile.seq || id).slice(0, 8)}`,
        remark: profile.remark || '', groupId: profile.groupId || '',
        hasWhatsapp: old.hasWhatsapp || false, count: old.count || 0,
        alert: old.alert || false, error: ''
      });
    }
    send('state', { connected: true, entries: viewEntries(), mode, groupId });
    for (let i = 0; i < selected.length; i += 8) {
      await Promise.all(selected.slice(i, i + 8).map(async ([id]) => {
        const entry = entries.get(id);
        if (!entry) return;
        try {
          const result = await inspectWindow(entry.port);
          entry.hasWhatsapp = result.hasWhatsapp;
          entry.count = result.count;
          entry.tab = result.tab;
          entry.error = '';
          if (result.count > 0 && result.signature !== entry.acknowledged) entry.alert = true;
          if (result.count === 0) {
            entry.alert = false;
            entry.acknowledged = '';
          }
          entry.signature = result.signature;
        } catch (error) {
          entry.error = `读取页面失败：${error.message}`;
          entry.hasWhatsapp = false;
        }
      }));
      send('state', { connected: true, entries: viewEntries(), mode, groupId });
    }
  } catch (error) {
    send('state', { connected: false, error: error.message, entries: viewEntries(), mode, groupId });
  } finally {
    scanning = false;
  }
}

async function focusMacWindow(port) {
  if (process.platform !== 'darwin') return;
  const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { timeout: 4000 });
  const pid = Number(stdout.trim().split(/\s+/)[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('找不到浏览器窗口进程');
  const script = `tell application "System Events"\nset targetProcess to first application process whose unix id is ${pid}\nset frontmost of targetProcess to true\ntry\nperform action "AXRaise" of front window of targetProcess\nend try\nend tell`;
  await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 5000 });
}

ipcMain.handle('groups', async () => {
  const groups = await allPages('/group/list', { all: true });
  return groups.map(item => ({ id: String(item.id), name: String(item.groupName || item.name || item.id) }));
});

ipcMain.handle('choose-mode', async (_event, nextMode, nextGroupId) => {
  if (!['open', 'group'].includes(nextMode)) throw new Error('无效模式');
  mode = nextMode;
  groupId = nextMode === 'group' ? String(nextGroupId || '') : '';
  if (nextMode === 'group' && !groupId) throw new Error('请先选择分组');
  profileCache.at = 0;
  entries.clear();
  await refresh();
});

ipcMain.handle('refresh', refresh);

ipcMain.handle('activate', async (_event, id) => {
  const entry = entries.get(String(id));
  if (!entry) throw new Error('该窗口已关闭');
  if (entry.tab) {
    try { await activateTab(entry.tab); }
    catch { /* 调试页面不可用时，仍尝试前置已打开的浏览器窗口 */ }
  }
  try { await focusMacWindow(entry.port); }
  catch (error) {
    throw new Error(`${error.message}。请在 macOS「系统设置 → 隐私与安全性 → 辅助功能」中允许本程序控制窗口`);
  }
  entry.acknowledged = entry.signature || '';
  entry.alert = false;
  send('state', { connected: true, entries: viewEntries(), mode, groupId });
});

app.whenReady().then(() => {
  const smokeTest = process.argv.includes('--smoke-test');
  win = new BrowserWindow({
    width: 770, height: 620, minWidth: 330, minHeight: 440,
    show: !smokeTest,
    title: '比特 WhatsApp 消息监控',
    backgroundColor: '#f6f8fa',
    webPreferences: { preload: require('node:path').join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile('index.html');
  if (smokeTest) {
    const deadline = setTimeout(() => {
      console.error('SMOKE_TIMEOUT: 界面加载超时');
      app.exit(1);
    }, 15000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(deadline);
      console.log('SMOKE_OK: 界面已加载');
      app.quit();
    });
    win.webContents.once('did-fail-load', (_event, code, description) => {
      clearTimeout(deadline);
      console.error(`SMOKE_FAILED: ${code} ${description}`);
      app.exit(1);
    });
  } else {
    win.webContents.once('did-finish-load', refresh);
    timer = setInterval(refresh, POLL_MS);
  }
});

app.on('window-all-closed', () => {
  clearInterval(timer);
  app.quit();
});
