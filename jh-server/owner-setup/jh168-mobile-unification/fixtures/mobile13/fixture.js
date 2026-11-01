'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const eventLog = byId('event-log');
  const page = document.body.dataset.page;
  const started = performance.now();
  const maxEvents = 24;
  let sequence = 0;

  function write(id, message) {
    const node = byId(id);
    if (node) node.textContent = message;
  }

  function record(kind, detail) {
    if (!eventLog) return;
    const item = document.createElement('li');
    sequence += 1;
    item.textContent = '#' + sequence + ' +' + Math.round(performance.now() - started) +
      'ms · ' + kind + (detail ? ' · ' + detail : '');
    eventLog.prepend(item);
    while (eventLog.children.length > maxEvents) eventLog.lastElementChild.remove();
  }

  function listen(id, event, handler) {
    const element = byId(id);
    if (element) element.addEventListener(event, handler);
  }

  const focusNames = {
    'click-button': '클릭 횟수 버튼',
    'input-one': '첫 번째 연습 문구',
    'input-two': '두 번째 연습 문구',
    'form-submit': '페이지 안에서 입력 확인',
    'native-select': '연습 색상 선택',
    'delay-button': '800ms 지연 버튼',
    'vertical-scroll': '바깥 세로 스크롤',
    'inner-scroll': '안쪽 세로 스크롤',
    'horizontal-scroll': '가로 스크롤',
    'dialog-open': '대화상자 열기',
    'dialog-close': '대화상자 닫기',
    'same-tab-link': '같은 탭 이동 링크',
    'new-tab-link': '새 탭 이동 링크',
    'back-link': '첫 화면 링크',
    'clear-events': '이벤트 목록 비우기'
  };

  function currentFocus() {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return '페이지 본문';
    return focusNames[active.id] || '기타 페이지 요소';
  }

  document.addEventListener('focusin', () => {
    const label = currentFocus();
    write('focus-state', label);
    record('focus', label);
  });
  document.addEventListener('focusout', () => {
    requestAnimationFrame(() => write('focus-state', currentFocus()));
  });

  const controlKeys = new Set([
    'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown'
  ]);
  document.addEventListener('keydown', (event) => {
    const key = controlKeys.has(event.key) ? event.key :
      (event.key.length === 1 ? '문자 키 (값 기록 안 함)' : '기타 키');
    write('keyboard-state', key + ' · 페이지 이벤트');
    record('key', key);
  });

  function updateViewport() {
    const visual = window.visualViewport;
    const layout = window.innerWidth + '×' + window.innerHeight;
    const visible = visual ? Math.round(visual.width) + '×' + Math.round(visual.height) : '사용 불가';
    write('viewport-state', 'layout ' + layout + ' / visual ' + visible);
  }

  function updatePageScroll() {
    write('page-scroll-state', 'x=' + Math.round(window.scrollX) + ' / y=' + Math.round(window.scrollY));
  }

  let pageFramePending = false;
  let lastPageLog = -Infinity;
  window.addEventListener('scroll', () => {
    if (pageFramePending) return;
    pageFramePending = true;
    requestAnimationFrame(() => {
      pageFramePending = false;
      updatePageScroll();
      if (performance.now() - lastPageLog >= 250) {
        lastPageLog = performance.now();
        record('page scroll', 'x=' + Math.round(window.scrollX) + ' / y=' + Math.round(window.scrollY));
      }
    });
  }, { passive: true });
  window.addEventListener('resize', updateViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewport);
  window.addEventListener('pageshow', () => {
    updateViewport();
    updatePageScroll();
    write('focus-state', currentFocus());
  });

  let clicks = 0;
  listen('click-button', 'click', () => {
    clicks += 1;
    write('click-count', String(clicks));
    record('click', 'count=' + clicks);
  });

  function inputLength(id) {
    const input = byId(id);
    return input ? input.value.length : 0;
  }

  const form = byId('test-form');
  if (form) form.reset();
  for (const id of ['input-one', 'input-two']) {
    listen(id, 'input', () => {
      const length = inputLength(id);
      write(id + '-length', String(length));
      record('input', id + ' length=' + length);
    });
  }
  let submits = 0;
  listen('test-form', 'submit', (event) => {
    event.preventDefault();
    submits += 1;
    const lengths = '첫 입력 ' + inputLength('input-one') + '자 / 두 번째 ' + inputLength('input-two') + '자';
    write('form-result', 'LOCAL_ONLY · 확인 ' + submits + '회 · ' + lengths);
    record('form', 'preventDefault · count=' + submits + ' · ' + lengths);
  });

  const optionLabels = { blue: '파랑 연습 옵션', orange: '주황 연습 옵션' };
  const select = byId('native-select');
  if (select) select.value = '';
  listen('native-select', 'change', (event) => {
    const value = event.target.value;
    const selected = Object.hasOwn(optionLabels, value) ? optionLabels[value] : '아직 선택하지 않음';
    write('select-result', selected);
    record('select', selected);
  });

  listen('delay-button', 'click', () => {
    const button = byId('delay-button');
    const status = byId('delay-status');
    if (button.disabled) return;
    button.disabled = true;
    status.dataset.state = 'waiting';
    write('delay-status', 'WAITING · 800ms 타이머 진행 중');
    record('delay', 'armed · 800ms');
    window.setTimeout(() => {
      status.dataset.state = 'ready';
      write('delay-status', 'READY · 지연 조건 문구가 나타났습니다');
      button.disabled = false;
      record('delay', 'READY · 페이지 조건 표시');
    }, 800);
  });

  function observeScroll(id, outputId, horizontal) {
    const element = byId(id);
    const output = byId(outputId);
    if (!element || !output) return;
    let framePending = false;
    let lastLog = -Infinity;
    function render(logChange) {
      const position = horizontal ? element.scrollLeft : element.scrollTop;
      const max = horizontal ? element.scrollWidth - element.clientWidth :
        element.scrollHeight - element.clientHeight;
      const atEnd = max > 0 && position >= max - 1;
      const metric = (horizontal ? 'left=' : 'top=') + Math.round(position) +
        ' / max=' + Math.round(max) + ' / end=' + (atEnd ? 'yes' : 'no');
      output.textContent = id + ' · ' + metric;
      output.dataset.atEnd = String(atEnd);
      if (logChange && performance.now() - lastLog >= 250) {
        lastLog = performance.now();
        record('scroll', id + ' · ' + metric);
      }
    }
    element.addEventListener('scroll', () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        render(true);
      });
    }, { passive: true });
    window.addEventListener('resize', () => render(false));
    render(false);
  }
  observeScroll('vertical-scroll', 'vertical-status', false);
  observeScroll('inner-scroll', 'inner-status', false);
  observeScroll('horizontal-scroll', 'horizontal-status', true);

  const dialog = byId('test-dialog');
  let closeReason = '브라우저 닫힘 (원인 별도 관찰)';
  listen('dialog-open', 'click', () => {
    if (!dialog || typeof dialog.showModal !== 'function') {
      write('dialog-status', 'UNSUPPORTED · 이 브라우저에서 dialog를 사용할 수 없음');
      record('dialog', 'unsupported');
      return;
    }
    if (dialog.open) return;
    closeReason = '브라우저 닫힘 (원인 별도 관찰)';
    dialog.showModal();
    write('dialog-status', 'OPEN · 연습 대화상자 열림');
    record('dialog', 'open');
  });
  listen('dialog-close', 'click', () => {
    closeReason = '닫기 버튼';
    dialog.close();
  });
  listen('test-dialog', 'cancel', () => {
    closeReason = 'cancel 이벤트 (Escape/Back 원인 별도 관찰)';
    record('dialog', closeReason);
  });
  listen('test-dialog', 'close', () => {
    write('dialog-status', 'CLOSED · ' + closeReason);
    record('dialog', 'closed · ' + closeReason);
  });

  for (const id of ['same-tab-link', 'new-tab-link', 'back-link']) {
    listen(id, 'click', () => record('navigation intent', id));
  }
  if (page === 'destination') {
    const via = new URLSearchParams(window.location.search).get('via');
    const labels = {
      'same-tab': '링크의 의도: 같은 탭 이동 · 실제 탭 상태는 별도 관찰',
      'new-tab': '링크의 의도: 새 탭 이동 · 실제 탭 상태는 별도 관찰'
    };
    write('destination-kind', Object.hasOwn(labels, via) ? labels[via] : '직접 방문 · 경로 미지정');
  }

  listen('clear-events', 'click', () => {
    eventLog.replaceChildren();
    record('events', '목록 비움');
  });
  updateViewport();
  updatePageScroll();
  record('fixture', (page === 'destination' ? 'DESTINATION' : 'INDEX') + ' v1 · PHONE_E2E NOT_RUN');
})();
