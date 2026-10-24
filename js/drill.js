// Step 1: see Japanese, say it in English at once, check, hear the model, grade.
// The session ends with a short review of how it went.

import { view, keys, chrome, onLeave, esc, micError } from './ui.js';
import { listen, speak, stopSpeaking } from './speech.js';
import { buildQueue, grade } from './srs.js';
import { previousReaction } from './store.js';
import { parseRhythm, renderScore, playClick, stopClick, BPM } from './score.js';

const LABELS = { 1: '言えなかった', 2: '詰まった', 3: 'すぐ言えた' };

// next: label of the button that leaves the review screen.
export function runDrill(done, { extra = 0, next: nextLabel = 'スピーチへ' } = {}) {
  const items = buildQueue(extra).map(card => ({ card, retry: false }));
  if (!items.length) return done();

  const results = [];   // first attempt of each card: { card, g, rt, said, score }
  let alive = true;
  let mic = null;
  const remaining = () => `残り ${items.length + 1}`;
  onLeave(() => {
    alive = false;
    mic?.stop();
    stopSpeaking();
    stopClick();
  });
  next();

  function next() {
    const item = items.shift();
    if (!item) return summary();
    ask(item);
  }

  function ask(item) {
    chrome({ step: 1, info: remaining(), keyHint: 'Space 答え合わせ · Esc 中断' });
    view(`<div class="drill">
      ${item.retry ? '<p class="eyebrow">もう一度</p>' : ''}
      <p class="ja-prompt">${esc(item.card.ja)}</p>
      <p class="live" id="live"></p>
      <p class="mic on"><span class="dot"></span>英語で言う</p>
      <button class="ghost check" data-key="Space">答え合わせ</button>
    </div>`);
    const live = document.getElementById('live');
    const shownAt = performance.now();
    const l = listen({ silenceMs: 1800, onUpdate: t => (live.textContent = t) });
    mic = l;
    keys({ Space: l.stop, Enter: l.stop });
    l.done.then(r => {
      if (!alive || mic !== l) return;
      mic = null;
      if (r.error) return micError(r.error, () => ask(item));
      reveal(item, r.text, r.firstSoundAt ? r.firstSoundAt - shownAt : null);
    });
  }

  function reveal(item, said, rt) {
    const c = compare(item.card.en, said);
    const sug = suggest(c.score, rt, said);
    const rhythm = item.card.rhythm ? parseRhythm(item.card.rhythm) : null;
    chrome({ step: 1, info: remaining(), keyHint: '1 2 3 評価 · Enter 決定 · R お手本 · Space 繰り返す · B リズム' });
    view(`<div class="drill">
      <p class="ja-sub">${esc(item.card.ja)}</p>
      <p class="en-model">${c.modelHtml}</p>
      ${rhythm ? `<button class="score" id="score" type="button">${renderScore(rhythm)}</button>` : ''}
      <p class="said"><span class="tag">あなた</span>${said ? c.saidHtml : '<span class="faint">聞き取れませんでした</span>'}</p>
      <p class="said" id="repSaid" hidden></p>
      <p class="meta-line num">${rt === null ? '' : `反応 ${(rt / 1000).toFixed(1)}秒`}</p>
      <div class="tools">
        <button class="pill" data-key="r" type="button">▶ お手本</button>
        <button class="pill" id="rep" data-key="Space" type="button">● 繰り返す</button>
        ${rhythm ? `<button class="pill" data-key="b" type="button">♩ リズム練習 <span class="faint num">${BPM}</span></button>` : ''}
      </div>
      <div class="grades">
        ${[1, 2, 3].map(g => `<button class="grade${g === sug ? ' is-sug' : ''}" data-key="${g}"><kbd>${g}</kbd>${LABELS[g]}</button>`).join('')}
      </div>
    </div>`);

    let finished = false;
    let playId = 0;
    const rep = document.getElementById('rep');
    const repSaid = document.getElementById('repSaid');
    const words = [...document.querySelectorAll('.drill [data-w]')];
    const highlight = i => words.forEach(el => el.classList.toggle('speaking', Number(el.dataset.w) === i));

    const quiet = () => {
      playId++;
      mic?.stop();
      mic = null;
      stopSpeaking();
      stopClick();
      highlight(-1);
      rep.classList.remove('on');
      rep.textContent = '● 繰り返す';
    };

    const commit = g => {
      if (finished) return;
      finished = true;
      quiet();
      if (!item.retry) {
        grade(item.card, g, rt);
        results.push({ card: item.card, g, rt, said, score: c.score });
        if (g === 1) items.push({ card: item.card, retry: true });
      }
      next();
    };

    function model() {
      quiet();
      speak(item.card.en, { onWord: highlight });
    }

    // Listens only when asked, so the microphone starts once per card unless the learner wants more.
    async function repeat() {
      if (mic) return mic.stop();
      quiet();
      const id = playId;
      rep.classList.add('on');
      rep.textContent = '● 聞き取り中';
      const l = listen({ silenceMs: 1500 });
      mic = l;
      const r = await l.done;
      if (finished || !alive || id !== playId) return;
      mic = null;
      rep.classList.remove('on');
      rep.textContent = '● 繰り返す';
      if (r.error && !r.text) return;
      const again = compare(item.card.en, r.text);
      repSaid.hidden = false;
      repSaid.innerHTML = `<span class="tag">${again.score >= 0.8 ? '✓ ' : ''}繰り返し</span>${r.text ? again.saidHtml : '<span class="faint">聞き取れませんでした</span>'}`;
    }

    function practiceRhythm() {
      quiet();
      playClick(document.getElementById('score'), rhythm);
    }
    document.getElementById('score')?.addEventListener('click', practiceRhythm);

    keys({
      1: () => commit(1),
      2: () => commit(2),
      3: () => commit(3),
      Enter: () => commit(sug),
      r: model,
      Space: repeat,
      ...(rhythm && { b: practiceRhythm }),
    });
    model();
  }

  function summary() {
    onLeave(null);
    if (!results.length) return done();
    const n = results.length;
    const quick = results.filter(r => r.g === 3).length;
    const rts = results.filter(r => r.rt !== null).map(r => r.rt / 1000);
    const avg = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
    const prev = previousReaction();
    const weak = results.filter(r => r.g < 3);
    const alt = results.filter(r => r.said && r.score < 0.85);

    chrome({ step: 1, info: '振り返り', keyHint: `Enter ${nextLabel}` });
    view(`<div class="drill summary">
      <p class="eyebrow">ドリルの振り返り</p>
      <div class="plan">
        <div><span class="big num">${quick}<span class="of">/${n}</span></span><span>すぐ言えた</span></div>
        <div><span class="big num">${avg === null ? '—' : avg.toFixed(1)}</span><span>平均反応(秒)${prev === null ? '' : ` · 前回 ${prev.toFixed(1)}`}</span></div>
      </div>
      ${weak.length ? `<ul class="cardlist">${weak.map(r => `<li><span class="ja">${esc(r.card.ja)}</span><span class="en">${esc(r.card.en)}</span></li>`).join('')}</ul>` : ''}
      ${alt.length ? `<button class="ghost" id="alt" type="button">別の言い方をAIで確認(${alt.length}件)</button>
        <p class="help">お手本と違う言い方をした文をまとめてコピーします。無料版の ChatGPT・Claude・Gemini に貼ると、その言い方で通じるかを判定してもらえます。</p>` : ''}
      <button class="primary" data-key="Enter">${nextLabel}</button>
    </div>`);

    const btn = document.getElementById('alt');
    if (btn) {
      btn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(altPrompt(alt));
          btn.textContent = 'コピーしました';
        } catch {
          btn.textContent = 'コピーできませんでした';
        }
      };
    }
    keys({ Enter: done });
  }
}

