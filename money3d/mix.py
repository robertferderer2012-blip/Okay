#!/usr/bin/env python3
"""Mixes the ElevenLabs voiceover with a synthesized beat + SFX, then muxes with the rendered video.

    python3 mix.py [voice.mp3]   -> money_10k_1month.mp4
"""
import subprocess, sys, wave
import numpy as np

SR = 44100
END = 58.2
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'audio/take2.mp3'
N = int(END * SR)
rng = np.random.default_rng(7)


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def lp(x, k):  # simple one-pole lowpass, k in (0,1]
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s += k * (x[i] - s); y[i] = s
    return y


def add(buf, sig, t):
    i = int(t * SR)
    j = min(len(buf), i + len(sig))
    if i < j: buf[i:j] += sig[:j - i]


voice = load(VOICE)[:N]
music = np.zeros(N, np.float32)
sfx = np.zeros(N, np.float32)

# --- beat: 100 bpm, minor pad + kick + hats
bpm = 100; beat = 60 / bpm
kick_n = int(0.45 * SR); tk = np.arange(kick_n) / SR
kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 7)
hat_n = int(0.06 * SR)
hat = rng.standard_normal(hat_n).astype(np.float32); hat = (hat - lp(hat, 0.3)) * env(hat_n, 0.001, 0.015)
t = 0.0; b = 0
while t < END - 0.5:
    if b % 4 in (0, 2) or (b % 8 == 7): add(music, 0.55 * kick, t)
    add(music, 0.10 * hat, t + beat / 2)
    if b % 2: add(music, 0.06 * hat, t + beat * 0.75)
    t += beat; b += 1
chords = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]  # Am F C G
bar = beat * 4; t = 0.0; c = 0
while t < END:
    n = int(bar * SR); tt = np.arange(n) / SR
    pad = sum(np.sin(2 * np.pi * 440 * 2 ** ((m - 69) / 12) * tt) + 0.3 * np.sin(2 * np.pi * 440 * 2 ** ((m - 57) / 12) * tt) for m in chords[c % 4])
    pad *= np.minimum(1, tt / 0.4) * np.minimum(1, (bar - tt) / 0.4) * 0.05
    add(music, pad.astype(np.float32), t)
    t += bar; c += 1

# --- SFX
def whoosh(d=0.45):
    n = int(d * SR); x = rng.standard_normal(n).astype(np.float32)
    x = lp(x, 0.12) * np.sin(np.pi * np.arange(n) / n) ** 2
    return x * 0.9

def kaching():
    n = int(1.2 * SR); tt = np.arange(n) / SR
    bell = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * dcy) for f, a, dcy in [(2093, .5, 4), (2637, .35, 5), (3136, .3, 6), (4186, .2, 8)])
    clk_n = int(0.05 * SR); clk = rng.standard_normal(clk_n) * env(clk_n, 0.0005, 0.008)
    out = np.zeros(n); out[:clk_n] += clk * 0.6
    out[int(0.06 * SR):] += bell[:n - int(0.06 * SR)]
    return (out * 0.35).astype(np.float32)

def pop():
    n = int(0.09 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * (900 - 4000 * tt) * tt) * env(n, 0.001, 0.03) * 0.25).astype(np.float32)

for ts in [5.04, 13.0, 19.97, 27.8, 39.47, 46.4, 51.72]:
    add(sfx, 0.35 * whoosh(), ts - 0.3)
for ts in [0.15, 7.96, 26.21, 44.4, 55.2]:
    add(sfx, kaching(), ts)
for ts in [16.6, 17.55, 18.55, 23.2, 35.85, 41.9, 42.11, 42.32, 42.53, 42.74, 42.95, 43.16, 43.37, 43.58, 43.79, 49.6, 50.3, 51.0]:
    add(sfx, pop(), ts)

# --- duck music under the voice
venv = np.abs(voice)
k = int(0.12 * SR)
venv = np.convolve(venv, np.ones(k) / k, mode='same')
pad_v = np.zeros(N, np.float32); pad_v[:len(venv)] = venv
duck = 1 - 0.55 * np.clip(pad_v / 0.05, 0, 1)
v = np.zeros(N, np.float32); v[:len(voice)] = voice
mix = v * 1.0 + music * 0.32 * duck + sfx * 0.6
fade = np.ones(N); fn = int(0.5 * SR); fade[-fn:] = np.linspace(1, 0, fn)
mix *= fade
mix /= max(1.0, np.abs(mix).max() / 0.95)

with wave.open('build/mix.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())

subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'build/silent.mp4', '-i', 'build/mix.wav',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
                '-shortest', '-movflags', '+faststart', 'money_10k_1month.mp4'], check=True)
print('wrote money_10k_1month.mp4')
