// Step 1: see Japanese, say it in English at once, check, hear the model, repeat it, grade.

import { view, keys, chrome, onLeave, esc, micError } from './ui.js';
import { listen, speak, stopSpeaking } from './speech.js';
import { buildQueue, grade } from './srs.js';
import { parseRhythm, renderScore, playClick, stopClick, BPM } from './score.js';

const LABELS = { 1: '言えなかった', 2: '詰まった', 3: 'すぐ言えた' };

export function runDrill(done) {
  const items = buildQueue().map(card => ({ card, retry: false }));
  if (!items.length) return done();

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
    if (!item) {
      onLeave(null);
      return done();
    }
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
    chrome({ step: 1, info: remaining(), keyHint: '1 2 3 評価 · Enter 決定 · R もう一度聞く · B リズム' });
    view(`<div class="drill">
      <p class="ja-sub">${esc(item.card.ja)}</p>
      <p class="en-model">${c.modelHtml}</p>
      ${rhythm ? `<button class="score" id="score" type="button">${renderScore(rhythm)}<span class="score-cap num">♩ = ${BPM} · タップでクリックに合わせて言う</span></button>` : ''}
      <p class="said">${said ? c.saidHtml : '<span class="faint">—</span>'}</p>
      <p class="meta-line"><span class="num">${rt === null ? '' : `反応 ${(rt / 1000).toFixed(1)}秒`}</span><button class="link rep" id="rep" data-key="r" type="button"></button></p>
      <div class="grades">
        ${[1, 2, 3].map(g => `<button class="grade${g === sug ? ' is-sug' : ''}" data-key="${g}"><kbd>${g}</kbd>${LABELS[g]}</button>`).join('')}
      </div>
    </div>`);

    let finished = false;
    let echoId = 0;
    const rep = document.getElementById('rep');

    const commit = g => {
      if (finished) return;
      finished = true;
      mic?.stop();
      mic = null;
      stopSpeaking();
      stopClick();
      if (!item.retry) {
        grade(item.card, g);
        if (g === 1) items.push({ card: item.card, retry: true });
      }
      next();
    };

    // Stops any repeat listening, so the clicks are not transcribed.
    function practiceRhythm() {
      echoId++;
      mic?.stop();
      mic = null;
      stopSpeaking();
      rep.className = 'link rep';
      rep.textContent = '▶ もう一度聞く';
      playClick(document.getElementById('score'), rhythm);
    }
    document.getElementById('score')?.addEventListener('click', practiceRhythm);

    // Play the model, then listen once while the learner repeats it.
    async function echo() {
      const id = ++echoId;
      mic?.stop();
      mic = null;
      stopClick();
      rep.className = 'link rep';
      rep.textContent = '♪ お手本';
      await speak(item.card.en);
      if (finished || !alive || id !== echoId) return;
      rep.className = 'link rep on';
      rep.textContent = '● 繰り返す';
      const l = listen({ silenceMs: 1500 });
      mic = l;
      const r = await l.done;
      if (finished || !alive || id !== echoId) return;
      mic = null;
      const ok = r.text && compare(item.card.en, r.text).score >= 0.8;
      rep.className = ok ? 'link rep ok' : 'link rep';
      rep.textContent = ok ? '✓ 繰り返し · もう一度聞く' : '▶ もう一度聞く';
    }

    keys({
      1: () => commit(1),
      2: () => commit(2),
      3: () => commit(3),
      Enter: () => commit(sug),
      r: echo,
      ...(rhythm && { b: practiceRhythm }),
    });
    echo();
  }
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

  const modelHtml = mt.map((t, i) => (missed.has(i) ? `<mark class="miss">${esc(t.disp)}</mark>` : esc(t.disp))).join(' ');
  const saidHtml = st.map((t, i) => (matched.has(i) || !t.norms.length ? esc(t.disp) : `<span class="extra">${esc(t.disp)}</span>`)).join(' ');
  const score = mf.words.length ? ma.size / mf.words.length : 0;
  return { modelHtml, saidHtml, score };
}
