// Beat practice: hear only the stressed words of a sentence and speak on their beat.
// Each item has three steps: pick the beats by ear, clap them while the chant plays,
// then say the sentence on the beat (passed when every beat word is recognized).

import { view, keys, chrome, onLeave, esc, micError } from './ui.js';
import { listen, playAudio, stopAudio } from './speech.js';
import { state, save } from './store.js';
import { BEAT_ITEMS, STAGES } from '../data/beats.js';
import { GLUE } from '../data/glue.js';
import { BEAT_AUDIO, GLUE_AUDIO } from '../data/beat_audio.js';

const COUNT_IN = 4;
const LISTEN_SPEEDS = [['ゆっくり', 0.75], ['ふつう', 1]];
const CLAP_SPEEDS = [['ゆっくり', 0.8], ['ふつう', 1], ['速く', 1.15]];
const ON_BEAT = 0.07;   // seconds either side of a beat that count as "on the beat"

const progress = () => (state.beat ??= { done: {}, speed: 1 });
const plain = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');

export function beatCounts() {
  const done = progress().done;
  return { done: BEAT_ITEMS.filter(it => done[it.id]).length, total: BEAT_ITEMS.length };
}

function stageCounts(stage) {
  const list = BEAT_ITEMS.filter(it => it.stage === stage);
  return { done: list.filter(it => progress().done[it.id]).length, total: list.length };
}

// The first unfinished item, from the given stage onward (then from the start).
function nextItem(after = null) {
  const done = progress().done;
  const start = after ? BEAT_ITEMS.indexOf(after) + 1 : 0;
  const order = [...BEAT_ITEMS.slice(start), ...BEAT_ITEMS.slice(0, start)];
  return order.find(it => !done[it.id]) ?? null;
}

const shuffle = list => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Beats large, glue small with its reduced sound above it.
function sentence(item) {
  let b = 0;
  return `<p class="sent">${item.parts.map(p => (p.beat
    ? `<span class="sb" data-b="${b++}">${esc(p.text)}</span>`
    : `<span class="sg${p.attach ? ' attach' : ''}"><small>${esc(p.kana)}</small>${esc(p.text)}</span>`)).join('')}</p>`;
}

function segmented(id, options, value) {
  return `<div class="seg" id="${id}">${options.map(([label, v]) =>
    `<button type="button" data-v="${v}" class="${v === value ? 'is-on' : ''}">${label}</button>`).join('')}</div>`;
}

function onSegment(id, handler) {
  const el = document.getElementById(id);
  el?.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    el.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('is-on', x === b));
    handler(b.dataset.v);
  });
}

// ---------- stage list ----------

export function beatHome() {
  onLeave(stopAudio);
  const next = nextItem();
  chrome({ step: 3, info: '', keyHint: next ? 'Enter 続きから' : '' });
  view(`<div class="beat-home">
    <p class="eyebrow">ビート練習</p>
    <p class="intro">英語は大事な語でリズムを刻み、間の語(接着剤)は短く詰め込んで話されます。ビートの語だけを聞き取り、ビートに乗せて言う練習です。</p>
    <div class="stages">
      ${STAGES.map(s => {
        const c = stageCounts(s);
        const here = next?.stage === s;
        return `<button class="stage${here ? ' is-here' : ''}${c.done === c.total ? ' is-done' : ''}" data-stage="${s}" type="button">
          <span class="stage-name">${s}ビート</span>
          <span class="stage-dots">${'<i></i>'.repeat(s)}</span>
          <span class="stage-count num">${c.done === c.total ? '✓' : `${c.done}/${c.total}`}</span>
          ${here ? '<span class="here">いまここ</span>' : ''}
        </button>`;
      }).join('')}
    </div>
    ${next ? `<button class="primary" data-key="Enter">続きから<small class="num">${next.stage}ビート ${next.no}/25</small></button>` : '<p class="intro">全100問クリアです。</p>'}
    <div class="pills">
      <button class="pill" id="glueLib" type="button">接着剤ライブラリ</button>
      <button class="pill" id="random" type="button">ランダム出題</button>
    </div>
  </div>`);
  document.querySelectorAll('[data-stage]').forEach(b => {
    b.onclick = () => {
      const stage = Number(b.dataset.stage);
      const list = BEAT_ITEMS.filter(it => it.stage === stage);
      runItem(list.find(it => !progress().done[it.id]) ?? list[0]);
    };
  });
  document.getElementById('glueLib').onclick = glueLibrary;
  document.getElementById('random').onclick = () => runItem(shuffle(BEAT_ITEMS)[0], { random: true });
  keys(next ? { Enter: () => runItem(next) } : {});
}

