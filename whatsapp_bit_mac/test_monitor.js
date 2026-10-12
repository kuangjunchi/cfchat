const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const http = require('node:http');
const WebSocket = require('ws');
const { READ_UNREAD, inspectWindow } = require('./cdp');

test('标题未读数能点亮窗口', () => {
  const document = { title: '(3) WhatsApp', querySelectorAll: () => [] };
  const result = vm.runInNewContext(READ_UNREAD, { document });
  assert.equal(result.count, 3);
  assert.ok(result.signature);
});

test('聊天列表的未读图标能点亮窗口', () => {
  const row = { innerText: '联系人\n一条新消息' };
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

test('通过调试端口只检查 WhatsApp 页面', async () => {
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
    socket.send(JSON.stringify({ id: request.id, result: { result: { value: { count: 2, signature: '两个未读' } } } }));
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await inspectWindow(server.address().port);
    assert.equal(result.hasWhatsapp, true);
    assert.equal(result.count, 2);
    assert.equal(result.tab.id, 'wa');
  } finally {
    socketServer.close();
    await new Promise(resolve => server.close(resolve));
  }
});
