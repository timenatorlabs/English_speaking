// Shows a stress-annotated sentence as one-line drum notation: each stressed syllable is an
// accented note on the beat, and the weak syllables are ghost notes squeezed in before the next beat.
// Tapping it plays a click track so the learner can speak the stresses on the clicks.

import { esc } from './ui.js';
import { audioSession } from './speech.js';

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
  return `<svg class="beat" data-width="${width}" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" aria-hidden="true">${out}</svg>`;
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

export function renderScore({ pickup, feet }) {
  const parts = [];
  if (pickup.length) parts.push(group(pickup, { pickup: true }));
  feet.forEach((f, i) => parts.push(group(f, { first: i === 0, last: i === feet.length - 1 })));
  return `<span class="bars">${parts.join('')}</span>`;
}

// ---------- playhead ----------

// Moves a vertical line to the given note head inside the score, or hides it when head is null.
// It glides along a row, and jumps without gliding when the score wraps to another row.
export function movePlayhead(root, head) {
  if (!root) return;
  let bar = root.querySelector('.playhead');
  if (!bar) {
    bar = document.createElement('span');
    bar.className = 'playhead';
    root.append(bar);
  }
  if (!head) {
    bar.classList.remove('on');
    return;
  }
  const box = root.getBoundingClientRect();
  const note = head.getBoundingClientRect();
  const row = head.closest('svg').getBoundingClientRect();
  const x = note.left + note.width / 2 - box.left;
  const y = row.top - box.top;
  const sameRow = bar.classList.contains('on') && bar.dataset.y === String(y);
  bar.style.transition = sameRow ? '' : 'none';
  bar.style.transform = `translate(${x - 1}px, ${y}px)`;
  bar.style.height = `${row.height}px`;
  bar.dataset.y = String(y);
  void bar.offsetWidth;
  bar.style.transition = '';
  bar.classList.add('on');
}

// ---------- click track ----------

let ac = null;
let timers = [];
let sources = [];

export function stopClick() {
  timers.forEach(clearTimeout);
  timers = [];
  sources.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
  sources = [];
  document.querySelectorAll('.beat.on, .playhead.on').forEach(el => el.classList.remove('on'));
}

function tick(t, freq, gain) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + 0.07);
  sources.push(o);
}

// Four count-in clicks, then one click per stressed syllable while its beat lights up.
export function playClick(root, { pickup, feet }) {
  stopClick();
  audioSession('playback');
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  ac.resume();
  const beat = 60 / BPM;
  const lead = 0.15;
  const t0 = ac.currentTime + lead;
  for (let i = 0; i < 4 + feet.length; i++) tick(t0 + i * beat, i < 4 ? 900 : 1600, i < 4 ? 0.22 : 0.4);

  const groups = [...root.querySelectorAll('.beat')];
  const light = (el, at, dur) => {
    timers.push(setTimeout(() => {
      el.classList.add('on');
      movePlayhead(root, el.querySelector('.head'));
    }, at * 1000));
    timers.push(setTimeout(() => el.classList.remove('on'), (at + dur) * 1000));
  };
  if (pickup.length) light(groups.shift(), lead + 3.5 * beat, beat / 2);
  groups.forEach((el, i) => light(el, lead + (4 + i) * beat, beat * 0.92));
  timers.push(setTimeout(() => movePlayhead(root, null), (lead + (4 + groups.length) * beat) * 1000));
}
