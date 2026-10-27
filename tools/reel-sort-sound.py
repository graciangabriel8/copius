#!/usr/bin/env python3
"""The sound of the "sort" reel (tools/reel-sort.html), synthesized from nothing: no
samples and no library, so it rebuilds anywhere and every sound lands on the frame that
makes it.

    python3 tools/reel-sort-sound.py <out.wav>

The times are read from the page's cues table, the one the picture plays from. The mess
hums and loses a sixth of its hum with each doubt a key pops; each letter that lands home
plucks the next note of a pentatonic scale, and the sixth pairing, which brings no letter,
only ticks; the S waits on the note under the verdict's, the count rises and stops dead,
and the word lands on the verdict's bell. Mono, 48 kHz, 16 bits, as long as the reel.
Each sound's gain is its peak; the noise is seeded, so a rebuild is the same file.

The reel is drawreel's silent render with this file laid under it by the copius-reels score
tool (levelled to -18 dBFS RMS or a -1 dBFS peak, whichever is lower; AAC, 48 kHz).
"""
import json, math, pathlib, random, re, struct, sys, wave

if len(sys.argv) != 2:
    sys.exit(__doc__)
ROOT = pathlib.Path(__file__).resolve().parent.parent
page = (ROOT / "tools" / "reel-sort.html").read_text(encoding="utf-8")
C = json.loads(re.search(r'<script type="application/json" id="cues">(.*?)</script>', page, re.S).group(1))
SR, TAU = 48000, 2 * math.pi
N = int(C["dur"] * SR)
bed, hit = [0.0] * N, [0.0] * N        # the hit is mixed apart: the bed drops out under it
rng = random.Random(2710)


def put(buf, t0, xs, gain):
    i0 = int(round(t0 * SR))
    for i, x in enumerate(xs[:max(0, N - i0)]):
        buf[i0 + i] += gain * x


def peak1(xs):
    m = max(abs(x) for x in xs) or 1.0
    return [x / m for x in xs]


def ad(t, a, d):
    """Attack over a seconds, then down to -40 dB d seconds later."""
    return t / a if t < a else math.exp(-4.6 * (t - a) / d)


sine = lambda p: math.sin(TAU * p)
tri = lambda p: 4 * abs(p % 1 - .5) - 1
square = lambda p: 1.0 if p % 1 < .5 else -1.0


def glide(f0, f1, d):
    return lambda t: f0 * (f1 / f0) ** min(1.0, t / d)


def tone(dur, freq, wave=sine, a=.002, d=None):
    """A wave at freq (Hz, or a function of t) under an attack-decay envelope."""
    f = freq if callable(freq) else (lambda t: freq)
    out, ph = [], 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        out.append(wave(ph) * ad(t, a, d or dur))
        ph += f(t) / SR
    return out


def noise(dur):
    return [rng.uniform(-1, 1) for _ in range(int(dur * SR))]


def biquad(xs, fc, kind="lp", q=.707):
    """RBJ low- or high-pass; fc may be a function of t, for a sweep."""
    out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for i, x in enumerate(xs):
        if i % 16 == 0:
            w = TAU * min(fc(i / SR) if callable(fc) else fc, SR * .45) / SR
            cw, al = math.cos(w), math.sin(w) / (2 * q)
            b0, b1 = ((1 - cw) / 2, 1 - cw) if kind == "lp" else ((1 + cw) / 2, -(1 + cw))
            b0, b1, b2, a1, a2 = b0 / (1 + al), b1 / (1 + al), b0 / (1 + al), -2 * cw / (1 + al), (1 - al) / (1 + al)
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out.append(y)
    return out


def pluck(f, dur, damp, soft=False):
    """Karplus-Strong: a burst of noise ringing in a delay one period long."""
    L = max(2, int(round(SR / f - .5)))
    buf = [rng.uniform(-1, 1) for _ in range(L)]
    if soft:                            # a warmer attack: the burst smoothed once
        buf = [(buf[k] + buf[k - 1]) / 2 for k in range(L)]
    out = []
    for i in range(int(dur * SR)):
        j = i % L
        s = buf[j]
        out.append(s * min(1.0, (dur - i / SR) / .05))     # no click where it is cut
        buf[j] = damp * .5 * (s + buf[(j + 1) % L])
    return out


