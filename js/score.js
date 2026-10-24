// Shows a stress-annotated sentence as one-line drum notation: each stressed syllable is an
// accented note on the beat, and the weak syllables are ghost notes squeezed in before the next beat.
// A playhead follows the model audio or the click track across it.

import { esc } from './ui.js';
import { playAudio, stopAudio, wavUrl } from './speech.js';

const LINE = 38;
const TOP = LINE - 24;
const H = 76;
export const BPM = 90;

export function parseRhythm(src) {
  const pickup = [];
  const feet = [];
  for (const [word, token] of src.split(/\s+/).filter(Boolean).entries()) {
    for (const part of token.split(/[·-]/)) {
      const text = part.replace(/[^A-Za-z']/g, '');
      if (!text) continue;
      const s = { text, word, stressed: part.includes('*') };
      if (s.stressed) feet.push([s]);
      else if (feet.length) feet.at(-1).push(s);
      else pickup.push(s);
    }
  }
  return { pickup, feet };
}

const noteWidth = s => Math.max(22, s.text.length * (s.stressed ? 7.4 : 6.8) + 9);

// Smallest scale for fitting the score on one row; below this the lyrics get hard to read,
// so a longer sentence wraps instead.
const MIN_SCALE = 0.7;

// pickup: up to a half beat before the downbeat. foot: one beat.
function group(sylls, { pickup = false, first = false, last = false } = {}) {
  const n = sylls.length;
  const xs = [];
  let x = first ? 12 : 8;
  for (const s of sylls) {
    const w = noteWidth(s);
    xs.push(x + w / 2);
    x += w;
  }
  const width = x + (last ? 14 : 4);
  const beams = pickup ? (n > 1 ? 2 : 0) : n === 1 ? 0 : n <= 3 ? 1 : 2;
  const tuplet = pickup ? (n >= 3 ? n : 0) : n === 3 || n >= 5 ? n : 0;
  const stemX = cx => cx + 4.7;

  let out = `<line class="staff" x1="0" y1="${LINE}" x2="${width}" y2="${LINE}"/>`;
  if (first) out += `<line class="bar" x1="1.5" y1="${LINE - 11}" x2="1.5" y2="${LINE + 11}"/>`;
  if (last) {
    out += `<line class="bar" x1="${width - 7}" y1="${LINE - 11}" x2="${width - 7}" y2="${LINE + 11}"/>`;
    out += `<line class="bar thick" x1="${width - 2.5}" y1="${LINE - 11}" x2="${width - 2.5}" y2="${LINE + 11}"/>`;
  }
  sylls.forEach((s, i) => {
    const cx = xs[i];
    out += `<g class="${s.stressed ? 'acc' : 'ghost'}" data-w="${s.word}">`;
    out += `<ellipse class="head" cx="${cx}" cy="${LINE}" rx="5.4" ry="3.9" transform="rotate(-20 ${cx} ${LINE})"/>`;
    out += `<line class="stem" x1="${stemX(cx)}" y1="${LINE - 1}" x2="${stemX(cx)}" y2="${TOP}"/>`;
    out += s.stressed
      ? `<path class="mark" d="M${cx - 5} ${LINE + 9} L${cx + 5} ${LINE + 12} L${cx - 5} ${LINE + 15}"/>`
      : `<path class="mark" d="M${cx - 8.5} ${LINE - 5} Q${cx - 11.5} ${LINE} ${cx - 8.5} ${LINE + 5} M${cx + 9} ${LINE - 5} Q${cx + 12} ${LINE} ${cx + 9} ${LINE + 5}"/>`;
    out += `<text class="lyric" x="${cx}" y="${LINE + 32}">${esc(s.text)}</text></g>`;
  });
  if (beams) {
    const x1 = stemX(xs[0]) - 0.7;
    const w = stemX(xs[n - 1]) - stemX(xs[0]) + 1.4;
    out += `<rect class="beam" x="${x1}" y="${TOP}" width="${w}" height="3.4"/>`;
    if (beams === 2) out += `<rect class="beam" x="${x1}" y="${TOP + 6}" width="${w}" height="3.4"/>`;
  } else if (pickup) {
    out += `<path class="flag" d="M${stemX(xs[0])} ${TOP} c0.5 5 8 7 5.5 15"/>`;
  }
  if (tuplet) {
    out += `<text class="tuplet" x="${(stemX(xs[0]) + stemX(xs[n - 1])) / 2}" y="${TOP - 4}">${tuplet}</text>`;
  }
  const cls = pickup ? 'beat pickup' : 'beat';
  return `<svg class="${cls}" data-width="${width}" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" aria-hidden="true">${out}</svg>`;
}

export function renderScore({ pickup, feet }) {
  const parts = [];
  if (pickup.length) parts.push(group(pickup, { pickup: true }));
  feet.forEach((f, i) => parts.push(group(f, { first: i === 0, last: i === feet.length - 1 })));
  return `<span class="bars">${parts.join('')}</span><span class="playhead"></span>`;
}

// Shrinks the score (down to MIN_SCALE) so it fits the width of `root` on one row.
export function fitScore(root) {
  if (!root) return;
  const svgs = [...root.querySelectorAll('svg.beat')];
  const natural = svgs.reduce((sum, s) => sum + Number(s.dataset.width), 0);
  const k = Math.min(1, Math.max(MIN_SCALE, (root.clientWidth - 2) / natural));
  for (const s of svgs) {
    s.setAttribute('width', (Number(s.dataset.width) * k).toFixed(1));
    s.setAttribute('height', (H * k).toFixed(1));
  }
}

addEventListener('resize', () => fitScore(document.getElementById('score')));

// ---------- playhead ----------

// Positions (relative to root) of the notes, measured once per playback.
function measure(root) {
  const box = root.getBoundingClientRect();
  const at = el => {
    const r = el.getBoundingClientRect();
    const row = el.closest('svg').getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: row.top - box.top, h: row.height };
  };
  const notes = [...root.querySelectorAll('.beat g[data-w]')].map(g => ({ word: Number(g.dataset.w), g, ...at(g.querySelector('.head')) }));
  const beats = [...root.querySelectorAll('svg.beat')].map(svg => ({ svg, pickup: svg.classList.contains('pickup'), ...at(svg.querySelector('.head')) }));
  const last = root.querySelectorAll('svg.beat');
  const end = last.length ? last[last.length - 1].getBoundingClientRect() : box;
  return { notes, beats, endX: end.right - box.left - 6 };
}

// Places the playhead between point a and point b at fraction f (no gliding across rows).
function place(root, a, b, f) {
  const bar = root.querySelector('.playhead');
  if (!bar) return;
  const x = b && b.y === a.y ? a.x + (b.x - a.x) * Math.min(1, Math.max(0, f)) : a.x;
  bar.style.transform = `translate(${x - 1}px, ${a.y}px)`;
  bar.style.height = `${a.h}px`;
  bar.classList.add('on');
}

export function hidePlayhead(root) {
  root?.querySelector('.playhead')?.classList.remove('on');
  root?.querySelectorAll('.beat.on').forEach(el => el.classList.remove('on'));
}

// Drives the word highlight and the playhead from an audio element's clock.
// starts: start time (s) of each whitespace-separated word; duration: clip length (s).
export function follow(audio, { root, starts, duration, onWord }) {
  const m = root ? measure(root) : null;
  const firstNote = w => m?.notes.find(n => n.word === w);
  let current = -2;
  let raf = 0;
  const tick = () => {
    const t = audio.currentTime;
    let i = -1;
    while (i + 1 < starts.length && starts[i + 1] <= t) i++;
    if (i !== current) {
      current = i;
      onWord(i);
    }
    if (m && i >= 0) {
      const a = firstNote(i);
      const next = i + 1 < starts.length ? firstNote(i + 1) : { x: m.endX, y: a?.y };
      const until = i + 1 < starts.length ? starts[i + 1] : duration;
      if (a) place(root, a, next, (t - starts[i]) / Math.max(0.01, until - starts[i]));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    onWord(-1);
    hidePlayhead(root);
  };
}

// ---------- click track ----------

const RATE = 22050;
const LEAD = 0.15;
const COUNT_IN = 4;

// The click track is rendered to a WAV and played as an audio file: iOS silences
// generated (Web Audio) sound in silent mode, but not audio files.
function clickTrack(nBeats) {
  const beat = 60 / BPM;
  const len = Math.ceil((LEAD + (COUNT_IN + nBeats) * beat + 0.3) * RATE);
  const pcm = new Int16Array(len);
  const burst = Math.round(0.035 * RATE);
  for (let b = 0; b < COUNT_IN + nBeats; b++) {
    const countIn = b < COUNT_IN;
    const freq = countIn ? 900 : 1600;
    const gain = countIn ? 0.3 : 0.55;
    const start = Math.round((LEAD + b * beat) * RATE);
    for (let i = 0; i < burst && start + i < len; i++) {
      const t = i / RATE;
      pcm[start + i] = Math.round(Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 90) * gain * 32767);
    }
  }
  return wavUrl(pcm, RATE);
}

let stopFollow = null;

export function stopClick() {
  const stop = stopFollow;
  stopFollow = null;
  stop?.();
}

// Four count-in clicks, then one click per stressed syllable while the playhead sweeps the beats.
export async function playClick(root, { pickup, feet }) {
  stopClick();
  const url = clickTrack(feet.length);
  const beat = 60 / BPM;
  const m = measure(root);
  const beats = m.beats.filter(b => !b.pickup);
  const pick = m.beats.find(b => b.pickup);
  let raf = 0;
  let lit = null;
  const light = el => {
    if (el === lit) return;
    lit?.classList.remove('on');
    el?.classList.add('on');
    lit = el;
  };
  const audio = playAudio(url, () => stopClick());
  const tick = () => {
    const pos = (audio.currentTime - LEAD) / beat;   // in beats; downbeat of the sentence at COUNT_IN
    const j = Math.floor(pos - COUNT_IN);
    if (pick && pickup.length && pos >= COUNT_IN - 0.5 && pos < COUNT_IN) {
      light(pick.svg);
      place(root, pick, beats[0], (pos - (COUNT_IN - 0.5)) / 0.5);
    } else if (j >= 0 && j < beats.length) {
      light(beats[j].svg);
      place(root, beats[j], beats[j + 1] ?? { x: m.endX, y: beats[j].y }, pos - COUNT_IN - j);
    } else {
      light(null);
      hidePlayhead(root);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  stopFollow = () => {
    cancelAnimationFrame(raf);
    stopAudio(audio);
    light(null);
    hidePlayhead(root);
    URL.revokeObjectURL(url);
  };
}
