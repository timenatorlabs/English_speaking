// Simplified SM-2 scheduling with three grades: 1 couldn't say it, 2 hesitated, 3 said it right away.

import { state, save, today, addDays, day } from './store.js';
import { CARDS } from '../data/cards.js';

const MAX_REVIEWS = 40;

// Learner-added cards come first: they are the sentences they actually needed.
export const allCards = () => [...state.custom, ...CARDS];

function plan() {
  const t = today();
  const all = allCards();
  const due = all
    .filter(c => state.cards[c.id]?.due <= t)
    .sort((a, b) => state.cards[a.id].due.localeCompare(state.cards[b.id].due))
    .slice(0, MAX_REVIEWS);
  const room = Math.max(0, state.settings.newPerDay - (state.days[t]?.fresh ?? 0));
  const fresh = all.filter(c => !state.cards[c.id]).slice(0, room);
  return { due, fresh };
}

export function counts() {
  const { due, fresh } = plan();
  return { due: due.length, fresh: fresh.length };
}

export function buildQueue() {
  const { due, fresh } = plan();
  return [...due, ...fresh];
}

export function grade(card, g) {
  const t = today();
  const d = day(t);
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
