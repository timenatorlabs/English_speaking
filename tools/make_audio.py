"""Synthesize the model sentence of every built-in card and time each of its words.

Uses the Piper voice and the faster-whisper model that English_listening already has, so run it
with that project's environment (from this project's root):
    C:\\develop\\English_listening\\.venv\\Scripts\\python.exe -I tools\\make_audio.py

Writes:
    audio/cards/<id>.mp3       one file per card, played instead of browser speech
                               (iOS mutes browser speech in silent mode, but not audio files)
    audio/rhythm/v2/<id>.mp3   the sentence spoken chunk by chunk with each stressed syllable on
                               a click (like a jazz chant), then the clicks alone for the learner
    data/audio.js              word start times and beat layout, for highlighting and the playhead
Existing MP3s are kept; timings are always re-measured.
"""
import ast
import difflib
import hashlib
import json
import re
import wave
from io import BytesIO
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
LISTENING = ROOT.parent / "English_listening"
VOICE = LISTENING / "voices" / "en_US-libritts_r-medium.onnx"
WHISPER_DIR = LISTENING / "models" / "whisper"
OUT = ROOT / "audio" / "cards"
RHYTHM_OUT = ROOT / "audio" / "rhythm" / "v2"

COUNT_IN = 4           # clicks before the model and before the learner's turn
RHYTHM_LEAD = 0.3      # seconds before the first count-in click
MIN_BEAT = 0.5         # seconds; the tempo is as fast as the chunks allow, but no faster than 120 BPM

SPEAKER = 539          # clearest female voice in English_listening/data/voices.json
LENGTH_SCALE = 1.05    # a touch slower than Piper's default
VOLUME = 0.9           # 1.0 slightly overshoots full scale after MP3 encoding
PAD = 0.08             # seconds of silence kept before and after speech

NUMBERS = "zero one two three four five six seven eight nine ten eleven twelve".split()

# Spellings that make Piper say a word right; the card still shows the original text.
SAY = {r"\bIT\b": "I.T."}

# Sentences Piper garbles when spoken alone: synthesized after a lead-in word that is then cut off.
LEAD = {   # sentence -> (lead-in, length scale)
    "It can't be helped.": ("Well,", 1.3),
    "There's no harm in trying.": ("Well,", 1.1),
}


def cards():
    """(model sentence, rhythm-marked sentence) for every built-in card."""
    for line in (ROOT / "data" / "cards.js").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("['"):
            _, rhythm = ast.literal_eval(s.rstrip(","))
            yield re.sub(r"[*·]", "", rhythm), rhythm


def norm(word: str) -> str:
    w = re.sub(r"[^a-z0-9']", "", word.lower().replace("’", "'"))
    return NUMBERS[int(w)] if w.isdigit() and int(w) < len(NUMBERS) else w


def to16k(audio: np.ndarray, rate: int) -> np.ndarray:
    grid = np.arange(0, len(audio) / rate, 1 / 16000)
    return np.interp(grid, np.arange(len(audio)) / rate, audio).astype(np.float32)


def synthesize(voice: PiperVoice, text: str, whisper: WhisperModel) -> tuple[np.ndarray, int]:
    lead, length = LEAD.get(text, (None, LENGTH_SCALE))
    for pattern, spoken in SAY.items():
        text = re.sub(pattern, spoken, text)
    if lead:
        text = f"{lead} {text[0].lower()}{text[1:]}"
    buf = BytesIO()
    with wave.open(buf, "wb") as wf:
        voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(speaker_id=SPEAKER, volume=VOLUME, length_scale=length))
    buf.seek(0)
    with wave.open(buf, "rb") as wf:
        rate = wf.getframerate()
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
    if lead:
        segments, _ = whisper.transcribe(to16k(audio.astype(np.float32) / 32768, rate), language="en", word_timestamps=True)
        words = [w for seg in segments for w in seg.words]
        cut = words[len(lead.split())].start
        audio = audio[int(max(0.0, cut - 0.03) * rate):]
    loud = np.flatnonzero(np.abs(audio) > 600)
    pad = int(PAD * rate)
    return audio[max(0, loud[0] - pad):loud[-1] + pad], rate


