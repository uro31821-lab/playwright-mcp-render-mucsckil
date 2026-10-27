// Secrets stay in this tab's memory; no storage, query strings, or analytics.
let ticket = '', secret = '', frame = '', timer, busy = false, finishRequested = false, lifecycle = 0;
const REQUEST_TIMEOUT_MS = 12000;
const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const setBusy = value => {
  busy = value;
  // Preserve typed text while a screenshot is pending. Only offer submission
  // when a current frame can authorize it; never queue or replay text input.
  $('send').disabled = busy || !secret || !frame || finishRequested;
  for (const button of $('keys').querySelectorAll('[data-key], [data-scroll]'))
    button.disabled = busy || !secret || !frame || finishRequested;
  $('refresh').disabled = busy || !secret || finishRequested;
  $('screen').setAttribute('aria-busy', String(busy));
};
const api = async (path, body) => {
  const requestLifecycle = lifecycle;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('/owner/' + path, { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: 'Bearer ' + secret } : {}) },
      body: JSON.stringify(body), cache: 'no-store', signal: controller.signal });
    const result = await response.json();
    if (requestLifecycle !== lifecycle) throw Error('OWNER_VIEW_LEFT');
    if (!response.ok) throw Error(result.code || 'OWNER_REQUEST_FAILED');
    return result;
  } catch (error) {
    if (requestLifecycle !== lifecycle) throw Error('OWNER_VIEW_LEFT');
    if (controller.signal.aborted) throw Error('OWNER_REQUEST_TIMEOUT');
    throw error;
  } finally { clearTimeout(deadline); }
};
const clearControls = () => {
  $('send').disabled = true;
  $('finish').disabled = true; $('entry').hidden = true; $('keys').hidden = true;
  $('text').value = ''; $('site').textContent = ''; frame = '';
  $('screen').getContext('2d').clearRect(0, 0, $('screen').width, $('screen').height);
};
const acceptLink = () => {
  const candidate = location.hash.slice(1);
  // Retain only the public view ID in the document URL, never the credential.
  history.replaceState(null, '', location.pathname + location.search);
  if (secret || busy || finishRequested) {
    status('현재 직접 조작을 마친 뒤 최신 링크를 다시 열어 주세요. 진행 중인 연결은 유지합니다.');
    return;
  }
  clearTimeout(timer); clearControls();
  ticket = /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : '';
  $('start').hidden = false; $('start').disabled = !ticket;
  status(ticket ? '새 작업 화면입니다. 화면 열고 직접 조작을 눌러 연결하세요.' :
    '주소에 연결 정보가 없습니다. ChatGPT의 최신 링크 전체를 다시 열어 주세요.');
};
const explain = e => {
  if (e.message === 'OWNER_VIEW_LEFT') return;
  if (/EXPIRED/.test(e.message)) {
    secret = ''; finishRequested = false; clearTimeout(timer); $('finish').disabled = true;
    clearControls();
    status(e.message === 'OWNER_LINK_EXPIRED' ?
      '이 링크를 사용할 수 없습니다. ChatGPT에서 발급된 최신 링크 전체를 열어 주세요.' :
      '직접 조작 연결이 종료되었습니다. ChatGPT에서 새 화면 링크를 받아주세요.');
  } else if (e.message === 'OWNER_REQUEST_TIMEOUT') {
    status('연결 응답이 늦어 대기를 멈췄습니다. 입력은 다시 보내지 않습니다. 새로 보기로 결과를 확인하거나 완료 버튼을 눌러 주세요.');
  } else status('요청 결과를 확인하지 못했습니다. 같은 입력은 자동으로 반복하지 않습니다. 새로 보기를 눌러 화면을 확인하세요.');
};
async function refresh() {
  if (!secret || busy || finishRequested) return;
  const refreshLifecycle = lifecycle;
  frame = '';
  setBusy(true);
  try {
    const result = await api('frame', {});
    const bytes = Uint8Array.from(atob(result.image), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    if (refreshLifecycle !== lifecycle || !secret) { bitmap.close(); return; }
    const screen = $('screen'); screen.width = result.width; screen.height = result.height;
    screen.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    frame = result.frame; $('site').textContent = result.site;
  } catch (e) { explain(e); } finally { setBusy(false); }
  clearTimeout(timer);
  // A user-requested handback has priority over another polling cycle.
  if (finishRequested) { void finishOwner(); return; }
  if (secret) timer = setTimeout(refresh, 1500);
}
async function input(body) {
  if (!secret || !frame || busy || finishRequested) return;
  clearTimeout(timer); setBusy(true);
  const currentFrame = frame; frame = '';
  try { await api('input', { ...body, frame: currentFrame }); }
  catch (e) { explain(e); }
  finally { setBusy(false); if (finishRequested) void finishOwner(); else await refresh(); }
}
$('start').onclick = async () => {
  if (!ticket || secret || busy) return;
  $('start').disabled = true;
  const claimTicket = ticket; ticket = ''; setBusy(true);
  try {
    const result = await api('claim', { ticket: claimTicket }); secret = result.secret;
    $('start').hidden = true; $('finish').disabled = false; $('entry').hidden = false; $('keys').hidden = false;
    status('직접 조작 중입니다. GPT 작업은 일시정지되어 있습니다. 연결은 10분 후 만료됩니다.');
  } catch (e) { explain(e); } finally { setBusy(false); }
  if (secret) await refresh();
};
$('screen').onclick = event => {
  const r = $('screen').getBoundingClientRect();
  void input({ type: 'click', x: (event.clientX - r.left) * $('screen').width / r.width,
    y: (event.clientY - r.top) * $('screen').height / r.height });
};
$('entry').onsubmit = event => {
  event.preventDefault();
  if (busy || !secret || !frame || finishRequested) return;
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
  clearTimeout(timer); setBusy(true);
  try {
    // A successful release ACK is required before claiming control returned
    // to GPT. Never replay a previous browser input or login operation.
    const result = await api('finish', {});
    if (result.state !== 'RELEASED') throw Error('OWNER_REQUEST_FAILED');
    finishRequested = false; secret = ''; frame = ''; $('text').value = '';
    $('screen').getContext('2d').clearRect(0, 0, $('screen').width, $('screen').height);
    $('finish').disabled = true; $('entry').hidden = true; $('keys').hidden = true;
    status('직접 조작을 마쳤습니다. ChatGPT로 돌아가 “완료”라고 알려주세요. 로그인 성공 여부는 이어서 확인합니다.');
  } catch (e) {
    finishRequested = false;
    explain(e);
    if (secret) status('제어권 반환이 확인되지 않았습니다. 이전 입력은 반복하지 않습니다. 완료 버튼을 다시 눌러 확인할 수 있습니다.');
  } finally { setBusy(false); }
}
$('finish').onclick = () => {
  if (!secret) return;
  // Mobile screenshot polling can overlap a tap; queue Finish once rather
  // than silently returning while busy.
  finishRequested = true;
  $('send').disabled = true;
  clearTimeout(timer);
  status('완료 요청을 받았습니다. 진행 중인 화면 갱신이 끝나면 GPT에 제어권을 돌려줍니다.');
  void finishOwner();
};
addEventListener('hashchange', acceptLink);
addEventListener('pagehide', () => {
  lifecycle++; secret = ''; ticket = ''; finishRequested = false; clearTimeout(timer); clearControls();
  $('start').disabled = true;
});
addEventListener('pageshow', event => {
  if (event.persisted && !secret && !ticket) {
    clearControls(); $('start').hidden = false; $('start').disabled = true;
    status('이전 작업 화면으로 돌아왔습니다. ChatGPT의 최신 링크 전체를 다시 열어 주세요.');
  }
});
acceptLink();
