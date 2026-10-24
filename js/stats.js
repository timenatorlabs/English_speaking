// Progress over the last 30 days: three single-series trend charts and the weakest cards.

import { view, keys, chrome, esc } from './ui.js';
import { state, streak, today, addDays } from './store.js';
import { weakCards } from './srs.js';

const DAYS = 30;
const H = 132;
const PAD = { l: 34, r: 12, t: 10, b: 22 };

export function showStats(back) {
  chrome({ keyHint: 'Enter 戻る' });
  const t = today();
  const from = addDays(t, -(DAYS - 1));
  const days = Object.keys(state.days).filter(k => k >= from).sort();
  const pick = (has, val) => days.filter(k => has(state.days[k])).map(k => ({ d: k, v: val(state.days[k]) }));

  const series = [
    {
      title: '平均反応時間', note: '短いほど良い', unit: '秒', digits: 1,
      pts: pick(d => d.rtN, d => d.rtSum / d.rtN / 1000),
    },
    {
      title: 'すぐ言えた割合', note: '高いほど良い', unit: '%', digits: 0, min: 0, max: 100,
      pts: pick(d => d.n, d => (100 * (d.quick ?? 0)) / d.n),
    },
    {
      title: 'スピーチの速さ', note: '最終回 · 高いほど良い', unit: 'WPM', digits: 0,
      pts: pick(d => d.wpm?.at(-1), d => d.wpm.at(-1)),
    },
  ];
  const practiced = Object.values(state.days).filter(d => d.drill > 0 || d.wpm?.length).length;
  const weak = weakCards();

  view(`<div class="stats">
    <p class="eyebrow">記録 · 直近${DAYS}日</p>
    <div class="plan">
      <div><span class="big num">${streak()}</span><span>連続日数</span></div>
      <div><span class="big num">${practiced}</span><span>練習した日</span></div>
      <div><span class="big num">${Object.keys(state.cards).length}</span><span>学習したカード</span></div>
    </div>
    ${series.map((s, i) => `<section class="chart">
      <div class="chart-h">
        <span><span class="chart-t">${s.title}</span><span class="chart-n">${s.note}</span></span>
        <span class="chart-v num">${s.pts.length ? fmt(s, s.pts.at(-1).v) : '—'}<small>${s.unit}</small></span>
      </div>
      <div class="chart-body" id="chart${i}"></div>
    </section>`).join('')}
    ${weak.length ? `<p class="section">苦手なカード</p>
      <ul class="cardlist">${weak.map(c => `<li><span class="ja">${esc(c.ja)}</span><span class="en">${esc(c.en)}</span></li>`).join('')}</ul>` : ''}
    <button class="primary" data-key="Enter">戻る</button>
  </div>`);
  series.forEach((s, i) => draw(document.getElementById(`chart${i}`), s));
  keys({ Enter: back });
}

const fmt = (s, v) => v.toFixed(s.digits);
const dayNum = ymd => Math.round(new Date(`${ymd}T00:00:00`).getTime() / 86400000);
const md = ymd => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8))}`;

function draw(el, s) {
  if (s.pts.length < 2) {
    el.innerHTML = '<p class="chart-empty">2日分の記録がたまると、推移が表示されます</p>';
    return;
  }
  const W = Math.max(240, el.clientWidth);
  const vs = s.pts.map(p => p.v);
  let lo = s.min ?? Math.min(...vs);
  let hi = s.max ?? Math.max(...vs);
  if (s.min === undefined) {
    const pad = (hi - lo || hi || 1) * 0.15;
    lo = Math.max(0, lo - pad);
    hi += pad;
  }
  const d0 = dayNum(s.pts[0].d);
  const span = Math.max(1, dayNum(s.pts.at(-1).d) - d0);
  const x = d => PAD.l + ((dayNum(d) - d0) / span) * (W - PAD.l - PAD.r);
  const y = v => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

  const ticks = [lo, (lo + hi) / 2, hi];
  const grid = ticks.map(v => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${PAD.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${v.toFixed(s.digits)}</text>`).join('');
  const path = s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const last = s.pts.at(-1);

  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${s.title}: ${s.pts.map(p => `${md(p.d)} ${fmt(s, p.v)}${s.unit}`).join(', ')}">
    ${grid}
    <text class="axis" x="${PAD.l}" y="${H - 5}">${md(s.pts[0].d)}</text>
    <text class="axis" x="${W - PAD.r}" y="${H - 5}" text-anchor="end">${md(last.d)}</text>
    <path class="line" d="${path}"/>
    <circle class="end" cx="${x(last.d)}" cy="${y(last.v)}" r="4"/>
    <line class="cross" id="cross" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/>
    <circle class="end" id="dot" r="4" visibility="hidden"/>
    <rect class="hit" x="0" y="0" width="${W}" height="${H}"/>
  </svg><div class="tip" hidden></div>`;

  const svg = el.querySelector('svg');
  const cross = svg.querySelector('#cross');
  const dot = svg.querySelector('#dot');
  const tip = el.querySelector('.tip');
  const show = e => {
    const px = e.clientX - svg.getBoundingClientRect().left;
    const p = s.pts.reduce((a, b) => (Math.abs(x(b.d) - px) < Math.abs(x(a.d) - px) ? b : a));
    const cx = x(p.d);
    const cy = y(p.v);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${md(p.d)}  ${fmt(s, p.v)} ${s.unit}`;
    tip.style.left = `${Math.min(Math.max(cx, 40), W - 40)}px`;
    tip.style.top = `${cy - 34}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}
