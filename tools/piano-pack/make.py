"""Build the grand piano's sample pack (src/engine/audio/piano.ts reads it) from Salamander Grand Piano V3.

Salamander Grand Piano V3 by Alexander Holm, CC-BY 3.0 (https://archive.org/details/SalamanderGrandPianoV3); the
FLAC remap is at github.com/sfzinstruments/SalamanderGrandPiano.

    python tools/piano-pack/make.py <Samples folder> <out.pvpiano>

Keeps 6 of the 16 loudness layers, trims the silence before each note, shortens the long tails (a low note rings
for 25 s; held that long under the pedal it has long faded into the room anyway) with a fade, and stores each sample as Ogg Opus. Needs ffmpeg with
libopus and numpy.
"""
import json, os, struct, subprocess, sys, tempfile
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
RATE = 48000
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# layer → the middle of the velocity range it was recorded for (Salamander's vel_XX ranges)
LAYERS = {4: 40, 7: 53, 9: 68, 11: 84, 13: 100, 16: 124}

def key_name(k):
    return f'{NAMES[k % 12]}{k // 12 - 1}'

def read(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

def opus(x, kbps):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.raw'); o = os.path.join(d, 'a.ogg')
        x.astype(np.float32).tofile(w)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-i', w, '-c:a', 'libopus', '-b:a', f'{kbps}k', '-vbr', 'on', '-application', 'audio', o], check=True)
        return open(o, 'rb').read()

def trim_note(x, key):
    mono = np.abs(x).max(axis=1)
    peak = mono.max() + 1e-12
    start = int(np.argmax(mono > peak * 10 ** (-50 / 20)))
    start = max(0, start - int(0.003 * RATE))
    x = x[start:]
    # the longest a note is kept: 10 s in the bass, 2.5 s at the top
    u = (key - 21) / 87
    keep = int(RATE * (10 - 7.5 * u))
    # or until it has died away by 60 dB
    env = np.convolve(np.abs(x).max(axis=1), np.ones(480) / 480, mode='same')
    quiet = np.nonzero(env > peak * 10 ** (-60 / 20))[0]
    if len(quiet):
        keep = min(keep, quiet[-1] + RATE // 10)
    x = x[:keep].copy()
    fade = min(len(x) // 3, int(0.6 * RATE))
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    x[:16] *= np.linspace(0, 1, 16)[:, None]
    return x

items, blobs, off = [], [], 0
decoded_secs = 0.0
def add(kind, key, vel, data):
    global off
    items.append({'kind': kind, 'key': key, 'vel': vel, 'tune': 0, 'off': off, 'len': len(data)})
    blobs.append(data); off += len(data)

for key in range(21, 109, 3):
    for layer, vel in LAYERS.items():
        x = trim_note(read(os.path.join(SRC, f'{key_name(key)}v{layer}.flac')), key)
        decoded_secs += len(x) / RATE
        add('note', key, vel, opus(x, 96))
    print(key_name(key), end=' ', flush=True)
for key in range(21, 109):
    x = read(os.path.join(SRC, f'rel{key - 20}.flac'))[: int(0.6 * RATE)].copy()
    f = min(len(x) // 2, int(0.15 * RATE)); x[-f:] *= np.linspace(1, 0, f)[:, None]
    add('rel', key, 0, opus(x, 64))
for i in (1, 2):
    add('pedalUp', 0, 0, opus(read(os.path.join(SRC, f'pedalU{i}.flac')), 64))
    add('pedalDown', 0, 0, opus(read(os.path.join(SRC, f'pedalD{i}.flac')), 64))

header = json.dumps({'version': 1, 'credit': 'Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0)', 'items': items}).encode()
with open(OUT, 'wb') as f:
    f.write(struct.pack('<I', len(header))); f.write(header)
    for b in blobs: f.write(b)
print(f'\n{OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {len(items)} samples, notes decode to {decoded_secs:.0f} s of stereo')
