const http = require('node:http');
const WebSocket = require('ws');

function getJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', part => { body += part; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('CDP 请求超时')));
    req.on('error', reject);
  });
}

function cdpCommand(wsUrl, method, params = {}, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { handshakeTimeout: timeoutMs });
    const timer = setTimeout(() => finish(new Error('CDP 响应超时')), timeoutMs);
    let done = false;
    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error); else resolve(result);
    }
    socket.on('open', () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on('message', data => {
      try {
        const message = JSON.parse(data.toString());
        if (message.id !== 1) return;
        if (message.error) finish(new Error(message.error.message));
        else finish(null, message.result);
      } catch (error) { finish(error); }
    });
    socket.on('error', finish);
  });
}

const READ_UNREAD = `(() => {
  const title = document.title || '';
  const titleCount = Number((title.match(/^\\((\\d+)\\)/) || [])[1] || 0);
  const icons = [
    ...document.querySelectorAll('[data-testid="icon-unread-count"], [data-icon="icon-unread-count"], [aria-label]')
  ].filter(el => {
    const label = el.getAttribute('aria-label') || '';
    return el.matches('[data-testid="icon-unread-count"], [data-icon="icon-unread-count"]') ||
      /(?:unread|未读|não lidas|no leídos|non lus|غير مقروء)/i.test(label);
  });
  const rows = [];
  for (const icon of icons) {
    const row = icon.closest('[data-testid="cell-frame-container"], [role="row"], [data-testid="chat-list-item"]');
    if (!row || rows.includes(row)) continue;
    rows.push(row);
  }
  const details = rows.map(row => (row.innerText || '').trim().slice(0, 350)).sort();
  const count = Math.max(titleCount, rows.length);
  return { count, signature: count ? JSON.stringify([titleCount, details]) : '' };
})()`;

async function listWhatsappTabs(port) {
  const tabs = await getJson(`http://127.0.0.1:${port}/json/list`);
  return tabs.filter(tab => tab.type === 'page' && /^https:\/\/web\.whatsapp\.com(?:\/|$)/i.test(tab.url || '') && tab.webSocketDebuggerUrl);
}

async function inspectWindow(port) {
  const tabs = await listWhatsappTabs(port);
  if (!tabs.length) return { hasWhatsapp: false, count: 0, signature: '', tab: null };
  const results = await Promise.all(tabs.map(async tab => {
    try {
      const response = await cdpCommand(tab.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: READ_UNREAD,
        returnByValue: true,
        awaitPromise: false
      });
      return { tab, value: response.result?.value || { count: 0, signature: '' } };
    } catch { return { tab, value: { count: 0, signature: '' } }; }
  }));
  const count = results.reduce((sum, item) => sum + item.value.count, 0);
  return {
    hasWhatsapp: true,
    count,
    signature: count ? JSON.stringify(results.map(item => [item.tab.id, item.value.signature])) : '',
    tab: results[0].tab
  };
}

async function activateTab(tab) {
  await cdpCommand(tab.webSocketDebuggerUrl, 'Page.bringToFront');
  try {
    const browser = await getJson(new URL('/json/version', `http://127.0.0.1:${new URL(tab.webSocketDebuggerUrl).port}`).href);
    if (browser.webSocketDebuggerUrl) {
      const result = await cdpCommand(browser.webSocketDebuggerUrl, 'Browser.getWindowForTarget', { targetId: tab.id });
      if (result.windowId != null) {
        await cdpCommand(browser.webSocketDebuggerUrl, 'Browser.setWindowBounds', {
          windowId: result.windowId,
          bounds: { windowState: 'normal' }
        });
      }
    }
  } catch { /* macOS 的原生置前会继续执行 */ }
}

module.exports = { inspectWindow, activateTab, getJson, cdpCommand, READ_UNREAD };