function altPrompt(rows) {
  const list = rows.map((r, i) => `${i + 1}. 日本語: ${r.card.ja}\n   お手本: ${r.card.en}\n   私: ${r.said}`).join('\n');
  return `あなたは英語スピーキングのコーチです。以下は、英語中級の私が日本語を見てすぐに英語で言った答えを、音声認識で文字にしたものです（句読点はなく、誤認識を含むことがあります）。

それぞれについて、次の形で日本語で簡潔に答えてください。
- 判定: ○（自然で意味も同じ）/ △（通じるが不自然）/ ×（意味が違う・文法の誤り）
- △と×の場合は、直し方を一言

最後に、私がくり返している間違いの傾向があれば、1〜2行でまとめてください。

${list}`;
}

function suggest(score, rt, said) {
  if (!said) return 1;
  if (score >= 0.85 && rt !== null && rt <= 3000) return 3;
  if (score >= 0.5) return 2;
  return 1;
}

// ---------- word-level comparison ----------

const CONTRACTIONS = {
  "can't": 'can not', cannot: 'can not', "won't": 'will not', "shan't": 'shall not',
  "let's": 'let us', "it's": 'it is', "that's": 'that is', "what's": 'what is',
  "there's": 'there is', "here's": 'here is', "he's": 'he is', "she's": 'she is',
  "who's": 'who is', "where's": 'where is', "how's": 'how is',
};
const SUFFIXES = [["n't", 'not'], ["'re", 'are'], ["'ve", 'have'], ["'ll", 'will'], ["'d", 'would'], ["'m", 'am']];
const NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
const EQUIV = { ok: 'okay', cancelled: 'canceled', mom: 'mother', dad: 'father' };