// ---------- one item ----------

function runItem(item, { random = false, step = 1 } = {}) {
  const audio = BEAT_AUDIO[item.id];
  const n = item.beats.length;
  let raf = 0;
  let timers = [];
  let mic = null;
  const halt = () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    timers = [];
    mic?.stop();
    mic = null;
    stopAudio();
  };
  onLeave(halt);

  const goNext = () => {
    halt();
    const next = random ? shuffle(BEAT_ITEMS.filter(it => it !== item))[0] : nextItem(item);
    if (next) runItem(next, { random });
    else beatHome();
  };

  const frame = (stepNo, body) => {
    halt();
    chrome({ step: 3, info: `${item.stage}ビート ${item.no}/25${progress().done[item.id] ? ' ✓' : ''}`, keyHint: 'Enter 次へ' });
    view(`<div class="beat">
      <div class="tabs">
        ${['リスニング', '手拍子', 'スピーキング'].map((t, i) =>
          `<button type="button" class="tab${i + 1 === stepNo ? ' is-on' : ''}" data-step="${i + 1}"><b>${i + 1}</b>${t}</button>`).join('')}
      </div>
      ${body}
      <button class="pill back-list" id="toList" type="button">一覧へ</button>
    </div>`);
    document.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => steps[b.dataset.step - 1]()));
    document.getElementById('toList').onclick = () => {
      halt();
      beatHome();
    };
  };

  // Step 1: pick the beat words by ear, in order, from beats mixed with sound-alike decoys.
  function listening() {
    const choices = shuffle([...new Set([...item.beats, ...item.decoys])]);
    const picked = [];
    let rate = 1;
    let checked = false;
    frame(1, `
      <p class="b-title">ビートはどれ？</p>
      <p class="b-sub">文字を見ずに聞いて、${n}個のビートの語を聞こえた順に選んでください。</p>
      <div class="slots" id="slots"></div>
      <button class="play-big" id="play" type="button" aria-label="再生">▶</button>
      ${segmented('lspeed', LISTEN_SPEEDS, rate)}
      <div class="chips" id="chips">${choices.map(c => `<button type="button" class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div id="answer"></div>
      <button class="primary" data-key="Enter" id="check">答え合わせ</button>`);
    const slots = document.getElementById('slots');
    const paint = () => {
      slots.innerHTML = Array.from({ length: n }, (_, i) => {
        const w = picked[i];
        const mark = checked ? (w === item.beats[i] ? ' ok' : ' ng') : '';
        return `<button type="button" class="slot${w ? ' filled' : ''}${mark}" data-i="${i}">${w ? esc(w) : '?'}</button>`;
      }).join('');
      document.querySelectorAll('.chip').forEach(c => (c.disabled = checked || picked.includes(c.dataset.c)));
    };
    paint();
    const play = () => audio && playAudio(audio.n, null, rate);
    document.getElementById('play').onclick = play;
    onSegment('lspeed', v => {
      rate = Number(v);
      play();
    });
    document.getElementById('chips').onclick = e => {
      const c = e.target.closest('.chip');
      if (!c || checked || picked.length >= n) return;
      picked.push(c.dataset.c);
      paint();
    };
    slots.onclick = e => {
      const s = e.target.closest('.slot');
      if (!s || checked || !picked[s.dataset.i]) return;
      picked.splice(Number(s.dataset.i), 1);
      paint();
    };
    const check = () => {
      if (checked) return clapping();
      checked = true;
      paint();
      const right = item.beats.filter((b, i) => picked[i] === b).length;
      document.getElementById('answer').innerHTML = `
        <p class="score-line">${right === n ? '全部聞き取れました' : `${right}/${n} 正解`}</p>
        ${sentence(item)}<p class="ja-line">${esc(item.ja)}</p>`;
      document.getElementById('check').textContent = '次へ(手拍子)';
    };
    document.getElementById('check').onclick = check;
    keys({ Enter: check, Space: play });
    timers.push(setTimeout(play, 300));
  }

  // Step 2: clap (tap) on every beat while the chant plays; each tap is judged early / on / late.
  function clapping() {
    let mode = 'f';
    let rate = progress().speed ?? 1;
    frame(2, `
      <p class="b-title">手拍子に合わせて言う</p>
      <p class="b-sub">クリックに合わせて丸をタップしながら言います。ビートの語は高く長くはっきり、間の語は小さく雑に。</p>
      ${segmented('mode', [['ビートだけ', 'b'], ['全文', 'f']], mode)}
      ${sentence(item)}
      <button class="tap" id="tap" type="button"><span id="tapWord">スタート</span></button>
      <p class="tap-note" id="tapNote">&nbsp;</p>
      ${segmented('cspeed', CLAP_SPEEDS, rate)}
      <button class="primary" data-key="Enter" id="toSpeak">次へ(スピーキング)</button>`);
    const tap = document.getElementById('tap');
    const word = document.getElementById('tapWord');
    const note = document.getElementById('tapNote');
    const beatSpans = [...document.querySelectorAll('.sent .sb')];
    const beat = audio ? 60 / audio.bpm : 0.6;
    let player = null;
    let taps = [];

    const finish = () => {
      cancelAnimationFrame(raf);
      player = null;
      beatSpans.forEach(s => s.classList.remove('on'));
      tap.classList.remove('live', 'pulse');
      word.textContent = 'もう一度';
      const on = taps.filter(d => d !== undefined && Math.abs(d) <= ON_BEAT).length;
      const early = taps.filter(d => d !== undefined && d < -ON_BEAT).length;
      const late = taps.filter(d => d !== undefined && d > ON_BEAT).length;
      note.textContent = `ぴったり ${on}/${n}` + (early ? ` · はやい ${early}` : '') + (late ? ` · おそい ${late}` : '');
    };

    const start = () => {
      if (!audio) return (note.textContent = '音声がまだ用意されていません');
      taps = [];
      note.innerHTML = '&nbsp;';
      tap.classList.add('live');
      player = playAudio(audio[mode], finish, rate);
      const tick = () => {
        if (!player) return;
        const k = (player.currentTime - audio.t0) / beat;   // beats since the first beat (media time)
        const j = Math.round(k);
        if (k < -0.5) {
          word.textContent = String(Math.min(COUNT_IN, -Math.floor(k)));
        } else {
          const at = Math.min(n - 1, Math.max(0, j));
          word.textContent = item.parts.filter(p => p.beat)[at].text.replace(/[^A-Za-z']/g, '');
          beatSpans.forEach((s, i) => s.classList.toggle('on', i === at && k < n - 0.3));
        }
        tap.classList.toggle('pulse', Math.abs(k - j) < 0.08 && j >= -COUNT_IN && j < n);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const hit = () => {
      if (!player) return start();
      const k = (player.currentTime - audio.t0) / beat;
      const j = Math.round(k);
      if (j < 0 || j >= n || taps[j] !== undefined) return;
      const d = ((k - j) * beat) / rate;   // seconds off the beat, in real time
      taps[j] = d;
      const label = Math.abs(d) <= ON_BEAT ? 'ぴったり' : d < 0 ? 'はやい' : 'おそい';
      note.textContent = `${label} ${d > 0 ? '+' : ''}${Math.round(d * 1000)}ms`;
      tap.classList.remove('hit-on', 'hit-off');
      void tap.offsetWidth;
      tap.classList.add(Math.abs(d) <= ON_BEAT ? 'hit-on' : 'hit-off');
    };

    tap.addEventListener('pointerdown', e => {
      e.preventDefault();
      hit();
    });
    const reset = () => {
      halt();
      finish();
      word.textContent = 'スタート';
      note.innerHTML = '&nbsp;';
    };
    onSegment('mode', v => {
      mode = v;
      reset();
    });
    onSegment('cspeed', v => {
      rate = Number(v);
      progress().speed = rate;
      save();
      reset();
    });
    document.getElementById('toSpeak').onclick = speaking;
    keys({ Space: hit, Enter: speaking });
  }

  // Step 3: say the sentence on a visual beat; passed when every beat word is recognized.
  function speaking() {
    const passedBefore = !!progress().done[item.id];
    frame(3, `
      <p class="b-title">ビートに乗せて言う</p>
      <p class="b-sub">4カウントのあと、丸が光るタイミングでビートの語を言ってください。ビートの語がすべて伝われば合格です。</p>
      ${sentence(item)}
      <button class="tap" id="go" type="button"><span id="goWord">スタート</span></button>
      <div id="verdict"></div>
      <button class="primary" data-key="Enter" id="nextItem">${passedBefore ? '次の問題へ' : 'とばして次へ'}</button>`);
    const go = document.getElementById('go');
    const label = document.getElementById('goWord');
    const verdict = document.getElementById('verdict');
    const beatWords = item.parts.filter(p => p.beat).map(p => p.text.replace(/[^A-Za-z']/g, ''));
    const beat = (audio ? 60 / audio.bpm : 0.6) / (progress().speed ?? 1);
    let running = false;

    const judge = text => {
      const heard = new Set(text.split(/\s+/).flatMap(w => [plain(w), plain(w).split("'")[0]]));
      const hits = item.beats.map(b => heard.has(b));
      const pass = hits.every(Boolean);
      verdict.innerHTML = `
        <p class="score-line">${pass ? '合格 · ビートが伝わりました' : `${hits.filter(Boolean).length}/${n} 伝わりました`}</p>
        <p class="beats-check">${beatWords.map((w, i) => `<span class="${hits[i] ? 'ok' : 'ng'}">${hits[i] ? '✓' : '✗'} ${esc(w)}</span>`).join('')}</p>
        <p class="heard">${text ? esc(text) : '<span class="faint">聞き取れませんでした</span>'}</p>`;
      if (pass) {
        progress().done[item.id] = true;
        save();
        document.getElementById('nextItem').textContent = '次の問題へ';
      }
    };

    const start = () => {
      if (running) return mic?.stop();
      running = true;
      verdict.innerHTML = '';
      const l = listen({});
      mic = l;
      const t0 = performance.now() + 300;
      const total = (COUNT_IN + n) * beat;
      const tick = () => {
        const k = (performance.now() - t0) / 1000 / beat - COUNT_IN;
        const j = Math.round(k);
        if (k < -0.5) label.textContent = String(Math.min(COUNT_IN, Math.max(1, -Math.floor(k))));
        else if (j < n) label.textContent = beatWords[Math.max(0, j)];
        else label.textContent = '…';
        go.classList.toggle('pulse', Math.abs(k - j) < 0.1 && j < n);
        go.classList.add('live');
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timers.push(setTimeout(() => l.stop(), 300 + total * 1000 + 1500));
      l.done.then(r => {
        if (mic !== l) return;
        mic = null;
        running = false;
        cancelAnimationFrame(raf);
        go.classList.remove('live', 'pulse');
        label.textContent = 'もう一度';
        if (r.error && !r.text) return micError(r.error, speaking);
        judge(r.text);
      });
    };

    go.onclick = start;
    document.getElementById('nextItem').onclick = goNext;
    keys({ Space: start, Enter: goNext });
  }

  const steps = [listening, clapping, speaking];
  steps[step - 1]();
}

// ---------- glue library ----------

function glueLibrary() {
  let rate = 1;
  onLeave(stopAudio);
  chrome({ step: 3, info: '', keyHint: '' });
  view(`<div class="beat-home">
    <p class="eyebrow">接着剤ライブラリ · ${GLUE.length}個</p>
    <p class="intro">ビートの間に詰め込まれる語です。カタカナは崩れた音のおおよその目安です。▶ で例文を聞けます。</p>
    ${segmented('gspeed', LISTEN_SPEEDS, rate)}
    <ul class="glue">
      ${GLUE.map(g => `<li>
        <button class="pill gplay" type="button" data-g="${g.id}" aria-label="再生">▶</button>
        <span class="g-main"><b>${esc(g.text)}</b><span class="g-kana">${esc(g.kana)}</span></span>
        <span class="g-ex">${esc(g.example)}<small>${esc(g.ja)}</small></span>
      </li>`).join('')}
    </ul>
    <div class="pills">
      <button class="pill" id="randomGlue" type="button">ランダムに聞く</button>
      <button class="pill" id="toList" type="button">一覧へ</button>
    </div>
  </div>`);
  const play = id => {
    const src = GLUE_AUDIO[id];
    if (src) playAudio(src, null, rate);
    document.querySelectorAll('.glue li').forEach(li => li.classList.toggle('on', li.querySelector('[data-g]').dataset.g === id));
  };
  document.querySelector('.glue').onclick = e => {
    const b = e.target.closest('[data-g]');
    if (b) play(b.dataset.g);
  };
  onSegment('gspeed', v => (rate = Number(v)));
  document.getElementById('randomGlue').onclick = () => {
    const g = shuffle(GLUE)[0];
    play(g.id);
    document.querySelector(`[data-g="${g.id}"]`).closest('li').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  document.getElementById('toList').onclick = beatHome;
  keys({});
}
