"""Build pianoverse.in into website/site/ (published to the gh-pages branch).

The page is index.src.html with the looks, the notes and the waveform filled in.
Every picture, video and sound on it comes from the app itself, rendered from the
sample take in samples/ (the frames go to website/.work/, which is not committed).

  npx vite build && npx vite preview --port 4173      # the app, for rendering frames
  npx vite --port 5174                                 # the app's source, for the piano audio
  python3 website/build.py render    # frames from the app (slow without a graphics card)
  python3 website/build.py media     # videos, stills, audio, fonts
  python3 website/build.py page      # site/index.html
  (cd website/site && python3 -m http.server 8090)
  node website/tools/og.mjs website/site                  # share card and touch icon
  node website/tools/shoot.mjs <dir>                      # full-page screenshots at 1440 and 390
"""
import glob, json, os, shutil, subprocess, sys
from PIL import Image

W = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(W)
WORK = f'{W}/.work'
S = f'{W}/site'
A = f'{S}/assets'
SRC = f'{ROOT}/samples/interstellar-take1.mp4'
PROJ = f'{ROOT}/samples/interstellar-take1.pvproj.json'
LOOKS = ['Lagoon', 'Concert', 'Ember', 'Neon Night', 'Aurora', 'Swan', 'Gold Leaf', 'Ink', 'Synthwave', 'Ocean Gem', 'Crystal']
# the stretch of the take the page shows: 0:20 to 0:28
FROM, SECS, FPS = 20, 8, 24


def sh(*a, **k):
    subprocess.run(a, check=True, **k)


def slug(n):
    return n.lower().replace(' ', '-')


def render():
    """frames straight from the app's renderer (needs the vite preview on :4173)"""
    clip = f'{W}/tools/clip.mjs'
    env = lambda **k: {**os.environ, **{a: str(b) for a, b in k.items()}}
    for i, n in enumerate(LOOKS):  # one still per look, landscape
        sh('node', clip, f'{WORK}/look-{slug(n)}', '24.1', '24.1', '1', env=env(LOOK=i))
    sh('node', clip, f'{WORK}/hero', str(FROM), str(FROM + SECS), str(FPS), '0,560,1080,607.5', env=env(OUTW=1280, OUTH=720))
    sh('node', clip, f'{WORK}/hero-m', str(FROM), str(FROM + SECS), str(FPS), '0,330,1080,1350', env=env(OUTW=720, OUTH=900))
    sh('node', clip, f'{WORK}/heart', '9.5', '16.5', str(FPS), '0,180,1080,1080', env=env(SETUP='heart', OUTW=720, OUTH=720))
    # the sound demo: the phone recording, then the grand piano in a concert hall
    piano = f'{ROOT}/test/_piano_render.mjs'
    if os.path.exists(piano):
        sh('node', piano, PROJ, f'{WORK}/phone.wav', '{"source":"video","even":true}', str(FROM), str(FROM + 10), cwd=ROOT)
        sh('node', piano, PROJ, f'{WORK}/grand.wav', '{"source":"piano","pedal":"held","room":"hall","hall":0.45,"even":true}', str(FROM), str(FROM + 10), cwd=ROOT)


def save(im, path, size=None):
    im = im.convert('RGB')
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(path, quality=84, optimize=True, progressive=True)


def stacked(frames, crop, size, name, audio):
    """the take as filmed on top, the rendered frames below: one H.264 file, so the two halves never drift"""
    fr = sorted(glob.glob(f'{WORK}/{frames}/*.jpg'))
    w, h = size
    dur = len(fr) / FPS
    args = ['ffmpeg', '-v', 'error', '-y', '-ss', str(FROM), '-t', f'{dur:.3f}', '-i', SRC, '-framerate', str(FPS), '-i', f'{WORK}/{frames}/%05d.jpg']
    if audio:
        args += ['-i', audio]
    args += ['-filter_complex', f'[0:v]fps={FPS},crop={crop},scale={w}:{h}:flags=lanczos,setsar=1[a];[1:v]scale={w}:{h}:flags=lanczos,setsar=1[b];[a][b]vstack=inputs=2,format=yuv420p[v]', '-map', '[v]']
    if audio:
        args += ['-map', '2:a', '-c:a', 'aac', '-b:a', '128k', '-af', f'atrim=0:{dur:.3f},afade=t=in:d=0.08,afade=t=out:st={dur - 0.4:.3f}:d=0.4']
    args += ['-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-t', f'{dur:.3f}', f'{A}/{name}.mp4']
    sh(*args)
    first = f'{WORK}/_first.jpg'
    sh('ffmpeg', '-v', 'error', '-y', '-ss', str(FROM), '-i', SRC, '-vf', f'crop={crop},scale={w}:{h}:flags=lanczos', '-frames:v', '1', '-q:v', '2', first)
    a, b = Image.open(first), Image.open(fr[0]).resize((w, h))
    im = Image.new('RGB', (w, h * 2)); im.paste(a, (0, 0)); im.paste(b, (0, h))
    save(im, f'{A}/{name}.jpg')
    save(Image.open(fr[0]), f'{A}/{name}-after.jpg', (w, h))
    return fr


