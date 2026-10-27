'use strict';
// A same-tab fragment navigation does not re-run this script. Reload to bind
// every request and file selection to the newly opened capability and role.
addEventListener('hashchange', () => location.reload());
const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
const purpose = fragment.has('upload') ? 'upload' : 'read';
const token = fragment.get(purpose === 'upload' ? 'upload' : 'result');
let sending = false, ready = false, playbackUrl;
const errors = { VIDEO_LINK_EXPIRED: '이 연결의 사용 기간이 끝났습니다. ChatGPT에서 새 영상 전달 링크를 요청하세요.',
  VIDEO_LINK_INVALID: 'ChatGPT에서 받은 영상 전달 링크를 열어주세요.', VIDEO_SIZE_INVALID: '64 MB 이하의 영상 하나를 선택하세요.',
  VIDEO_TYPE_INVALID: 'MP4 또는 WebM 영상만 보낼 수 있습니다.', VIDEO_INVALID: '재생 가능한 영상 파일인지 확인해 주세요.',
  VIDEO_UPLOAD_IN_PROGRESS: '영상 전송이 진행 중입니다. 잠시 후 전송 상태를 확인해 주세요.' };
function show(s) {
  ready = s.state === 'READY';
  $('upload').hidden = purpose !== 'upload' || ready;
  $('result').hidden = !ready;
  $('refresh').hidden = ready;
  if (ready) {
    playbackUrl = s.playbackUrl;
    $('status').textContent = '영상 파일을 받아 확인했습니다.';
    $('download').href = s.downloadUrl;
    $('watch').href = playbackUrl;
    if ($('player').src !== playbackUrl) $('player').src = playbackUrl;
    $('details').textContent = `${s.durationSeconds.toFixed(1)}초 · ${(s.bytes / 1048576).toFixed(1)} MB`;
    $('expiry').textContent = `재생 가능 시간: ${new Date(s.expiresAt).toLocaleString('ko-KR')}까지`;
  } else $('status').textContent = s.state === 'UPLOADING' ? '영상 전송을 확인하고 있습니다.' : '영상 파일을 기다리고 있습니다.';
}
async function refresh() {
  if (!token) { $('status').textContent = errors.VIDEO_LINK_INVALID; return; }
  try {
    const r = await fetch('/video-transfer/status', { headers: { Authorization: `Bearer ${token}`, 'X-Video-Purpose': purpose }, cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw Error(data.code);
    show(data);
  } catch (e) { $('status').textContent = errors[e.message] ?? '연결을 확인하지 못했습니다. 전송 상태 다시 확인을 눌러주세요.'; $('refresh').hidden = false; }
}
$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  $('filename').textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : '';
  $('send').disabled = !file || file.size <= 12 || file.size > 64 * 1048576 || sending || ready;
});
$('send').addEventListener('click', () => {
  const file = $('file').files[0];
  if (!file || sending || ready || !token) return;
  const mime = file.type || (/\.mp4$/i.test(file.name) ? 'video/mp4' : /\.webm$/i.test(file.name) ? 'video/webm' : '');
  if (!['video/mp4', 'video/webm'].includes(mime)) { $('status').textContent = errors.VIDEO_TYPE_INVALID; return; }
  sending = true; $('send').disabled = true; $('file').disabled = true; $('progress').hidden = false;
  $('status').textContent = '영상을 보내고 있습니다. 이 화면을 유지해 주세요.';
  const xhr = new XMLHttpRequest(); xhr.open('PUT', '/video-transfer/upload'); xhr.timeout = 195000;
  xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.setRequestHeader('Content-Type', mime);
  xhr.upload.onprogress = e => { if (e.lengthComputable) $('progress').value = e.loaded * 100 / e.total; };
  xhr.onload = () => {
    try { const result = JSON.parse(xhr.responseText); if (xhr.status !== 200) throw Error(result.code); show(result); }
    catch (e) { $('status').textContent = errors[e.message] ?? '전송을 완료하지 못했습니다. 전송 상태 다시 확인을 눌러주세요.'; }
  };
  xhr.onerror = xhr.ontimeout = () => { $('status').textContent = '연결이 끊겼습니다. 재전송 전에 전송 상태 다시 확인을 눌러주세요.'; };
  xhr.onloadend = () => { sending = false; $('file').disabled = false; $('refresh').hidden = ready; $('send').disabled = ready; };
  xhr.send(file);
});
$('refresh').addEventListener('click', refresh);
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(playbackUrl); $('copy').textContent = '재생 링크를 복사했습니다'; }
  catch { $('status').textContent = '영상 크게 보기 버튼을 길게 눌러 재생 링크를 복사할 수 있습니다.'; }
});
refresh();