def bell(fc, ratio, index, idur, d, a=.003):
    """FM: a carrier bent by a modulator whose depth dies away, as a struck bell's partials do."""
    return [math.sin(TAU * fc * t + index * max(0.0, 1 - t / idur) * math.sin(TAU * fc * ratio * t)) * ad(t, a, d)
            for t in (i / SR for i in range(int((a + d) * SR)))]


def whoosh(a, b, gain, leaving=False):
    """Air through a filter opening from 300 to 3000 Hz (closing, for a thing that leaves),
    loudest 40 % of the way."""
    d = b - a
    sweep = (lambda t: 3000 * .1 ** min(1.0, t / d)) if leaving else (lambda t: 300 * 10 ** min(1.0, t / d))
    xs = biquad(noise(d), sweep, q=1.2)
    n = len(xs)
    put(bed, a, peak1([x * (i / n / .4 if i / n < .4 else (1 - i / n) / .6) for i, x in enumerate(xs)]), gain)


def tick(t0, gain):
    put(bed, t0, peak1([x * ad(i / SR, .0005, .005) for i, x in enumerate(biquad(noise(.006), 3000))]), gain)


# The mess hums: two detuned pairs beating, dulled and trembling. Each key typed pops one
# « ? » and takes a sixth of the hum with it, over 80 ms; the last takes the rest.
keys = C["keys"]
n = int((keys[-1] + .1) * SR)
raw = []
for i in range(n):
    t = i / SR
    raw.append(tri(98 * t) + tri(104 * t) + .4 * (square(247 * t) + square(255 * t)))
raw = peak1(biquad(raw, 600))
put(bed, 0, [x * (1 - .4 * (.5 - .5 * math.cos(TAU * 5 * i / SR)))
             * .18 * (6 - sum(min(1.0, max(0.0, (i / SR - k) / .08)) for k in keys)) / 6
             for i, x in enumerate(raw)], 1)
# The three marks that pulse pluck out of tune.
for t0, f in zip(C["qPulse"], (233, 247, 311)):
    put(bed, t0, [x * ad(i / SR, .002, .4) for i, x in enumerate(pluck(f, .45, .996))], .18)


def tap(t0):
    put(bed, t0, tone(.1, glide(200, 90, .07), a=.001, d=.09), .5)
    tick(t0, .15)


# The finger comes in and taps the field; each key clicks, rises a whole tone and pops a mark.
whoosh(C["finger1"][0], C["finger1"][1], .05)
tap(C["finger1"][2])
for i, t0 in enumerate(keys):
    tick(t0, .1)
    put(bed, t0, tone(.06, 880 * 2 ** (2 * i / 12), tri, d=.06), .12)
    put(bed, t0, tone(.09, glide(900, 220, .09), a=.001, d=.09), .3)

# The strawberry flies to the head of the list and rings; the mess floats up out of the way.
whoosh(C["head"][0], C["head"][1], .2)
put(bed, C["head"][1], bell(1318.5, 2, 2, .5, .6), .25)
whoosh(C["lift"][0], C["lift"][1], .06)

# Each pairing flies into the list; the five that bring a letter pluck C D E G A as the
# letter lands, with a soft thud; the sixth brings none and only ticks, low.
for k, (a, b) in enumerate(C["chips"]):
    whoosh(a, b, .12 if k < 3 else .1)
    if k < 5:
        put(bed, b, pluck((523.25, 587.33, 659.25, 783.99, 880)[k], 1.6, .997, soft=True), .35)
        tick(b, .1)
        put(bed, b, tone(.14, glide(130, 70, .1), a=.001, d=.12), .35)
    else:
        put(bed, b, tone(.06, glide(330, 230, .06), tri, a=.001, d=.06), .15)

# The S waits on B, under the verdict's C; the button comes; the finger taps it.
for t0 in C["sPulse"]:
    put(bed, t0, bell(987.77, 2, 1.5, .3, .5), .06)
put(bed, C["button"][0] + .1, peak1(biquad(tone(.018, 900, square, a=.001, d=.03), 3000)), .12)
whoosh(C["finger2"][0], C["finger2"][1], .05)
tap(C["finger2"][2])

# The list leaves; the plate's three cards land on G A B.
whoosh(C["listOut"][0], C["listOut"][1], .1, leaving=True)
for (a, b), f in zip(C["plateIn"], (784, 880, 988)):
    put(bed, b, tone(.04, f, tri, d=.04), .12)

