// Screen rendering, key bindings and the session chrome shared by every view.

const stage = document.getElementById('stage');
const bar = document.getElementById('bar');
const meta = document.getElementById('meta');
const hint = document.getElementById('hint');
const links = document.getElementById('links');

let keymap = {};
let cleanup = null;
let escape = null;

export function view(html) {
  stage.innerHTML = html;
  stage.classList.remove('enter');
  void stage.offsetWidth;
  stage.classList.add('enter');
}

export function keys(map) {
  keymap = map;
}

// Called when the current screen is abandoned (Esc), to stop mics and timers.
export function onLeave(fn) {
  cleanup = fn;
}

export function leave() {
  const fn = cleanup;
  cleanup = null;
  keymap = {};
  fn?.();
}

export function setEscape(fn) {
  escape = fn;
}

// step: null on the home screen, 1 (drill) or 2 (talk) during a session.
export function chrome({ step = null, info = '', keyHint = '' } = {}) {
  bar.hidden = step === null;
  links.hidden = step !== null;
  document.getElementById('s1').className = step === 1 ? 'is-active' : step > 1 ? 'is-done' : '';
  document.getElementById('s2').className = step === 2 ? 'is-active' : '';
  meta.textContent = info;
  hint.textContent = keyHint;
}

export const esc = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function micError(error, retry) {
  const msg = error === 'network'
    ? '音声認識サーバーにつながりません。インターネット接続を確認してください。'
    : error === 'service-not-allowed'
      ? '音声認識が使えません。iPhone の場合は、設定 → 一般 → キーボード →「音声入力」と、設定 →「Siri」をオンにしてください。'
      : 'マイクが使えません。ブラウザの設定から、このページにマイクの使用を許可してください。';
  view(`<div class="home">
    <p class="lead">${msg}</p>
    <button class="primary" data-key="Enter">もう一度</button>
  </div>`);
  keys({ Enter: retry });
}

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && escape) {
    e.preventDefault();
    escape();
    return;
  }
  const fn = keymap[e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (fn && !e.repeat) {
    e.preventDefault();
    fn();
  }
});

// Buttons carry data-key so a click and its keyboard shortcut run the same handler.
stage.addEventListener('click', e => {
  const el = e.target.closest('[data-key]');
  if (!el) return;
  el.blur();
  keymap[el.dataset.key]?.();
});
