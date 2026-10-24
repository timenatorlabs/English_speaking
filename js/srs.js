// Simplified SM-2 scheduling with three grades: 1 couldn't say it, 2 hesitated, 3 said it right away.

import { state, save, today, addDays, day } from './store.js';
import { CARDS } from '../data/cards.js';

const MAX_REVIEWS = 40;

// Learner-added cards come first: they are the sentences they actually needed.
export const allCards = () => [...state.custom, ...CARDS];

// extra: new cards beyond today's limit, for learners who want to keep going.
function plan(extra = 0) {
  const t = today();
  const all = allCards();
  const due = all
    .filter(c => state.cards[c.id]?.due <= t)
    .sort((a, b) => state.cards[a.id].due.localeCompare(state.cards[b.id].due))
    .slice(0, MAX_REVIEWS);
  const room = Math.max(0, state.settings.newPerDay - (state.days[t]?.fresh ?? 0)) + extra;
  // New cards come from the chosen level only (learner-added cards have none and always come);
  // reviews come from every level.
  const fresh = all
    .filter(c => !state.cards[c.id] && (!c.level || c.level === state.settings.level))
    .slice(0, room);
  return { due, fresh };
}

export function counts() {
  const { due, fresh } = plan();
  return { due: due.length, fresh: fresh.length };
}

export function buildQueue(extra = 0) {
  const { due, fresh } = plan(extra);
  return [...due, ...fresh];
}

// rt: milliseconds until the learner started speaking, or null if they never did.
// Returns a function that undoes this grade (for going back to the previous card).
export function grade(card, g, rt = null) {
  const t = today();
  const before = { card: state.cards[card.id] && { ...state.cards[card.id] }, day: state.days[t] && { ...state.days[t] } };
  const d = day(t);
  d.n = (d.n ?? 0) + 1;
  if (g === 3) d.quick = (d.quick ?? 0) + 1;
  if (rt !== null) {
    d.rtSum = (d.rtSum ?? 0) + rt;
    d.rtN = (d.rtN ?? 0) + 1;
  }
  let r = state.cards[card.id];
  const isNew = !r;
  if (isNew) {
    r = { ease: 2.5, ivl: 0, reps: 0, lapses: 0 };
    d.fresh++;
  }
  if (g === 1) {
    if (!isNew) r.lapses++;
    r.ease = Math.max(1.3, r.ease - 0.2);
    r.ivl = 1;
  } else if (g === 2) {
    r.ease = Math.max(1.3, r.ease - 0.15);
    r.ivl = isNew ? 1 : Math.max(r.ivl + 1, Math.round(r.ivl * 1.2));
  } else {
    r.ease = Math.min(3, r.ease + 0.05);
    r.ivl = isNew ? 3 : Math.max(r.ivl + 1, Math.round(r.ivl * r.ease));
  }
  r.reps++;
  r.due = addDays(t, r.ivl);
  state.cards[card.id] = r;
  d.drill++;
  save();
  return () => {
    if (before.card) state.cards[card.id] = before.card;
    else delete state.cards[card.id];
    if (before.day) state.days[t] = before.day;
    else delete state.days[t];
    save();
  };
}

// How far the learner is through each level: { level: { seen, total } }.
export function levelProgress() {
  const out = {};
  for (const c of CARDS) {
    const p = (out[c.level] ??= { seen: 0, total: 0 });
    p.total++;
    if (state.cards[c.id]) p.seen++;
  }
  return out;
}

// Cards the learner keeps failing or hesitating on, worst first.
export function weakCards(limit = 8) {
  const byId = new Map(allCards().map(c => [c.id, c]));
  return Object.entries(state.cards)
    .filter(([id, r]) => byId.has(id) && (r.lapses > 0 || r.ease < 2.3))
    .sort(([, a], [, b]) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, limit)
    .map(([id]) => byId.get(id));
}

// Accepts lines like "日本語 | English" (also "｜"), as returned by the feedback prompt.
export function addCustomCards(text) {
  const known = new Set(allCards().map(c => c.en.toLowerCase()));
  let added = 0;
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[|｜]/);
    if (parts.length < 2) continue;
    const ja = parts[0].replace(/^\s*(?:[-*・•]|\d+[.)．、])\s*/, '').trim();
    const en = parts.slice(1).join(' ').trim();
    if (!ja || !en || known.has(en.toLowerCase())) continue;
    known.add(en.toLowerCase());
    state.custom.push({ id: `c:${Date.now()}:${added}`, ja, en });
    added++;
  }
  if (added) save();
  return added;
}
