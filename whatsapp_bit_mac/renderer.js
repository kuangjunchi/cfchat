const byId = id => document.getElementById(id);
let state = { connected: false, entries: [], mode: 'open', groupId: '', ignoreMuted: true };
let chosenMode = 'open';
let chosenGroup = '';

function message(text) {
  const box = byId('error');
  box.textContent = text;
  box.classList.toggle('hidden', !text);
}

function render() {
  byId('mode-open').classList.toggle('active', chosenMode === 'open');
  byId('mode-group').classList.toggle('active', chosenMode === 'group');
  byId('group-wrap').classList.toggle('hidden', chosenMode !== 'group');
  byId('ignore-muted').checked = state.ignoreMuted;
  const connection = byId('connection');
  connection.className = `connection ${state.connected ? 'ok' : 'bad'}`;
  connection.lastElementChild.textContent = state.connected ? '已连接比特' : '等待比特浏览器';
  byId('window-count').textContent = state.entries.length;
  byId('whatsapp-count').textContent = state.entries.filter(item => item.hasWhatsapp).length;
  byId('alert-count').textContent = state.entries.filter(item => item.alert).length;

  const list = byId('window-list');
  list.replaceChildren();
  for (const item of state.entries) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `window-row${item.alert ? ' alert' : ''}`;
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = item.seq ? String(item.seq).slice(-2) : 'W';
    const copy = document.createElement('span');
    copy.className = 'row-copy';
    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = item.name || `窗口 ${item.seq || ''}`;
    const subtitle = document.createElement('div');
    subtitle.className = 'row-subtitle';
    subtitle.textContent = `比特窗口 ${item.seq || '—'}${item.remark ? ` · ${item.remark}` : ''}`;
    copy.append(title, subtitle);
    const status = document.createElement('span');
    status.className = `row-status${item.alert ? ' new' : ''}`;
    if (item.alert) {
      const dot = document.createElement('span');
      dot.className = 'green-dot';
      status.append(dot, document.createTextNode('有新消息'));
    } else {
      status.textContent = item.error ? '读取失败' : (item.hasWhatsapp ? '无新消息' : '未打开 WhatsApp');
    }
    row.append(avatar, copy, status);
    row.title = item.error ? `点击前置此窗口；${item.error}` : '点击前置此窗口';
    row.addEventListener('click', async () => {
      message('');
      try { await window.monitor.activate(item.id); }
      catch (error) { message(`无法前置窗口：${error.message}`); }
    });
    list.append(row);
  }
  const empty = state.entries.length === 0;
  byId('empty').classList.toggle('hidden', !empty);
  if (empty) {
    byId('empty-title').textContent = chosenMode === 'group' ? '这个分组没有已打开的窗口' : '没有已打开的比特窗口';
    byId('empty-help').textContent = chosenMode === 'group' ? '请先在比特浏览器中打开这个分组的窗口。' : '打开比特浏览器窗口并登录 WhatsApp Web 后，这里会自动出现。';
  }
  if (state.error) message(`连接失败：${state.error}`);
}

window.monitor.onState(next => { state = next; render(); });

async function loadGroups() {
  try {
    const groups = await window.monitor.groups();
    const select = byId('group');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择分组';
    select.append(placeholder);
    for (const group of groups) {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.append(option);
    }
    if (groups.some(group => group.id === chosenGroup)) select.value = chosenGroup;
  } catch (error) { message(`读取分组失败：${error.message}`); }
}

byId('mode-open').addEventListener('click', async () => {
  chosenMode = 'open';
  message('');
  render();
  try { await window.monitor.chooseMode('open', ''); }
  catch (error) { message(error.message); }
});
byId('mode-group').addEventListener('click', async () => {
  chosenMode = 'group';
  render();
  await loadGroups();
  if (chosenGroup) {
    try { await window.monitor.chooseMode('group', chosenGroup); }
    catch (error) { message(error.message); }
  }
});
byId('group').addEventListener('change', async event => {
  chosenGroup = event.target.value;
  message('');
  if (!chosenGroup) return;
  try { await window.monitor.chooseMode('group', chosenGroup); }
  catch (error) { message(error.message); }
});
byId('refresh').addEventListener('click', async () => {
  message('');
  try { await window.monitor.refresh(); }
  catch (error) { message(error.message); }
});
byId('ignore-muted').addEventListener('change', async event => {
  const value = event.target.checked;
  message('');
  try { await window.monitor.setIgnoreMuted(value); }
  catch (error) {
    byId('ignore-muted').checked = state.ignoreMuted;
    message(`切换静音过滤失败：${error.message}`);
  }
});
render();