def word_starts(model: WhisperModel, path: Path, sentence: str) -> tuple[list[float], float]:
    # Decoded here rather than by faster-whisper: the environment's PyAV is newer than it expects.
    return word_starts_in(model, *read_mono(path), sentence)


def word_starts_in(model: WhisperModel, audio: np.ndarray, rate: int, sentence: str) -> tuple[list[float], float]:
    """Start time of every whitespace-separated word of `sentence`, and the share Whisper heard."""
    segments, _ = model.transcribe(to16k(audio.astype(np.float32), rate), language="en", word_timestamps=True, beam_size=5)
    heard = [w for seg in segments for w in seg.words]
    ours = [norm(w) for w in sentence.split()]
    theirs = [norm(w.word) for w in heard]
    starts: list[float | None] = [None] * len(ours)
    for block in difflib.SequenceMatcher(a=ours, b=theirs, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            starts[block.a + k] = heard[block.b + k].start
    matched = sum(s is not None for s in starts) / len(ours)

    # Words Whisper missed get times interpolated between their matched neighbours.
    known = [i for i, s in enumerate(starts) if s is not None]
    if not known:
        return [round(i * 0.3, 2) for i in range(len(ours))], 0.0
    for i in range(len(ours)):
        if starts[i] is None:
            before = max((k for k in known if k < i), default=None)
            after = min((k for k in known if k > i), default=None)
            if before is None:
                starts[i] = max(0.0, starts[after] - 0.25 * (after - i))
            elif after is None:
                starts[i] = starts[before] + 0.25 * (i - before)
            else:
                starts[i] = starts[before] + (starts[after] - starts[before]) * (i - before) / (after - before)
    return [round(s, 3) for s in starts], matched


def read_mono(path: Path) -> tuple[np.ndarray, int]:
    audio, rate = sf.read(path, dtype="float32")
    return (audio.mean(axis=1) if audio.ndim > 1 else audio), rate


def chunks(rhythm: str) -> list[dict]:
    """Splits a rhythm-marked sentence before each word that carries a stress, so weak words lean
    on the stress that follows them ("as an engineer"); words after the last stress join the last
    chunk. Each chunk: its text, its syllables (stressed or not), and how many stresses it has."""
    out = []
    for token in rhythm.split():
        sylls = [("*" in p) for p in re.split(r"[·-]", token) if re.sub(r"[^A-Za-z']", "", p)]
        text = re.sub(r"[*·]", "", token)
        if out and out[-1]["stresses"] == 0:   # still collecting weak words before a stress
            out[-1]["text"] += " " + text
            out[-1]["sylls"] += sylls
            out[-1]["stresses"] += sum(sylls)
        else:
            out.append({"text": text, "sylls": sylls, "stresses": sum(sylls)})
    if len(out) > 1 and out[-1]["stresses"] == 0:   # trailing weak words
        last = out.pop()
        out[-1]["text"] += " " + last["text"]
        out[-1]["sylls"] += last["sylls"]
    return out


def stressed_peak(audio: np.ndarray, rate: int, sylls: list[bool]) -> float:
    """Time of the first stressed syllable in a chunk: the loudest point of its share of the speech,
    a little early (a syllable's beat is felt slightly before its loudest point)."""
    hop = int(0.01 * rate)
    env = np.sqrt(np.convolve(audio ** 2, np.ones(2 * hop) / (2 * hop), mode="same"))[::hop]
    loud = np.flatnonzero(env > env.max() * 0.1)
    s, e = loud[0], loud[-1] + 1
    j = sylls.index(True)
    a = s + (e - s) * j // len(sylls)
    b = max(a + 1, s + (e - s) * (j + 1) // len(sylls))
    return max(0.0, (a + int(np.argmax(env[a:b]))) / 100 - 0.03)


def click(rate: int, freq: float, gain: float) -> np.ndarray:
    t = np.arange(int(0.035 * rate)) / rate
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 90) * gain


def rhythm_track(voice_model: PiperVoice, model: WhisperModel, en: str, rhythm: str):
    """Count-in, the sentence chunk by chunk with each stress on a click, count-in, then clicks
    for the learner's turn. Chunks are synthesized separately and placed, never stretched."""
    parts = []
    for ch in chunks(rhythm):
        pcm, rate = synthesize(voice_model, ch["text"], model)
        x = pcm.astype(np.float64) / 32768
        parts.append((x, stressed_peak(x, rate, ch["sylls"]), ch["stresses"]))

    # The tempo is as fast as possible without chunks running into each other.
    need = MIN_BEAT
    for (x1, p1, s1), (_, p2, _) in zip(parts, parts[1:]):
        need = max(need, (len(x1) / rate - p1 + p2 + 0.03) / s1)
    bpm = max(50, int(60 / need) // 2 * 2)
    beat = 60 / bpm
    t0 = RHYTHM_LEAD + COUNT_IN * beat
    n = sum(s for _, _, s in parts)

    placed = []
    b = 0
    for x, peak, s in parts:
        placed.append((int((t0 + b * beat - peak) * rate), x))
        b += s
    voice_end = max(i / rate + len(x) / rate for i, x in placed)
    voice = np.zeros(int(voice_end * rate) + 1)
    for i, x in placed:
        voice[i:i + len(x)] += x

    # the learner's count-in starts on the first free beat after the model has finished
    you = int(np.ceil((voice_end - t0) / beat)) + 1 + COUNT_IN
    total = t0 + (you + n - 1) * beat + 0.6
    out = np.zeros(int(total * rate))
    out[:len(voice)] += voice / max(1e-6, np.abs(voice).max()) * 0.8
    lo, hi = click(rate, 900, 0.25), click(rate, 1600, 0.4)
    beats = [(b, lo) for b in range(-COUNT_IN, 0)] + [(b, hi) for b in range(n)]
    beats += [(b, lo) for b in range(you - COUNT_IN, you)] + [(you + b, hi) for b in range(n)]
    for b, c in beats:
        i = int((t0 + b * beat) * rate)
        out[i:i + len(c)] += c[:len(out) - i]
    out = out / max(1e-6, np.abs(out).max()) * 0.9

    # word timings in the track, and an intelligibility check of the voice alone
    starts, matched = word_starts_in(model, voice, rate, en)
    info = {"bpm": bpm, "t0": round(t0, 3), "n": n, "you": you, "end": round(voice_end, 3), "t": starts}
    return (out * 32767).astype(np.int16), rate, info, matched


def main() -> None:
    voice = PiperVoice.load(str(VOICE))
    whisper = WhisperModel("base.en", download_root=str(WHISPER_DIR), local_files_only=True, compute_type="int8")
    OUT.mkdir(parents=True, exist_ok=True)
    RHYTHM_OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    made = 0
    weak = []
    warped_weak = []
    for en, rhythm in cards():
        name = hashlib.sha1(en.encode("utf-8")).hexdigest()[:10] + ".mp3"
        path = OUT / name
        if not path.exists():
            audio, rate = synthesize(voice, en, whisper)
            sf.write(path, audio, rate, format="MP3")
            made += 1
        info = sf.info(path)
        starts, matched = word_starts(whisper, path, en)
        if matched < 0.8:
            weak.append((round(matched, 2), en))
        pcm, rate, beat_info, heard = rhythm_track(voice, whisper, en, rhythm)
        sf.write(RHYTHM_OUT / name, pcm, rate, format="MP3")
        if heard < 0.8:
            warped_weak.append((round(heard, 2), beat_info["bpm"], en))
        manifest[en] = {
            "src": f"audio/cards/{name}",
            "t": starts,
            "d": round(info.duration, 3),
            "r": {"src": f"audio/rhythm/v2/{name}", **beat_info},
        }

    body = json.dumps(manifest, ensure_ascii=False, indent=0)
    (ROOT / "data" / "audio.js").write_text(
        "// Generated by tools/make_audio.py; do not edit.\n"
        "// Model sentence -> audio file, start time (s) of each whitespace-separated word, duration (s).\n"
        f"export const AUDIO = {body};\n",
        encoding="utf-8",
    )
    size = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"cards={len(manifest)} made={made} size={size / 1e6:.1f}MB")
    for m, en in sorted(weak):
        print(f"  low match {m}: {en}")
    print(f"rhythm tracks: {len(manifest)}, warped speech heard below 0.8: {len(warped_weak)}")
    for m, bpm, en in sorted(warped_weak):
        print(f"  warped {m} at {bpm} BPM: {en}")


if __name__ == "__main__":
    main()