# The count: air and a tone rise together until the bed drops out; a tick each fourteenth of
# the way, timed on the picture's own easing (out3), so they slow as the number does.
a, b = C["count"][0], C["drop"][0]
d = b - a
air = biquad(noise(d), glide(300, 5000, d))
m = max(abs(x) for x in air)
put(bed, a, [x / m * .25 * i / len(air) for i, x in enumerate(air)], 1)
put(bed, a, [x * .2 * i / int(d * SR) for i, x in enumerate(tone(d, glide(220, 880, d), a=.01, d=1e3))], 1)
c0, c1 = C["count"]
for k in range(1, 14):
    t0 = c0 + (1 - (1 - k / 14) ** (1 / 3)) * (c1 - c0)
    put(bed, t0, tone(.02, 600 * 2 ** (1.2 * k / 13), tri, a=.001, d=.02), .12 + .14 * (k - 1) / 12)

# The word lands on the verdict: a bell on C, the chord under it, a sub that drops (pushed
# a little into saturation, so a phone speaker that cannot play 50 Hz still hears the
# thump in its harmonics) and a breath of high air.
h = C["hit"]
put(hit, h, bell(1046.5, 3.5, 4, 1.4, 1.8, a=.002), .45)
for f in (261.63, 329.63, 392.0, 523.25):
    put(hit, h, tone(1.2, f, tri, a=.005, d=1.2), .15)
put(hit, h, [math.tanh(2 * x) / math.tanh(2) for x in tone(.7, glide(55, 40, .7), a=.003, d=.7)], .45)
put(hit, h, peak1([x * ad(i / SR, .001, .45) for i, x in enumerate(biquad(noise(.5), 3000, "hp"))]), .3)

# The end: the lab leaves, the leaf blooms on a rising sweep and three notes of the chord,
# and a bare fifth holds under the address until the last frame.
whoosh(C["labOut"][0], C["labOut"][1], .05, leaving=True)
l0 = C["leaf"][0]
put(bed, l0, tone(.35, glide(400, 1500, .35), a=.01, d=.35), .18)
for i, f in enumerate((783.99, 1046.5, 1318.5)):
    put(bed, l0 + .1 * i, pluck(f, 1.5, .996, soft=True), .25)
u0 = C["url"][0]
td = C["dur"] - u0
put(bed, u0, [(math.sin(TAU * 130.81 * t) + math.sin(TAU * 196.0 * t)) / 2 * min(1.0, t / .2) * (1 - t / td)
              for t in (i / SR for i in range(int(td * SR)))], .15)


def bed_gain(t):
    """Out for the drop, 10 ms ramps either side; then ducked under the hit for 0.15 s."""
    d0, d1 = C["drop"]
    if t < d0 - .01 or t > h + .2:
        return 1.0
    if t < d0:
        return (d0 - t) / .01
    if t < d1 - .01:
        return 0.0
    if t < d1:
        return .4 * (t - (d1 - .01)) / .01
    return .4 if t < h + .15 else .4 + .6 * (t - h - .15) / .05


# The hit peaks at 0.9 whatever its layers add up to, so the bed's landings sit about 6 dB
# under it; then a gentle tanh on the whole lifts the quiet parts by some 4 dB more than
# the peaks, so a phone at half volume still hears the hum and the plucks.
hp = max(abs(y) for y in hit)
mix = [math.tanh(1.5 * (x * bed_gain(i / SR) + y * .9 / hp)) / math.tanh(1.5) for i, (x, y) in enumerate(zip(bed, hit))]
top = max(abs(x) for x in mix)
g = min(1.0, .95 / top)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % N, *(int(round(x * g * 32767)) for x in mix)))
db = lambda v: 20 * math.log10(max(v, 1e-9))
print("%s: %.1f s, peak %.1f dBFS before the %.2f gain" % (sys.argv[1], C["dur"], db(top), g))
for s in range(int(C["dur"])):
    seg = mix[s * SR:(s + 1) * SR]
    print("  %2d s  rms %6.1f dBFS  peak %6.1f dBFS" % (s, db(g * math.sqrt(sum(x * x for x in seg) / len(seg))),
                                                     db(g * max(abs(x) for x in seg))))
