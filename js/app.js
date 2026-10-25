// Home → step 1 (drill) → step 2 (4/3/2 talk) → done.

import { view, keys, chrome, setEscape, leave } from './ui.js';
import { state, save, streak, previousWpm, today, exportData, importData } from './store.js';
import { counts, levelProgress } from './srs.js';
import { LEVELS } from '../data/cards.js';
import { canListen, unlockSpeech } from './speech.js';
import { runDrill } from './drill.js';
import { runTalk } from './talk.js';
import { showStats } from './stats.js';
import { beatHome, beatCounts } from './beat.js';

function home() {
  leave();
  setEscape(null);
  chrome({ keyHint: canListen ? 'Enter 始める · 1 ドリルだけ · 2 スピーチだけ · 3 ビート練習' : '' });

  if (!canListen) {
    view(`<div class="home">
      <p class="eyebrow">SPEAK</p>
      <p class="lead">このブラウザは音声認識に対応していません。<br>PC は Chrome か Edge、iPhone は Safari で開いてください。</p>
    </div>`);
    keys({});
    return;
  }

  const c = counts();
  const cards = c.due + c.fresh;
  const talked = !!state.days[today()]?.wpm?.length;
  const s = streak();
  const times = state.settings.talk === 'short' ? '2分 → 1.5分 → 1分' : '4分 → 3分 → 2分';

  // The main button always names what it will do next.
  const [label, action] = cards
    ? ['ドリルから始める', () => begin(() => runDrill(() => runTalk(complete)))]
    : !talked
      ? ['スピーチを始める', () => begin(() => runTalk(complete))]
      : [`追加でドリル(+${EXTRA}枚)`, extraDrill];

  const level = state.settings.level;
  const progress = levelProgress();
  const beat = beatCounts();
  view(`<div class="home">
    <p class="eyebrow">今日の練習</p>
    <div class="levels" role="group" aria-label="レベル">
      ${LEVELS.map((name, i) => `<button class="lv${level === i + 1 ? ' is-on' : ''}" data-level="${i + 1}" type="button">
        ${name}<small class="num">${progress[i + 1]?.seen ?? 0}/${progress[i + 1]?.total ?? 0}</small></button>`).join('')}
    </div>
    <div class="menu">
      <button class="row${cards ? '' : ' is-done'}" data-key="1" type="button">
        <span class="row-no">1</span>
        <span class="row-body">
          <span class="row-title">瞬間ドリル</span>
          <span class="row-desc">${LEVELS[level - 1]} · 日本語を見て、すぐ英語で言う</span>
        </span>
        <span class="row-state num">${cards
          ? `${cards}枚<small>復習 ${c.due} · 新規 ${c.fresh}</small>`
          : `✓ 完了<small>押すと +${EXTRA}枚</small>`}</span>
      </button>
      <button class="row${talked ? ' is-done' : ''}" data-key="2" type="button">
        <span class="row-no">2</span>
        <span class="row-body">
          <span class="row-title">スピーチ</span>
          <span class="row-desc">同じ話を ${times} で3回</span>
        </span>
        <span class="row-state">${talked ? '✓ 完了<small>押すともう一度</small>' : '約10分'}</span>
      </button>
      <button class="row" data-key="3" type="button">
        <span class="row-no">3</span>
        <span class="row-body">
          <span class="row-title">ビート練習</span>
          <span class="row-desc">大事な語だけを聞き取り、リズムに乗せて言う</span>
        </span>
        <span class="row-state num">${beat.done}/${beat.total}</span>
      </button>
    </div>
    <button class="primary" data-key="Enter">${label}</button>
    <p class="streak">${s ? `${s}日連続` : ''}</p>
    ${state.notice ? '' : '<p class="notice">音声はブラウザの音声認識機能によって、Google や Apple のサーバーで文字に変換されます。</p>'}
  </div>`);
  document.querySelectorAll('[data-level]').forEach(b => {
    b.onclick = () => {
      state.settings.level = Number(b.dataset.level);
      save();
      home();
    };
  });
  keys({
    Enter: action,
    1: cards ? () => begin(() => runDrill(home, { next: 'ホームへ' })) : extraDrill,
    2: () => begin(() => runTalk(complete)),
    3: () => begin(beatHome),
  });
}

const EXTRA = 10;

function extraDrill() {
  begin(() => runDrill(home, { extra: EXTRA, next: 'ホームへ' }));
}

function begin(run) {
  unlockSpeech();
  if (!state.notice) {
    state.notice = true;
    save();
  }
  setEscape(home);
  run();
}

function complete() {
  setEscape(null);
  chrome({ keyHint: 'Enter ホームへ' });
  const wpm = state.days[today()]?.wpm?.at(-1);
  const prev = previousWpm();
  view(`<div class="home">
    <p class="eyebrow">今日の練習 完了</p>
    <p class="big-stat num">${streak()}<span class="unit">日連続</span></p>
    ${wpm ? `<p class="delta num">${wpm} WPM${prev ? `<span class="faint"> · 前回 ${prev}</span>` : ''}</p>` : '<p class="delta">&nbsp;</p>'}
    <button class="primary" data-key="Enter">ホームへ</button>
  </div>`);
  keys({ Enter: home });
}

document.getElementById('openStats').onclick = () => {
  leave();
  setEscape(home);
  showStats(home);
};

// ---------- settings & backup ----------

const dialog = document.getElementById('settings');
const newPerDay = document.getElementById('newPerDay');
const talkLen = document.getElementById('talkLen');
const importFile = document.getElementById('importFile');

document.getElementById('openSettings').onclick = () => {
  newPerDay.value = String(state.settings.newPerDay);
  talkLen.value = state.settings.talk;
  dialog.showModal();
};
newPerDay.onchange = () => {
  state.settings.newPerDay = Number(newPerDay.value);
  save();
};
talkLen.onchange = () => {
  state.settings.talk = talkLen.value;
  save();
};
dialog.addEventListener('close', home);

document.getElementById('exportBtn').onclick = exportData;
document.getElementById('importBtn').onclick = () => importFile.click();
importFile.onchange = async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file || !confirm('今の学習記録を、このファイルの内容で置き換えます。よろしいですか？')) return;
  try {
    importData(await file.text());
    newPerDay.value = String(state.settings.newPerDay);
    talkLen.value = state.settings.talk;
    alert('読み込みました。');
  } catch {
    alert('このファイルは読み込めませんでした。');
  }
};

home();
