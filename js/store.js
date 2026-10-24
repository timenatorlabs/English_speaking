// All progress lives in one localStorage entry so it can be exported as a single JSON file.

const KEY = 'speak.v1';

const defaults = () => ({
  version: 1,
  cards: {},      // card id -> { ease, ivl, due, reps, lapses }
  custom: [],     // cards the learner added: { id, ja, en }
  settings: { newPerDay: 10, talk: 'full' },
  days: {},       // 'YYYY-MM-DD' -> { drill, fresh, n, quick, rtSum, rtN, wpm: [r1, r2, r3] }
  topicIndex: 0,
  notice: false,
});

function merge(s) {
  const d = defaults();
  return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(JSON.parse(raw));
  } catch { /* fall through to a fresh state */ }
  return defaults();
}

export let state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage unavailable: progress lasts for this tab only */ }
}

export function today(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return today(new Date(y, m - 1, d + n));
}

export function day(ymd = today()) {
  return (state.days[ymd] ??= { drill: 0, fresh: 0 });
}

const practiced = ymd => {
  const d = state.days[ymd];
  return !!d && (d.drill > 0 || d.wpm?.length > 0);
};

export function streak() {
  let d = today();
  if (!practiced(d)) d = addDays(d, -1);
  let n = 0;
  while (practiced(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// Last-round WPM from the most recent day before `ymd`.
export function previousWpm(ymd = today()) {
  const past = Object.keys(state.days).filter(k => k < ymd && state.days[k].wpm?.length).sort();
  const last = past.at(-1);
  return last ? state.days[last].wpm.at(-1) : null;
}

// Average reaction time (seconds) on the most recent day before `ymd`.
export function previousReaction(ymd = today()) {
  const past = Object.keys(state.days).filter(k => k < ymd && state.days[k].rtN).sort();
  const d = state.days[past.at(-1)];
  return d ? d.rtSum / d.rtN / 1000 : null;
}

export function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `speak-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importData(text) {
  const s = JSON.parse(text);
  if (!s || s.version !== 1 || typeof s.cards !== 'object') throw new Error('invalid backup');
  state = merge(s);
  save();
}
