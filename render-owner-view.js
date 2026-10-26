// Secrets stay in this tab's memory; no storage, query strings, or analytics.
let ticket = location.hash.slice(1), secret = '', frame = '', timer, busy = false, finishRequested = false;
history.replaceState(null, '', '/owner/');
const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const api = async (path, body) => {
  const response = await fetch('/owner/' + path, { method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: 'Bearer ' + secret } : {}) },
    body: JSON.stringify(body), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw Error(result.code || 'OWNER_REQUEST_FAILED');
  return result;
};
const explain = e => {
  if (/EXPIRED/.test(e.message)) {
    secret = ''; finishRequested = false; clearTimeout(timer); $('finish').disabled = true;
    status('연결이 만료되었습니다. ChatGPT에서 새 화면 링크를 받아주세요.');
  } else status('요청 결과를 확인하지 못했습니다. 같은 입력은 자동으로 반복하지 않습니다. 새로 보기를 눌러 화면을 확인하세요.');
};
async function refresh() {
  if (!secret || busy || finishRequested) return;
  busy = true;
  try {
    const result = await api('frame', {});
    const bytes = Uint8Array.from(atob(result.image), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const screen = $('screen'); screen.width = result.width; screen.height = result.height;
    screen.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    frame = result.frame; $('site').textContent = result.site;
  } catch (e) { explain(e); } finally { busy = false; }
  clearTimeout(timer);
  // A user-requested handback has priority over another polling cycle.
  if (finishRequested) { void finishOwner(); return; }
  if (secret) timer = setTimeout(refresh, 1500);
}
async function input(body) {
  if (!secret || !frame || busy || finishRequested) return;
  clearTimeout(timer); busy = true;
  const currentFrame = frame; frame = '';
  try { await api('input', { ...body, frame: currentFrame }); }
  catch (e) { explain(e); }
  finally { busy = false; if (finishRequested) void finishOwner(); else await refresh(); }
}
$('start').onclick = async () => {
  $('start').disabled = true;
  try {
    const result = await api('claim', { ticket }); ticket = ''; secret = result.secret;
    $('start').hidden = true; $('finish').disabled = false; $('entry').hidden = false; $('keys').hidden = false;
    status('직접 조작 중입니다. GPT 작업은 일시정지되어 있습니다. 연결은 10분 후 만료됩니다.');
    await refresh();
  } catch (e) { explain(e); }
};
$('screen').onclick = event => {
  const r = $('screen').getBoundingClientRect();
  void input({ type: 'click', x: (event.clientX - r.left) * $('screen').width / r.width,
    y: (event.clientY - r.top) * $('screen').height / r.height });
};
$('entry').onsubmit = event => {
  event.preventDefault();
  if (busy || !frame) return;
  const text = $('text').value; $('text').value = '';
  void input({ type: 'text', text });
};
$('keys').onclick = event => {
  if (event.target.dataset.key) void input({ type: 'key', key: event.target.dataset.key });
  if (event.target.dataset.scroll) void input({ type: 'scroll', x: 0, y: Number(event.target.dataset.scroll) });
};
$('refresh').onclick = () => void refresh();
async function finishOwner() {
  if (!finishRequested || !secret || busy) return;
  clearTimeout(timer); busy = true;
  try {
    // A successful release ACK is required before claiming control returned
    // to GPT. Never replay a previous browser input or login operation.
    await api('finish', {});
    finishRequested = false; secret = ''; frame = ''; $('text').value = '';
    $('screen').getContext('2d').clearRect(0, 0, $('screen').width, $('screen').height);
    $('finish').disabled = true; $('entry').hidden = true; $('keys').hidden = true;
    status('직접 조작을 마쳤습니다. ChatGPT로 돌아가 “완료”라고 알려주세요. 로그인 성공 여부는 이어서 확인합니다.');
  } catch (e) {
    finishRequested = false;
    explain(e);
    if (secret) status('제어권 반환이 확인되지 않았습니다. 이전 입력은 반복하지 않습니다. 완료 버튼을 다시 눌러 확인할 수 있습니다.');
  } finally { busy = false; }
}
$('finish').onclick = () => {
  if (!secret) return;
  // Mobile screenshot polling can overlap a tap; queue Finish once rather
  // than silently returning while busy.
  finishRequested = true;
  clearTimeout(timer);
  status('완료 요청을 받았습니다. 진행 중인 화면 갱신이 끝나면 GPT에 제어권을 돌려줍니다.');
  void finishOwner();
};
addEventListener('pagehide', () => { secret = ''; ticket = ''; $('text').value = ''; clearTimeout(timer); });
