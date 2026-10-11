"""Original synthesized soundtrack, hit points synced to the video timeline in src/main.js."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, sys

SR = 48000
DUR = 90.0
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(7)

CUTS = [0, 6.5, 13.5, 21.5, 31, 39.5, 48, 56.5, 63.5, 71, 78, 84.5, 90]
IMPACTS = [(2.35, 1.0), (16.12, 1.25), (36.0, 0.7), (74.9, 1.0), (85.9, 1.1)]
GLITCH = [63.5, 64.9, 65.3, 65.7, 66.1, 67.9]
BPM = 100
BEAT = 60 / BPM

def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)

def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)

NOTE = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'Ab': -1, 'A': 0, 'A#': 1, 'Bb': 1, 'B': 2}
def hz(n):
    name, octv = n[:-1], int(n[-1])
    return 440.0 * 2 ** ((NOTE[name] + (octv - 4) * 12) / 12)

def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e

def place(buf, sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain

# ---------------------------------------------------------------- pad (per-scene chords)
CHORDS = [
    ['D2', 'A2', 'D3', 'E3', 'A3'],          # intro  Dm(add9)
    ['D2', 'A2', 'D3', 'F3', 'A3'],          # problem Dm
    ['Bb1', 'F2', 'D3', 'F3', 'A3'],         # golem Bbmaj7
    ['F2', 'C3', 'F3', 'A3', 'C4'],          # what is TEE: F
    ['C2', 'G2', 'E3', 'G3', 'D4'],          # 01: Cadd9
    ['D2', 'A2', 'D3', 'F3', 'C4'],          # 02: Dm7
    ['Bb1', 'F2', 'D3', 'F3', 'C4'],         # 03: Bbadd9
    ['F2', 'C3', 'F3', 'A3', 'E4'],          # 04: Fmaj7
    ['G1', 'D2', 'Bb2', 'C#3', 'G3'],        # caveat: tense
    ['Bb1', 'F2', 'D3', 'F3', 'C4'],         # bigger picture
    ['D2', 'A2', 'D3', 'F3', 'A3', 'E4'],    # outro Dm9
    ['D2', 'A2', 'D3', 'F3', 'A3', 'E4'],    # end card
]
pad = np.zeros((2, N))
for si, chord in enumerate(CHORDS):
    a, b = CUTS[si] - 0.4, CUTS[si + 1] + 0.8
    a = max(0, a)
    b = min(DUR, b)
    n = int((b - a) * SR)
    tt = np.arange(n) / SR
    for ch in range(2):
        sig = np.zeros(n)
        for k, note in enumerate(chord):
            f = hz(note)
            for det in (-0.08, 0.0, 0.08):
                fd = f * 2 ** ((det + (0.03 if ch else -0.03)) / 12)
                ph = rng.random()
                sig += (2 * ((fd * tt + ph) % 1) - 1) * (0.5 if k == 0 else 0.33)
        # slow filter "breathing"
        sig = lp(sig, 900 + 300 * (si in (4, 5, 6, 7)), 2)
        sig *= env_adsr(n, 0.6, 1.0)
        place(pad[ch], sig, a, 0.05)
# gentle amplitude LFO
pad *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t_all)

# ---------------------------------------------------------------- sub drone
sub = 0.18 * np.sin(2 * np.pi * hz('D1') * t_all) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t_all))
sub *= np.clip((t_all - 0.2) / 3, 0, 1) * np.clip((DUR - t_all) / 3, 0, 1)

# ---------------------------------------------------------------- arp pluck (16ths)
arp = np.zeros((2, N))
step = BEAT / 4
pluck_len = int(0.35 * SR)
tp = np.arange(pluck_len) / SR
def arp_level(t):
    if t < CUTS[1] or t >= CUTS[11]:
        return 0.0
    if CUTS[8] <= t < CUTS[9]:
        return 0.35
    if CUTS[1] <= t < CUTS[2]:
        return 0.6
    return 1.0
i = 0
tt0 = CUTS[1]
while tt0 < CUTS[11]:
    si = max(k for k in range(len(CUTS) - 1) if tt0 >= CUTS[k])
    chord = CHORDS[si]
    pattern = [2, 3, 4, 3, 2, 4, 3, 4]
    note = chord[min(len(chord) - 1, pattern[i % 8])]
    f = hz(note) * 2
    accent = 1.0 if i % 4 == 0 else 0.6
    sig = (np.sin(2 * np.pi * f * tp) + 0.3 * np.sin(2 * np.pi * 2 * f * tp) + 0.12 * np.sin(2 * np.pi * 3 * f * tp)) * np.exp(-tp / 0.07)
    lvl = arp_level(tt0) * accent
    pan = 0.5 + 0.35 * np.sin(i * 0.9)
    place(arp[0], sig, tt0, 0.05 * lvl * (1 - pan) * 2)
    place(arp[1], sig, tt0, 0.05 * lvl * pan * 2)
    tt0 += step
    i += 1
arp = np.stack([lp(arp[0], 3200), lp(arp[1], 3200)])

# ---------------------------------------------------------------- kick pulse
kick = np.zeros(N)
kl = int(0.45 * SR)
tk = np.arange(kl) / SR
freq = 45 + 85 * np.exp(-tk / 0.035)
kphase = 2 * np.pi * np.cumsum(freq) / SR
ksig = np.sin(kphase) * np.exp(-tk / 0.16)
ksig[:200] += rng.standard_normal(200) * 0.25 * np.linspace(1, 0, 200)
tb = CUTS[2] + 2.62  # pulse starts after the golem lands
while tb < CUTS[10]:
    in_caveat = CUTS[8] <= tb < CUTS[9]
    beat_idx = round((tb - (CUTS[2] + 2.62)) / BEAT)
    if not in_caveat or beat_idx % 2 == 0:
        place(kick, ksig, tb, 0.42 if beat_idx % 4 == 0 else 0.3)
    tb += BEAT
# soft hats on off-beats
hats = np.zeros(N)
hl = int(0.06 * SR)
hsig = hp(rng.standard_normal(hl), 7000, 2) * np.exp(-np.arange(hl) / SR / 0.012)
tb = CUTS[2] + 2.62 + BEAT / 2
while tb < CUTS[10]:
    if not (CUTS[8] <= tb < CUTS[9]):
        place(hats, hsig, tb, 0.07)
    tb += BEAT

# ---------------------------------------------------------------- transitions: riser whoosh + boom at each cut
fx = np.zeros((2, N))
for c in CUTS[1:-1]:
    L = int(0.9 * SR)
    noise = rng.standard_normal(L)
    sweep = np.linspace(0, 1, L) ** 2.2
    # time-varying bandpass approximated by crossfading two filtered copies
    lo = bp(noise, 300, 1500)
    hi_ = bp(noise, 1500, 9000)
    wh = (lo * (1 - sweep) + hi_ * sweep) * sweep * 0.22
    for ch in range(2):
        place(fx[ch], wh * (0.8 + 0.2 * ch), c - 0.9)
    bl = int(1.4 * SR)
    tbm = np.arange(bl) / SR
    bf = 38 + 60 * np.exp(-tbm / 0.06)
    boom = np.sin(2 * np.pi * np.cumsum(bf) / SR) * np.exp(-tbm / 0.5) * 0.5
    for ch in range(2):
        place(fx[ch], boom, c)

# impacts: deep boom + metallic shimmer
for (ti, g) in IMPACTS:
    bl = int(2.5 * SR)
    tbm = np.arange(bl) / SR
    bf = 32 + 90 * np.exp(-tbm / 0.05)
    boom = np.sin(2 * np.pi * np.cumsum(bf) / SR) * np.exp(-tbm / 0.8)
    crack = lp(rng.standard_normal(bl), 2500) * np.exp(-tbm / 0.09) * 0.8
    shimmer = np.zeros(bl)
    for k, f in enumerate([hz('D5'), hz('A5'), hz('E6'), hz('F6') * 1.003, hz('A6')]):
        shimmer += np.sin(2 * np.pi * f * tbm + k) * np.exp(-tbm / (1.2 - k * 0.15)) * 0.12
    for ch in range(2):
        place(fx[ch], (boom * 0.75 + crack * 0.35 + shimmer * (0.9 if ch else 1.1)) * g, ti)
    # pre-impact reverse swell
    L = int(0.8 * SR)
    sw = bp(rng.standard_normal(L), 600, 6000) * np.linspace(0, 1, L) ** 3 * 0.25 * g
    for ch in range(2):
        place(fx[ch], sw, ti - 0.8)

# glitch bursts in the "limitations" scene
for gt in GLITCH:
    L = int(0.26 * SR)
    x = rng.standard_normal(L)
    # sample-and-hold bitcrush
    hold = 37
    x = np.repeat(x[::hold], hold)[:L]
    x = np.round(x * 3) / 3
    tone = np.sign(np.sin(2 * np.pi * 180 * np.arange(L) / SR)) * 0.4
    sig = (bp(x, 800, 6000) * 0.5 + tone * 0.25) * np.exp(-np.arange(L) / SR / 0.12)
    gate = (np.sin(2 * np.pi * 31 * np.arange(L) / SR) > -0.2).astype(float)
    for ch in range(2):
        place(fx[ch], sig * gate * 0.35, gt + 0.004 * ch)

# digital ticks when packets/labels scramble (light texture)
for tt in np.arange(32.7, 33.5, 0.045).tolist() + np.arange(44.0, 44.9, 0.05).tolist():
    L = int(0.02 * SR)
    s = np.sin(2 * np.pi * (2400 + 800 * rng.random()) * np.arange(L) / SR) * np.exp(-np.arange(L) / SR / 0.004)
    for ch in range(2):
        place(fx[ch], s, tt, 0.06)

# ---------------------------------------------------------------- reverb + mix
def reverb(x, secs=2.6, mix=0.3, seed=1):
    r = np.random.default_rng(seed)
    L = int(secs * SR)
    ir = r.standard_normal(L) * np.exp(-np.arange(L) / SR / (secs / 5))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix

mix = np.zeros((2, N))
for ch in range(2):
    music = pad[ch] + arp[ch]
    music = reverb(music, 3.2, 0.35, seed=ch + 1)
    effects = reverb(fx[ch], 2.2, 0.25, seed=ch + 5)
    mix[ch] = music + effects + sub + kick * 0.9 + hats
# sidechain-ish duck of pad under kicks
mix *= 1.0
# fade in/out
fade = np.clip(t_all / 0.8, 0, 1) * np.clip((DUR - 0.05 - t_all) / 2.5, 0, 1)
mix *= fade
mix = hp(mix, 25, 2)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix /= np.max(np.abs(mix)) / 0.89
out = (mix.T * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'work/soundtrack.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(out.tobytes())
print('ok', out.shape)