def media():
    os.makedirs(f'{A}/looks', exist_ok=True)
    os.makedirs(f'{A}/fonts', exist_ok=True)
    nm = f'{ROOT}/node_modules'
    shutil.copy(f'{nm}/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2', f'{A}/fonts/archivo.woff2')
    for wt in (400, 700):
        shutil.copy(f'{nm}/@fontsource/syncopate/files/syncopate-latin-{wt}-normal.woff2', f'{A}/fonts/syncopate-{wt}.woff2')
    for n in LOOKS:
        save(Image.open(sorted(glob.glob(f'{WORK}/look-{slug(n)}/*.jpg'))[0]), f'{A}/looks/{slug(n)}.jpg', (960, 540))
    grand = f'{WORK}/grand.wav'
    fr = stacked('hero', '1080:608:0:560', (1280, 720), 'hero', grand)
    mid = len(fr) // 2
    save(Image.open(fr[mid]), f'{A}/shot.jpg', (1280, 720))
    save(Image.open(fr[mid]), f'{A}/light-after.jpg', (1280, 720))
    sh('ffmpeg', '-v', 'error', '-y', '-ss', f'{FROM + mid / FPS:.4f}', '-i', SRC, '-vf', 'crop=1080:608:0:560,scale=1280:720:flags=lanczos', '-frames:v', '1', '-q:v', '3', f'{A}/light-before.jpg')
    stacked('hero-m', '1080:1350:0:330', (720, 900), 'hero-m', grand)
    hf = sorted(glob.glob(f'{WORK}/heart/*.jpg'))
    sh('ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', f'{WORK}/heart/%05d.jpg', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', f'{A}/heart.mp4')
    save(Image.open(hf[int(len(hf) * 0.8)]), f'{A}/heart.jpg')
    # the sound demo and its waveform
    sh('ffmpeg', '-v', 'error', '-y', '-i', f'{WORK}/phone.wav', '-i', grand, '-filter_complex',
       '[0]atrim=0:8,afade=t=out:st=7.3:d=0.7,apad=pad_dur=0.5[a];[1]atrim=0:9.5,afade=t=in:d=0.05,afade=t=out:st=8:d=1.5[b];[a][b]concat=n=2:v=0:a=1',
       '-ac', '2', '-ar', '44100', '-b:a', '160k', f'{A}/sound-demo.mp3')
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{A}/sound-demo.mp3', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768
    seg = len(x) // 160
    pk = [float(np.sqrt(np.mean(x[i * seg:(i + 1) * seg] ** 2))) for i in range(160)]
    json.dump([round(p / max(pk), 3) for p in pk], open(f'{W}/peaks.json', 'w'))
    # the notes the score bands draw (0:20 to 0:40)
    d = json.load(open(PROJ))
    notes = [[round(n['s'] - FROM, 3), round(n['e'] - FROM, 3), n['p'], round(n['v'], 2)] for n in d['notes'] if n['e'] > FROM and n['s'] < FROM + 20]
    json.dump(notes, open(f'{W}/notes.json', 'w'), separators=(',', ':'))
    for f in ('favicon.svg', 'CNAME', '404.html'):
        shutil.copy(f'{W}/static/{f}', f'{S}/{f}')
    open(f'{S}/.nojekyll', 'w').close()


def page():
    html = open(f'{W}/index.src.html').read()
    figs = '\n'.join(
        f'      <figure><img src="assets/looks/{slug(n)}.jpg" alt="The same take in the {n} look" loading="lazy" width="960" height="540">'
        f'<figcaption><b>{n}</b><span>{i + 1:02d}</span></figcaption></figure>' for i, n in enumerate(LOOKS))
    html = html.replace('%%LOOKS%%', figs).replace('%%NOTES%%', open(f'{W}/notes.json').read()).replace('%%PEAKS%%', open(f'{W}/peaks.json').read())
    assert '%%' not in html
    os.makedirs(S, exist_ok=True)
    open(f'{S}/index.html', 'w').write(html)


steps = sys.argv[1:] or ['media', 'page']
for s in steps:
    {'render': render, 'media': media, 'page': page}[s]()
