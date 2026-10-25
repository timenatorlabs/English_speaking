"""Audio for beat practice (data/beats.js) and the glue library (data/glue.js).

Uses the same Piper voice and Whisper model as make_audio.py; run it the same way:
    C:\\develop\\English_listening\\.venv\\Scripts\\python.exe -I tools\\make_beat_audio.py

Per item:
    audio/beat/n/<id>.mp3   the sentence at natural speed (listening test)
    audio/beat/f/<id>.mp3   count-in, then the sentence chunk by chunk with every beat on a click
                            (glue leans on the beat after it, as in "is going to come")
    audio/beat/b/<id>.mp3   count-in, then only the beat words on the same clicks
Glue library:
    audio/beat/g/<id>.mp3   the example sentence
Writes data/beat_audio.js with file paths, tempo and beat layout. Existing MP3s are kept.
"""
import ast
import difflib
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_audio as M  # noqa: E402  (shares the voice, synthesis and click helpers)

ROOT = M.ROOT
OUT = ROOT / "audio" / "beat"
PATTERN = re.compile(r"(\S*?)\[([^\]|]+)\|([^\]]+)\]|(\S+)")


def items():
    stage = None
    for line in (ROOT / "data" / "beats.js").read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*(\d):\s*\[", line)
        if m:
            stage, no = int(m.group(1)), 0
            continue
        s = line.strip()
        if s.startswith("['"):
            no += 1
            _, pattern, _ = ast.literal_eval(s.rstrip(","))
            yield f"s{stage}-{no:02d}", pattern


def parts_of(pattern: str) -> list[dict]:
    """Same split as data/beats.js: plain words are beats, [text|kana] is glue."""
    parts = []
    for m in PATTERN.finditer(pattern):
        if m.group(4):
            parts.append({"text": m.group(4), "beat": True, "attach": False})
            continue
        if m.group(1):
            parts.append({"text": m.group(1), "beat": True, "attach": False})
        parts.append({"text": m.group(2), "beat": False, "attach": bool(m.group(1)) or m.group(2).startswith("'")})
    return parts


def join(parts: list[dict]) -> str:
    s = ""
    for p in parts:
        s = s + p["text"] if (s and p["attach"]) or not s else f"{s} {p['text']}"
    return s


def syllables(text: str) -> int:
    return max(1, len(re.findall(r"[aeiouy]+", text.lower())))


def chunks(parts: list[dict]) -> list[tuple[str, list[bool]]]:
    """Each beat with the glue before it; glue after the last beat joins the last chunk.
    A contraction ("Mike'll") stays with its word. Returns (text, syllable stress flags)."""
    out, pending = [], []
    for p in parts:
        if p["beat"]:
            out.append(pending + [p])
            pending = []
        elif p["attach"] and out and not pending:
            out[-1].append(p)
        else:
            pending.append(p)
    if pending:
        if out:
            out[-1] += pending
        else:
            out.append(pending)
    result = []
    for ps in out:
        flags = []
        for p in ps:
            flags += [True] if p["beat"] else [False] * syllables(p["text"])
        result.append((join(ps), flags))
    return result


def render(pieces, rate: int, beat: float, n: int) -> tuple[np.ndarray, float]:
    """Places each (audio, peak) on consecutive beats after a count-in, with clicks."""
    t0 = M.RHYTHM_LEAD + M.COUNT_IN * beat
    end = t0 + (n - 1) * beat + 0.8
    for k, (x, peak) in enumerate(pieces):
        end = max(end, t0 + k * beat - peak + len(x) / rate + 0.3)
    out = np.zeros(int(end * rate))
    for k, (x, peak) in enumerate(pieces):
        i = max(0, int((t0 + k * beat - peak) * rate))
        out[i:i + len(x)] += x[:len(out) - i] * 0.85
    lo, hi = M.click(rate, 900, 0.25), M.click(rate, 1600, 0.4)
    for b in range(-M.COUNT_IN, n):
        c = lo if b < 0 else hi
        i = int((t0 + b * beat) * rate)
        out[i:i + len(c)] += c[:len(out) - i]
    return out / max(1e-6, np.abs(out).max()) * 0.9, t0


def heard_share(whisper, audio: np.ndarray, rate: int, text: str) -> float:
    segs, _ = whisper.transcribe(M.to16k(audio.astype(np.float32), rate), language="en")
    ours = [M.norm(w) for w in text.split()]
    theirs = [M.norm(w) for w in " ".join(s.text for s in segs).split()]
    return sum(b.size for b in difflib.SequenceMatcher(a=ours, b=theirs, autojunk=False).get_matching_blocks()) / len(ours)


def synth(voice, whisper, text: str) -> tuple[np.ndarray, int]:
    pcm, rate = M.synthesize(voice, text, whisper)
    return pcm.astype(np.float64) / 32768, rate


def main() -> None:
    voice = M.PiperVoice.load(str(M.VOICE))
    whisper = M.WhisperModel("base.en", download_root=str(M.WHISPER_DIR), local_files_only=True, compute_type="int8")
    for d in "nfbg":
        (OUT / d).mkdir(parents=True, exist_ok=True)

    manifest, weak = {}, []
    for item_id, pattern in items():
        parts = parts_of(pattern)
        text = join(parts)
        n = sum(p["beat"] for p in parts)
        name = f"{item_id}.mp3"

        natural = OUT / "n" / name
        if not natural.exists():
            x, rate = synth(voice, whisper, text)
            sf.write(natural, x, rate, format="MP3")
        x, rate = M.read_mono(natural)
        share = heard_share(whisper, x, rate, text)
        if share < 0.8:
            weak.append((round(share, 2), "natural", text))

        full = [(a, M.stressed_peak(a, r, flags)) for a, r, flags in
                ((*synth(voice, whisper, t), f) for t, f in chunks(parts))]
        bare = [(a, M.stressed_peak(a, r, [True])) for a, r in
                (synth(voice, whisper, re.sub(r"[^A-Za-z']", "", p["text"])) for p in parts if p["beat"])]

        # tempo: as fast as the full chunks allow without running into each other
        need = M.MIN_BEAT
        for (x1, p1), (_, p2) in zip(full, full[1:]):
            need = max(need, len(x1) / rate - p1 + p2 + 0.03)
        bpm = max(50, int(60 / need) // 2 * 2)
        beat = 60 / bpm

        f_audio, t0 = render(full, rate, beat, n)
        b_audio, _ = render(bare, rate, beat, n)
        sf.write(OUT / "f" / name, f_audio, rate, format="MP3")
        sf.write(OUT / "b" / name, b_audio, rate, format="MP3")
        share = heard_share(whisper, f_audio, rate, text)
        if share < 0.7:
            weak.append((round(share, 2), f"chant {bpm}BPM", text))

        manifest[item_id] = {
            "n": f"audio/beat/n/{name}",
            "f": f"audio/beat/f/{name}",
            "b": f"audio/beat/b/{name}",
            "bpm": bpm,
            "t0": round(t0, 3),
        }

    glue = {}
    for line in (ROOT / "data" / "glue.js").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("['"):
            gid = f"g{len(glue) + 1}"
            _, _, example, _ = ast.literal_eval(s.rstrip(","))
            path = OUT / "g" / f"{gid}.mp3"
            if not path.exists():
                x, rate = synth(voice, whisper, example)
                sf.write(path, x, rate, format="MP3")
            glue[gid] = f"audio/beat/g/{gid}.mp3"

    (ROOT / "data" / "beat_audio.js").write_text(
        "// Generated by tools/make_beat_audio.py; do not edit.\n"
        "// Item id -> natural audio, chant (full / beats only), tempo, time of the first beat (s).\n"
        f"export const BEAT_AUDIO = {json.dumps(manifest, indent=0)};\n"
        f"export const GLUE_AUDIO = {json.dumps(glue, indent=0)};\n",
        encoding="utf-8",
    )
    size = sum(f.stat().st_size for f in OUT.rglob("*.mp3"))
    print(f"items={len(manifest)} glue={len(glue)} size={size / 1e6:.1f}MB")
    for share, kind, text in sorted(weak):
        print(f"  low {share} {kind}: {text}")


if __name__ == "__main__":
    main()
