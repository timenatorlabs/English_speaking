"""Synthesize the model sentence of every built-in card and time each of its words.

Uses the Piper voice and the faster-whisper model that English_listening already has, so run it
with that project's environment (from this project's root):
    C:\\develop\\English_listening\\.venv\\Scripts\\python.exe -I tools\\make_audio.py

Writes:
    audio/cards/<id>.mp3   one file per card, played instead of browser speech
                           (iOS mutes browser speech in silent mode, but not audio files)
    data/audio.js          word start times, for highlighting and the moving playhead
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

SPEAKER = 539          # clearest female voice in English_listening/data/voices.json
LENGTH_SCALE = 1.05    # a touch slower than Piper's default
VOLUME = 0.9           # 1.0 slightly overshoots full scale after MP3 encoding
PAD = 0.08             # seconds of silence kept before and after speech

NUMBERS = "zero one two three four five six seven eight nine ten eleven twelve".split()

# Spellings that make Piper say a word right; the card still shows the original text.
SAY = {r"\bIT\b": "I.T."}

# Sentences Piper garbles when spoken alone: synthesized after a lead-in word that is then cut off.
LEAD = {"It can't be helped.": ("Well,", 1.3)}   # sentence -> (lead-in, length scale)


def cards():
    for line in (ROOT / "data" / "cards.js").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("['"):
            _, rhythm = ast.literal_eval(s.rstrip(","))
            yield re.sub(r"[*·]", "", rhythm)


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
    """Start time of every whitespace-separated word of `sentence`, and the share Whisper heard."""
    # Decoded here rather than by faster-whisper: the environment's PyAV is newer than it expects.
    audio, rate = sf.read(path, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    segments, _ = model.transcribe(to16k(audio, rate), language="en", word_timestamps=True, beam_size=5)
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


def main() -> None:
    voice = PiperVoice.load(str(VOICE))
    whisper = WhisperModel("base.en", download_root=str(WHISPER_DIR), local_files_only=True, compute_type="int8")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    made = 0
    weak = []
    for en in cards():
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
        manifest[en] = {"src": f"audio/cards/{name}", "t": starts, "d": round(info.duration, 3)}

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


if __name__ == "__main__":
    main()
