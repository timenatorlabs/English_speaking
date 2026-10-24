// Step 2: 4/3/2 — tell the same story three times under shrinking time limits.

import { view, keys, chrome, onLeave, esc, micError } from './ui.js';
import { listen, startRecording, countWords, isIOS, audioSession } from './speech.js';
import { state, save, day } from './store.js';
import { addCustomCards } from './srs.js';
import { TOPICS } from '../data/topics.js';

const PREP_SECONDS = 60;

const fmt = s => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtMin = s => `${s / 60}分`;

export function runTalk(done) {
  const plan = state.settings.talk === 'short' ? [120, 90, 60] : [240, 180, 120];
  const results = [];
  let alive = true;
  let timer = null;
  let mic = null;
  let rec = null;
  let audioUrl = null;
  let player = null;

  onLeave(() => {
    alive = false;
    clearInterval(timer);
    mic?.stop();
    rec?.stop();
    player?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });

  const topic = () => TOPICS[state.topicIndex % TOPICS.length];
  prep();

  function prep() {
    const t = topic();
    chrome({ step: 2, info: '準備', keyHint: 'Space 開始 · N 別のお題 · Esc 中断' });
    view(`<div class="talk">
      <p class="eyebrow">お題</p>
      <p class="topic">${esc(t.en)}</p>
      <p class="topic-ja">${esc(t.ja)}</p>
      <p class="rule">同じ内容を ${plan.map(fmtMin).join(' → ')} で3回話します。メモは取らず、頭の中で話の流れだけ決めてください。</p>
      <p class="countdown num" id="cd">${fmt(PREP_SECONDS)}</p>
      <button class="primary" data-key="Space">話し始める</button>
      <button class="pill" data-key="n" type="button">別のお題にする</button>
    </div>`);
    const cd = document.getElementById('cd');
    const begin = () => {
      clearInterval(timer);
      round(0);
    };
    const end = Date.now() + PREP_SECONDS * 1000;
    clearInterval(timer);
    timer = setInterval(() => {
      const left = (end - Date.now()) / 1000;
      cd.textContent = fmt(Math.ceil(left));
      if (left <= 0) begin();
    }, 250);
    keys({
      Space: begin,
      n: () => {
        state.topicIndex++;
        save();
        prep();
      },
    });
  }

  async function round(i) {
    const total = plan[i];
    const last = i === plan.length - 1;
    chrome({ step: 2, info: `${i + 1} / ${plan.length}`, keyHint: 'Space 終了 · Esc 中断' });
    view(`<div class="talk">
      <p class="eyebrow">${i + 1}回目</p>
      <p class="topic-sm">${esc(topic().en)}</p>
      <p class="timer num" id="clock">${fmt(total)}</p>
      <div class="track"><div class="fill" id="fill"></div></div>
      <p class="mic on"><span class="dot"></span>話す</p>
      <button class="ghost" data-key="Space">終了</button>
    </div>`);
    keys({});

    // Only the final, most fluent round is recorded for listening back. On iOS a second
    // microphone user can cut off speech recognition, so recording is skipped there.
    if (last && !isIOS) {
      try {
        rec = await startRecording();
      } catch {
        rec = null;
      }
      if (!alive) return rec?.stop();
    }

    const clock = document.getElementById('clock');
    const fill = document.getElementById('fill');
    const l = listen();
    mic = l;
    const start = Date.now();
    let ended = false;

    const end = async () => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      keys({});
      const secs = Math.min(total, (Date.now() - start) / 1000);
      l.stop();
      const r = await l.done;
      mic = null;
      const audio = rec ? await rec.stop() : null;
      rec = null;
      if (!alive) return;
      if (r.error && !r.text) return micError(r.error, () => round(i));
      // If recognition dropped out mid-round, the word count is incomplete, so no WPM.
      const wpm = secs >= 10 && !r.error ? Math.round(countWords(r.text) / (secs / 60)) : null;
      results[i] = { text: r.text, wpm, audio };
      if (last) finish();
      else between(i);
    };

    timer = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      clock.textContent = fmt(Math.ceil(total - elapsed));
      fill.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
      if (elapsed >= total) end();
    }, 200);
    keys({ Space: end });
  }

  const wpmTrail = () => results.map(r => r.wpm ?? '—').join(' → ');

  function between(i) {
    const r = results[i];
    chrome({ step: 2, info: `${i + 1} / ${plan.length}`, keyHint: 'Enter 次へ · Esc 中断' });
    view(`<div class="talk">
      <p class="eyebrow">${i + 1}回目</p>
      <p class="big-stat num">${r.wpm ?? '—'}<span class="unit">WPM</span></p>
      ${i > 0 ? `<p class="delta num">${wpmTrail()}</p>` : '<p class="delta">&nbsp;</p>'}
      <p class="rule">次は同じ内容を <b>${fmtMin(plan[i + 1])}</b> で。止まらずに、さっきより滑らかに。</p>
      <button class="primary" data-key="Enter">${i + 2}回目を始める</button>
    </div>`);
    keys({ Enter: () => round(i + 1), Space: () => round(i + 1) });
  }

  function finish() {
    const last = results.at(-1);
    const spoken = topic();
    day().wpm = results.map(r => r.wpm ?? 0);
    state.topicIndex++;
    save();

    audioUrl = last.audio ? URL.createObjectURL(last.audio) : null;
    chrome({ step: 2, info: '振り返り', keyHint: 'Enter 完了' });
    view(`<div class="talk review">
      <p class="eyebrow">振り返り</p>
      <p class="delta num">${wpmTrail()}<span class="unit">WPM</span></p>
      <div class="transcript">${last.text ? esc(last.text) : '<span class="faint">認識されたテキストがありません</span>'}</div>
      <div class="row">
        ${audioUrl ? '<button class="ghost" id="play" type="button">▶ 自分の声を聞く</button>' : ''}
        <button class="ghost" id="copy" type="button">添削プロンプトをコピー</button>
      </div>
      <p class="help">無料版の ChatGPT・Claude・Gemini などに貼り付けて添削してもらいます。返ってきた「日本語 | English」の行を下に貼ると、明日からドリルに出ます。</p>
      <textarea id="add" rows="3" placeholder="雨のせいで試合が中止になった | The game was canceled because of the rain."></textarea>
      <div class="row">
        <button class="ghost" id="addBtn" type="button">カードに追加</button>
        <span class="msg" id="addMsg"></span>
      </div>
      <button class="primary" data-key="Enter">完了</button>
    </div>`);

    const play = document.getElementById('play');
    if (play) {
      player = new Audio(audioUrl);
      player.onplay = () => audioSession('playback');
      player.onended = () => (play.textContent = '▶ 自分の声を聞く');
      play.onclick = () => {
        if (player.paused) {
          player.play();
          play.textContent = '❚❚ 停止';
        } else {
          player.pause();
          play.textContent = '▶ 自分の声を聞く';
        }
      };
    }

    const copy = document.getElementById('copy');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(feedbackPrompt(spoken, last.text, plan.at(-1)));
        copy.textContent = 'コピーしました';
      } catch {
        copy.textContent = 'コピーできませんでした';
      }
    };

    document.getElementById('addBtn').onclick = () => {
      const box = document.getElementById('add');
      const n = addCustomCards(box.value);
      document.getElementById('addMsg').textContent = n
        ? `${n}枚追加しました`
        : '「日本語 | English」の形の行が見つかりません';
      if (n) box.value = '';
    };

    keys({
      Enter: () => {
        onLeave(null);
        player?.pause();
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        done();
      },
    });
  }
}

function feedbackPrompt(topic, transcript, seconds) {
  return `あなたは英語スピーキングのコーチです。以下は、英語中級の私がお題「${topic.en}」について${seconds / 60}分間話した内容を、音声認識で文字にしたものです（句読点はなく、誤認識を含むことがあります）。

1. 不自然な箇所や間違いを重要な順に最大5つ選び、「私の言い方 → 自然な言い方」の形で示し、理由を日本語で一言ずつ添えてください。
2. 私が言いたかったと思われる内容を、中級者でも言える自然な英語で書き直してください（120〜150語）。
3. 次に話すときに使えるとよい表現を3〜5個、次の形式で1行ずつ書いてください。説明は不要です。
日本語の文 | English sentence

---
${transcript || '(no transcript)'}`;
}
