// Home → step 1 (drill) → step 2 (4/3/2 talk) → done.

import { view, keys, chrome, setEscape, leave } from './ui.js';
import { state, save, streak, previousWpm, today, exportData, importData } from './store.js';
import { counts } from './srs.js';
import { canListen, unlockSpeech } from './speech.js';
import { runDrill } from './drill.js';
import { runTalk } from './talk.js';
import { showStats } from './stats.js';

function home() {
  leave();
  setEscape(null);
  chrome({ keyHint: canListen ? 'Enter 始める' : '' });

  if (!canListen) {
    view(`<div class="home">
      <p class="eyebrow">SPEAK</p>
      <p class="lead">このブラウザは音声認識に対応していません。<br>PC は Chrome か Edge、iPhone は Safari で開いてください。</p>
    </div>`);
    keys({});
    return;
  }

  const c = counts();
  const s = streak();
  const talk = state.settings.talk === 'short' ? '2·1.5·1' : '4·3·2';
  view(`<div class="home">
    <p class="eyebrow">今日の練習 · 約15分</p>
    <div class="plan">
      <div><span class="big num">${c.due}</span><span>復習</span></div>
      <div><span class="big num">${c.fresh}</span><span>新しいカード</span></div>
      <div><span class="big num">${talk}</span><span>スピーチ</span></div>
    </div>
    <button class="primary" data-key="Enter">始める</button>
    <p class="streak">${s ? `${s}日連続` : ''}</p>
    ${state.notice ? '' : '<p class="notice">音声はブラウザの音声認識機能によって、Google や Apple のサーバーで文字に変換されます。</p>'}
  </div>`);
  keys({ Enter: start, Space: start });
}

function start() {
  unlockSpeech();
  if (!state.notice) {
    state.notice = true;
    save();
  }
  setEscape(home);
  runDrill(() => runTalk(complete));
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
