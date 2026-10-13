const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowFocuser } = require('./focus');

test('按比特窗口 ID 前置其对应进程，而不是调试端口所属进程', async () => {
  const calls = [];
  const focus = createWindowFocuser({
    platform: 'darwin',
    api: async (path, body) => {
      calls.push(['api', path, body]);
      return { target: 4321, other: 9876 };
    },
    execFileAsync: async (file, args) => {
      calls.push(['exec', file]);
      assert.equal(file, '/usr/bin/osascript');
      assert.equal(args[0], '-e');
      assert.match(args[1], /unix id is 4321/);
      assert.doesNotMatch(args[1], /9876/);
      assert.match(args[1], /AXRaise/);
    }
  });

  await focus('target');
  assert.deepEqual(calls, [
    ['api', '/browser/pids', { ids: ['target'] }],
    ['exec', '/usr/bin/osascript']
  ]);
});

test('窗口抬起失败时把错误传回界面', async () => {
  const focus = createWindowFocuser({
    platform: 'darwin',
    api: async () => ({ target: 4321 }),
    execFileAsync: async () => { throw new Error('AXRaise failed'); }
  });
  await assert.rejects(focus('target'), /AXRaise failed/);
});

test('窗口 ID 没有有效进程号时不尝试前置', async () => {
  const focus = createWindowFocuser({
    platform: 'darwin',
    api: async () => ({ target: 0 }),
    execFileAsync: async () => { throw new Error('不应执行'); }
  });
  await assert.rejects(focus('target'), /找不到浏览器窗口进程/);
});