function expand(w) {
  if (CONTRACTIONS[w]) return CONTRACTIONS[w].split(' ');
  for (const [suf, full] of SUFFIXES) {
    if (w.endsWith(suf) && w.length > suf.length) return [w.slice(0, -suf.length), full];
  }
  return [w];
}

function tokenize(text) {
  return text.split(/\s+/).filter(Boolean).map(disp => {
    const base = disp.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘]/g, "'");
    const norms = base.split('-').flatMap(part => {
      const w = part.replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
      return w ? expand(w) : [];
    }).map(w => {
      const x = w.replace(/'/g, '');
      return NUMBERS[+x] && /^\d+$/.test(x) ? NUMBERS[+x] : EQUIV[x] ?? x;
    });
    return { disp, norms };
  });
}

function flatten(tokens) {
  const words = [];
  const owner = [];
  tokens.forEach((t, i) => t.norms.forEach(n => {
    words.push(n);
    owner.push(i);
  }));
  return { words, owner };
}

function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ma = new Set();
  const mb = new Set();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ma.add(i++);
      mb.add(j++);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { ma, mb };
}

// Marks model words the learner missed and spoken words that are not in the model.
// Model words carry data-w (their index) so speech playback can highlight them.
export function compare(model, said) {
  const mt = tokenize(model);
  const st = tokenize(said || '');
  const mf = flatten(mt);
  const sf = flatten(st);
  const { ma, mb } = lcs(mf.words, sf.words);

  const missed = new Set();
  mf.owner.forEach((o, k) => { if (!ma.has(k)) missed.add(o); });
  const matched = new Set();
  sf.owner.forEach((o, k) => { if (mb.has(k)) matched.add(o); });

  const modelHtml = mt.map((t, i) => `<span class="w" data-w="${i}">${missed.has(i) ? `<mark class="miss">${esc(t.disp)}</mark>` : esc(t.disp)}</span>`).join(' ');
  const saidHtml = st.map((t, i) => (matched.has(i) || !t.norms.length ? esc(t.disp) : `<span class="extra">${esc(t.disp)}</span>`)).join(' ');
  const score = mf.words.length ? ma.size / mf.words.length : 0;
  return { modelHtml, saidHtml, score };
}
