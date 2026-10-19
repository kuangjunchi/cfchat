const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const http = require('node:http');
const WebSocket = require('ws');
const { READ_UNREAD, inspectWindow, readUnreadExpression } = require('./cdp');

test('关闭静音过滤后标题未读数能点亮窗口', () => {
  const document = { title: '(3) WhatsApp', querySelectorAll: () => [] };
  const result = vm.runInNewContext(readUnreadExpression(false), { document });
  assert.equal(result.count, 3);
  assert.ok(result.signature);
});

test('聊天列表的未读图标能点亮窗口', () => {
  const row = { innerText: '联系人\n一条新消息', querySelector: () => null };
  const icon = {
    getAttribute: () => '',
    matches: () => true,
    closest: () => row
  };
  const document = { title: 'WhatsApp', querySelectorAll: () => [icon] };
  const result = vm.runInNewContext(READ_UNREAD, { document });
  assert.equal(result.count, 1);
  assert.match(result.signature, /一条新消息/);
});

test('默认忽略静音聊天及无法区分来源的标题总数', () => {
  const mutedRow = { innerText: '静音群\n不需要提醒', querySelector: selector => selector.includes('mute') ? {} : null };
  const normalRow = { innerText: '客户\n请回复', querySelector: () => null };
  const icons = [mutedRow, normalRow].map(row => ({
    getAttribute: () => '', matches: () => true, closest: () => row
  }));
  const document = { title: '(5) WhatsApp', querySelectorAll: () => icons };
  const result = vm.runInNewContext(READ_UNREAD, { document });
  assert.equal(result.count, 1);
  assert.match(result.signature, /请回复/);
  assert.doesNotMatch(result.signature, /不需要提醒/);
  document.title = '(6) WhatsApp';
  assert.equal(vm.runInNewContext(READ_UNREAD, { document }).signature, result.signature);
});

test('用静音辅助标签识别聊天', () => {
  const row = {
    innerText: '静音群\n一条消息',
    querySelector: () => null,
    querySelectorAll: () => [{ getAttribute: name => name === 'aria-label' ? 'Notifications muted' : '' }]
  };
  const icon = { getAttribute: () => '', matches: () => true, closest: () => row };
  const document = { title: 'WhatsApp', querySelectorAll: () => [icon] };
  assert.equal(vm.runInNewContext(READ_UNREAD, { document }).count, 0);
});

test('取消忽略静音后恢复总未读统计', () => {
  const document = { title: '(5) WhatsApp', querySelectorAll: () => [] };
  const result = vm.runInNewContext(readUnreadExpression(false), { document });
  assert.equal(result.count, 5);
});

test('通过调试端口只检查 WhatsApp 页面', async () => {
  const expressions = [];
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify([
      { id: 'other', type: 'page', url: 'https://example.com/', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/other` },
      { id: 'wa', type: 'page', url: 'https://web.whatsapp.com/', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/wa` }
    ]));
  });
  const socketServer = new WebSocket.Server({ server });
  socketServer.on('connection', socket => socket.on('message', data => {
    const request = JSON.parse(data.toString());
    assert.equal(request.method, 'Runtime.evaluate');
    expressions.push(request.params.expression);
    socket.send(JSON.stringify({ id: request.id, result: { result: { value: { count: 2, signature: '两个未读' } } } }));
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await inspectWindow(server.address().port);
    assert.equal(result.hasWhatsapp, true);
    assert.equal(result.count, 2);
    assert.equal(result.tab.id, 'wa');
    await inspectWindow(server.address().port, false);
    assert.match(expressions[0], /const ignoreMuted = true/);
    assert.match(expressions[1], /const ignoreMuted = false/);
  } finally {
    socketServer.close();
    await new Promise(resolve => server.close(resolve));
  }
});
