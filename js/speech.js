// Browser speech recognition, speech synthesis and recording.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);

// Listens until stop() is called, or until `silenceMs` passes without new speech.
// Chrome ends recognition on its own after pauses, so it is restarted while active.
// done resolves to { text, firstSoundAt, error }.
export function listen({ silenceMs = 0, onUpdate } = {}) {
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;

  let prior = '';
  let session = '';
  let interim = '';
  let firstSoundAt = null;
  let error = null;
  let active = true;
  let finished = false;
  let restarts = 0;
  let silence;
  let guard;
  let resolve;
  const done = new Promise(r => (resolve = r));

  const text = () => `${prior} ${session} ${interim}`.replace(/\s+/g, ' ').trim();
  const heard = () => { if (firstSoundAt === null) firstSoundAt = performance.now(); };

  rec.onspeechstart = heard;
  rec.onresult = e => {
    heard();
    let f = '';
    let it = '';
    for (const r of e.results) {
      if (r.isFinal) f += r[0].transcript + ' ';
      else it += r[0].transcript;
    }
    session = f;
    interim = it;
    onUpdate?.(text());
    if (silenceMs) {
      clearTimeout(silence);
      silence = setTimeout(stop, silenceMs);
    }
  };
  rec.onerror = e => {
    if (FATAL.has(e.error)) {
      error = e.error;
      active = false;
    }
  };
  rec.onend = () => {
    prior = text();
    session = '';
    interim = '';
    if (active && restarts++ < 100) {
      try {
        rec.start();
        return;
      } catch { /* fall through and finish */ }
    }
    finish();
  };

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(silence);
    clearTimeout(guard);
    resolve({ text: text(), firstSoundAt, error });
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(silence);
    guard = setTimeout(finish, 2000);
    try {
      rec.stop();
    } catch {
      finish();
    }
  }

  try {
    rec.start();
  } catch {
    error = 'audio-capture';
    active = false;
    finish();
  }
  return { stop, done, text };
}

let voice = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const us = voices.filter(v => /^en[-_]US/i.test(v.lang));
  voice = us.find(v => /natural/i.test(v.name))
    || us.find(v => /google/i.test(v.name))
    || us[0]
    || voices.find(v => /^en/i.test(v.lang))
    || null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

export function speak(text, rate = 0.95) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate;
    // onend is occasionally never fired in Chrome, so cap the wait.
    const cap = setTimeout(resolve, 2500 + countWords(text) * 600);
    u.onend = u.onerror = () => {
      clearTimeout(cap);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// iOS only lets a page speak after speech was started from a tap; call this from one.
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = e => chunks.push(e.data);
  mr.start();
  return {
    stop: () => new Promise(resolve => {
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        resolve(new Blob(chunks, { type: mr.mimeType }));
      };
      mr.stop();
    }),
  };
}

export const countWords = t => t.split(/\s+/).filter(Boolean).length;
