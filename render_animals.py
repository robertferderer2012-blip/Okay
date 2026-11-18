#!/usr/bin/env python3
"""
What if all animals disappeared?
Procedurally rendered 1080x1920 (9:16) / 30fps "what if" timeline short with
synthesized sound design: one fixed landscape, a 'time without animals' counter,
captions and big time-jumps while the world slowly changes.

    python3 render_animals.py               -> what_if_all_animals_disappeared.mp4
    python3 render_animals.py --frame 30.5  -> single preview frame (png)
    python3 render_animals.py --sheet       -> contact sheet of the timeline (png)
"""
import math, os, sys, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
S = 2                      # supersampling for the static scene states
FPS = 30
DUR = 72.0
NF = int(FPS * DUR)
SR = 44100
OUT = "what_if_all_animals_disappeared.mp4"

HOR = 560                  # foot of the mountains
VPY = 470                  # perspective vanishing line
VPX = 540
SHORE_FAR = 770
SHORE_NEAR = 965
T_V = 3.4                  # the moment every animal vanishes

# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)

def ramp(t, a, b):
    return smooth((t - a) / (b - a))

def lerp(a, b, t):
    return a + (b - a) * t

def lerp2(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

def mixc(c1, c2, k):
    return tuple(int(round(a + (b - a) * k)) for a, b in zip(c1[:3], c2[:3]))

def shade(c, f):
    return tuple(int(clamp(v * f, 0, 255)) for v in c[:3])

def rgba(c, a):
    return tuple(int(v) for v in c[:3]) + (int(clamp(a, 0, 255)),)

def sc(y):
    """perspective scale of an object standing on the ground at screen-y"""
    return max(0.04, (y - VPY) / (H - VPY))

def hz(p, c, y, extra=0.0):
    a = p["hz"] * clamp((1300 - y) / (1300 - 380)) ** 1.7 + extra
    return mixc(c, p["haze"], clamp(a))


class Cv:
    """drawing surface in 1x world coords, internally k-times supersampled"""
    def __init__(self, k=S, size=(W, H), off=(0, 0), mode="RGB"):
        self.k = k
        self.ox, self.oy = off
        self.img = Image.new(mode, (int(size[0] * k), int(size[1] * k)), (0, 0, 0) if mode == "RGB" else (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def P(self, pts):
        k, ox, oy = self.k, self.ox, self.oy
        return [((x - ox) * k, (y - oy) * k) for x, y in pts]

    def poly(self, pts, c):
        self.d.polygon(self.P(pts), fill=c)

    def ell(self, cx, cy, rx, ry, c):
        k = self.k
        if rx * k < 0.35 or ry * k < 0.35:
            return
        cx -= self.ox; cy -= self.oy
        self.d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=c)

    def ring(self, cx, cy, r, c, w):
        k = self.k
        if r * k < 1:
            return
        cx -= self.ox; cy -= self.oy
        self.d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], outline=c, width=max(1, int(w * k)))

    def pie(self, cx, cy, rx, ry, a0, a1, c):
        k = self.k
        if rx * k < 0.5 or ry * k < 0.5:
            return
        cx -= self.ox; cy -= self.oy
        self.d.pieslice([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], a0, a1, fill=c)

    def line(self, pts, c, w):
        self.d.line(self.P(pts), fill=c, width=max(1, int(round(w * self.k))), joint="curve")

    def rect(self, x0, y0, x1, y1, c):
        k = self.k
        x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1))
        self.d.rectangle([(x0 - self.ox) * k, (y0 - self.oy) * k, (x1 - self.ox) * k, (y1 - self.oy) * k], fill=c)

    def down(self):
        """premultiplied box-downsample of an RGBA canvas back to 1x"""
        return self.img.convert("RGBa").reduce(self.k).convert("RGBA")

# ----------------------------------------------------------------------------
# world layout (deterministic, shared by all states so dissolves line up)
# ----------------------------------------------------------------------------
def _road_lut():
    P0, P1, P2 = (640, SHORE_NEAR), (560, 1420), (820, 1935)
    ts = np.linspace(0, 1, 600)
    xs = (1 - ts) ** 2 * P0[0] + 2 * (1 - ts) * ts * P1[0] + ts ** 2 * P2[0]
    ys = (1 - ts) ** 2 * P0[1] + 2 * (1 - ts) * ts * P1[1] + ts ** 2 * P2[1]
    return xs, ys

RX, RY = _road_lut()

def road_x(y):
    return float(np.interp(y, RY, RX))

def road_w(y):
    return 230 * sc(y)

def on_road(x, y, pad=4):
    return y >= SHORE_NEAR - 2 and abs(x - road_x(y)) < road_w(y) / 2 + pad

FIELD_Y0, FIELD_Y1 = 1135, 1300
def field_px(xf, y):
    return VPX + (xf - VPX) * sc(y) / sc(FIELD_Y1)

def in_field(x, y):
    return FIELD_Y0 < y < FIELD_Y1 and x < field_px(470, y)

PAST_Y0, PAST_Y1 = 1015, 1290
def past_left(y):
    return 700 + 80 * (y - PAST_Y0) / (PAST_Y1 - PAST_Y0)

def in_pasture(x, y):
    return PAST_Y0 < y < PAST_Y1 and x > past_left(y)

BARN = (300, 1110)
SILO = (128, 1098)
FARMHOUSE = (468, 1062)
HIVES = [(800, 1428), (862, 1444), (926, 1430)]
WINDMILL = (150, 662)
CHURCH = (735, 712)
HOUSES = [(64, 702, 1.0), (168, 728, 0.9), (262, 694, 1.0), (346, 742, 1.1), (440, 708, 0.9),
          (528, 738, 1.0), (812, 742, 1.0), (890, 708, 0.95), (968, 736, 1.05), (1046, 702, 0.9),
          (600, 698, 0.8), (470, 668, 0.7), (318, 664, 0.7), (930, 668, 0.75), (1010, 672, 0.7)]
ROOFS = [(178, 72, 52), (196, 98, 60), (150, 62, 50), (120, 84, 78), (184, 84, 46)]
WALLS = [(236, 226, 206), (226, 214, 190), (240, 236, 226), (214, 200, 176)]

BR_NL, BR_NR = (601, SHORE_NEAR), (679, SHORE_NEAR)
BR_FL, BR_FR = (656, SHORE_FAR), (704, SHORE_FAR)


def build_world():
    r = np.random.default_rng(2024)
    W_ = {}
    trees = []
    # far forest on the hills
    for i in range(95):
        x = r.uniform(-20, 1100)
        y = r.uniform(636, 712)
        kind = "pine" if r.random() < 0.55 else "decid"
        trees.append(dict(x=x, y=y, kind=kind, size=r.uniform(1.3, 1.9), r=r.random(), seed=int(r.integers(1e9)), fruit=False))
    # far bank trees
    for i in range(16):
        x = r.uniform(-10, 1090)
        if 600 < x < 760:
            continue
        trees.append(dict(x=x, y=r.uniform(720, 766), kind="decid", size=r.uniform(1.0, 1.4), r=r.random(), seed=int(r.integers(1e9)), fruit=False))
    # near shore / meadow trees
    for (x, y, s) in [(64, 1004, 1.05), (392, 990, 0.85), (1012, 1000, 1.1), (1010, 1395, 1.15), (742, 1532, 0.9)]:
        trees.append(dict(x=x, y=y, kind="decid", size=s, r=r.random(), seed=int(r.integers(1e9)), fruit=False))
    # orchard
    for row, y in enumerate((1382, 1504, 1646)):
        for j, x in enumerate((62, 196, 330, 462)):
            trees.append(dict(x=x + r.uniform(-12, 12) + (row % 2) * 18, y=y + r.uniform(-8, 8), kind="decid", size=1.0,
                              r=r.random(), seed=int(r.integers(1e9)), fruit=True))
    # big framing trees in the foreground
    trees.append(dict(x=20, y=1968, kind="decid", size=2.25, r=0.9, seed=11, fruit=False))
    trees.append(dict(x=1072, y=1950, kind="decid", size=2.0, r=0.93, seed=17, fruit=False))
    W_["trees"] = trees
    # pines that grow in later epochs
    newp = []
    for i in range(80):
        if r.random() < 0.18:
            x, y = r.uniform(-20, 1100), r.uniform(705, 766)
        else:
            x, y = r.uniform(-30, 1110), r.uniform(1000, 1900)
        newp.append(dict(x=x, y=y, size=r.uniform(0.75, 1.35), r=r.random(), seed=int(r.integers(1e9))))
    W_["newpines"] = newp
    W_["ferns"] = [dict(x=r.uniform(-20, 1100), y=r.uniform(990, 1920), size=r.uniform(0.7, 1.4), r=r.random(), seed=int(r.integers(1e9))) for _ in range(110)]
    W_["rocks"] = [dict(x=r.uniform(-20, 1100), y=r.uniform(985, 1920), size=r.uniform(0.6, 1.6), r=r.random(), seed=int(r.integers(1e9))) for _ in range(70)]
    # flowers
    fl = []
    cols = [(226, 52, 48), (250, 212, 64), (176, 96, 206), (250, 250, 244), (86, 128, 236), (250, 146, 46)]
    for i in range(1700):
        y = 1000 + 920 * r.random() ** 0.7
        x = r.uniform(-10, 1090)
        fl.append((x, y, cols[int(r.integers(len(cols)))], r.random()))
    W_["flowers"] = fl
    W_["far_flowers"] = [(r.uniform(0, 1080), r.uniform(712, 768), cols[int(r.integers(len(cols)))], r.random()) for _ in range(260)]
    # grass tufts
    W_["tufts"] = [(r.uniform(-10, 1090), SHORE_NEAR + 960 * r.random() ** 0.85, r.random(), r.random()) for _ in range(9000)]
    W_["far_tufts"] = [(r.uniform(-10, 1090), r.uniform(700, 768), r.random(), r.random()) for _ in range(1200)]
    # leaf litter: half scattered, half under trees
    lit = []
    for i in range(1300):
        lit.append((r.uniform(-10, 1090), r.uniform(SHORE_NEAR, 1930), r.random(), int(r.integers(3)), r.uniform(0, 3.14)))
    for tr in trees:
        if tr["y"] < 980:
            continue
        R0 = 70 * sc(tr["y"]) * tr["size"]
        for k in range(40):
            lit.append((tr["x"] + r.normal(0, R0 * 0.9), tr["y"] + r.normal(0, R0 * 0.25), r.random(), int(r.integers(3)), r.uniform(0, 3.14)))
    W_["litter"] = lit
    W_["patches"] = [(r.uniform(-50, 1130), r.uniform(SHORE_NEAR, 1930), r.uniform(60, 180), r.random(), r.random()) for _ in range(140)]
    W_["char"] = [(r.uniform(-50, 1130), r.uniform(SHORE_NEAR, 1930), r.uniform(30, 120), r.random()) for _ in range(220)]
    W_["moss"] = [(r.uniform(-50, 1130), r.uniform(SHORE_NEAR - 10, 1930), r.uniform(30, 110), r.random()) for _ in range(260)]
    W_["reeds"] = [(r.uniform(-10, 1090), r.uniform(SHORE_NEAR - 4, SHORE_NEAR + 14), r.random()) for _ in range(46)]
    # fence posts
    posts = []
    def edge(p0, p1, n, tag):
        for i in range(n + 1):
            u = i / n
            posts.append(dict(x=lerp(p0[0], p1[0], u), y=lerp(p0[1], p1[1], u), edge=tag, i=i, r=r.random(), r2=r.random()))
    edge((700, PAST_Y0), (1110, PAST_Y0), 12, "b")
    edge((700, PAST_Y0), (780, PAST_Y1), 7, "l")
    edge((780, PAST_Y1), (1110, PAST_Y1), 6, "f")
    W_["posts"] = posts
    return W_

WORLD = build_world()

# ----------------------------------------------------------------------------
# epochs ("states") of the landscape
# ----------------------------------------------------------------------------
BASE = dict(
    sky_top=(76, 138, 208), sky_bot=(198, 224, 242), haze=(206, 224, 238), hz=0.55,
    sun=(190, 240), sun_col=(255, 246, 222), sun_a=0.45,
    mtn=(120, 148, 188), mtn_amp=1.0, mtn_seed=3, snow=1.0, hill=(86, 136, 84),
    grass=(96, 166, 62), grass_dark=(70, 134, 50), tuft=(62, 132, 44), tuft2=(134, 192, 80), tall=0.0,
    flowers=1.0, fruit=1.0, leaf=(62, 140, 52), leaf_hi=(126, 190, 80), leaf_dk=(36, 92, 38), foliage=1.0,
    pine=(36, 92, 58), pine_hi=(72, 132, 82),
    gone_d=0.0, dead_d=0.0, gone_p=0.0, dead_p=0.0, newpines=0.0, burn=0.0,
    litter=0.0, litter_col=((168, 108, 46), (190, 136, 62), (132, 86, 40)),
    field="crops", pasture=0.0, village=0, farm=0, bridge=0, fence=1.0, road=1.0,
    water=(56, 116, 170), water_far=(156, 196, 224), sea=0, moss=0.0, ferns=0.0, rocks=0.0, dust=0.0,
    dirt=(178, 150, 108),
)

def mk(**kw):
    d = dict(BASE)
    d.update(kw)
    return d

STATES = {
    "lush": mk(),
    "y1": mk(fruit=0.0, flowers=0.28, field="wheat", pasture=0.45, grass=(104, 166, 60)),
    "y10": mk(fruit=0.0, flowers=0.05, field="wheat", pasture=1.0, grass=(130, 158, 66), grass_dark=(98, 122, 50),
              tuft=(108, 128, 50), tuft2=(172, 172, 86), leaf=(96, 130, 48), leaf_hi=(156, 168, 76), leaf_dk=(64, 86, 36),
              foliage=0.72, dead_d=0.15, litter=0.75, fence=0.75, village=1, farm=1, dirt=(170, 146, 106)),
    "y100": mk(sky_top=(148, 108, 84), sky_bot=(230, 168, 112), haze=(222, 166, 118), hz=0.72,
               sun_col=(255, 196, 136), sun_a=0.35, mtn=(150, 118, 104), hill=(96, 80, 62), snow=0.35,
               grass=(106, 94, 66), grass_dark=(72, 62, 46), tuft=(86, 74, 50), tuft2=(132, 112, 70),
               flowers=0.0, fruit=0.0, foliage=0.22, leaf=(86, 92, 46), leaf_hi=(124, 118, 60), leaf_dk=(52, 54, 30),
               pine=(46, 58, 40), pine_hi=(68, 78, 52),
               gone_d=0.1, dead_d=0.8, gone_p=0.05, dead_p=0.7, burn=1.0, litter=0.55,
               litter_col=((92, 88, 84), (58, 54, 50), (122, 114, 106)), field="burnt", pasture=0.6,
               village=1, farm=2, fence=0.35, water=(76, 96, 108), water_far=(176, 152, 132), dirt=(120, 104, 84)),
    "y1000": mk(sky_top=(148, 168, 190), sky_bot=(228, 216, 196), haze=(228, 216, 198), hz=0.72, sun_a=0.4,
                mtn=(150, 150, 160), hill=(150, 136, 100), snow=0.6,
                grass=(180, 162, 110), grass_dark=(152, 134, 88), tuft=(150, 140, 82), tuft2=(118, 130, 64),
                flowers=0.0, fruit=0.0, foliage=0.0, gone_d=0.55, dead_d=1.0, gone_p=0.4, dead_p=0.55, newpines=0.25,
                field="none", pasture=0.0, village=3, farm=3, bridge=1, fence=0.0, road=0.22,
                rocks=0.45, dust=1.0, water=(96, 126, 146), water_far=(200, 202, 200), dirt=(196, 176, 130)),
    "y100k": mk(sky_top=(94, 148, 206), sky_bot=(206, 224, 236), hz=0.6, mtn=(128, 146, 182), snow=1.25,
                hill=(92, 126, 90), grass=(128, 160, 82), grass_dark=(96, 126, 60), tuft=(106, 140, 62), tuft2=(176, 190, 106),
                tall=1.0, flowers=0.0, fruit=0.0, gone_d=1.0, newpines=0.85, field="none",
                village=4, farm=4, bridge=2, fence=0.0, road=0.0, rocks=0.55),
    "y10m": mk(sky_top=(82, 144, 212), mtn_amp=0.72, snow=0.45, hill=(64, 124, 76),
               grass=(68, 140, 70), grass_dark=(44, 106, 52), tuft=(48, 118, 56), tuft2=(112, 172, 92), tall=0.4,
               flowers=0.0, fruit=0.0, gone_d=1.0, newpines=1.0, field="none", village=5, farm=5, bridge=3,
               fence=0.0, road=0.0, moss=1.0, ferns=1.0, rocks=0.75, water=(54, 116, 150)),
    "y500m": mk(sky_top=(64, 86, 150), sky_bot=(252, 194, 148), haze=(248, 204, 168), hz=0.5,
                sun=(760, 600), sun_col=(255, 228, 176), sun_a=0.95, mtn_amp=0.0,
                grass=(120, 108, 98), grass_dark=(90, 82, 76), tuft=(86, 130, 74), tuft2=(132, 172, 100),
                flowers=0.0, fruit=0.0, gone_d=1.0, gone_p=1.0, field="none", village=5, farm=5, bridge=4,
                fence=0.0, road=0.0, moss=0.75, ferns=0.8, rocks=1.0, sea=1, water=(36, 98, 126), water_far=(238, 186, 156)),
}

# ----------------------------------------------------------------------------
# static scene drawing
# ----------------------------------------------------------------------------
def draw_sky(p, k):
    h, w = H * k, W * k
    y = np.arange(h, dtype=np.float32)[:, None] / k
    u = np.clip(y / (HOR + 60), 0, 1) ** 1.25
    top = np.array(p["sky_top"], np.float32)
    bot = np.array(p["sky_bot"], np.float32)
    img = top * (1 - u[..., None]) + bot * u[..., None]
    img = np.broadcast_to(img, (h, w, 3)).copy()
    xx = np.arange(w, dtype=np.float32)[None, :] / k
    sx, sy = p["sun"]
    d = np.hypot(xx - sx, y - sy)
    g = (np.exp(-(d / 90) ** 2) * 0.9 + np.exp(-(d / 420) ** 2) * 0.35) * p["sun_a"]
    img += (np.array(p["sun_col"], np.float32) - img) * np.clip(g, 0, 1)[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def ridge(seed, x0, x1, n, base, hmin, hmax, vmin, vmax, amp):
    r = np.random.default_rng(seed)
    pts = []
    xs = np.linspace(x0, x1, 2 * n + 1)
    for i, x in enumerate(xs):
        x += r.uniform(-0.25, 0.25) * (x1 - x0) / (2 * n)
        if i % 2 == 1:
            y = base - r.uniform(hmin, hmax) * amp
        else:
            y = base - r.uniform(vmin, vmax) * amp
        pts.append((x, y))
    return pts


def draw_range(cv, p, pts, base, col, haze_extra, snow_line=None, snow=0.0):
    lit = hz(p, shade(col, 1.1), HOR - 100, haze_extra)
    dark = hz(p, shade(col, 0.74), HOR - 100, haze_extra)
    for i in range(1, len(pts) - 1, 2):
        vl, pk, vr = pts[i - 1], pts[i], pts[i + 1]
        mx = pk[0] + 0.3 * (vr[0] - pk[0])
        cv.poly([vl, pk, (mx, base), (vl[0], base)], lit)
        cv.poly([pk, vr, (vr[0], base), (mx, base)], dark)
        if snow_line is not None and pk[1] < snow_line and snow > 0:
            f = clamp((snow_line - pk[1]) / 150 * snow, 0, 0.55)
            a = lerp2(pk, vl, f)
            b = lerp2(pk, vr, f * 0.9)
            m = lerp2(pk, (mx, base), f * 1.2)
            j1 = lerp2(a, m, 0.5); j1 = (j1[0], j1[1] - 10 * f)
            j2 = lerp2(m, b, 0.5); j2 = (j2[0], j2[1] - 14 * f)
            cv.poly([pk, a, j1, m], hz(p, (246, 248, 252), HOR - 100, haze_extra * 0.6))
            cv.poly([pk, m, j2, b], hz(p, (196, 210, 230), HOR - 100, haze_extra * 0.6))


def band_fill(cv, p, y0, y1, c_top, c_bot, n=40, haze=True):
    for i in range(n):
        a = y0 + (y1 - y0) * i / n
        b = y0 + (y1 - y0) * (i + 1) / n + 1
        c = mixc(c_top, c_bot, i / max(1, n - 1))
        if haze:
            c = hz(p, c, a)
        cv.rect(-5, a, W + 5, b, c)


def draw_decid(cv, p, tr, mode):
    x, y, size = tr["x"], tr["y"], tr["size"]
    s = sc(y) * size
    R = 70 * s
    r = np.random.default_rng(tr["seed"])
    near = y > 900
    burn = p["burn"] > 0.4
    if near:
        cv.ell(x + R * 0.75, y + R * 0.06, R * 1.15, R * 0.24, (0, 0, 0, int(70 * (1 - 0.5 * (mode != "alive")))))
    if mode == "snag":
        tc = hz(p, (40, 34, 30) if burn else (122, 112, 100), y)
        cv.poly([(x - 0.1 * R, y), (x + 0.1 * R, y), (x + 0.04 * R, y - 2.0 * R), (x - 0.04 * R, y - 2.0 * R)], tc)
        for b in range(5):
            hy = y - R * r.uniform(0.9, 1.8)
            ang = r.uniform(0.35, 1.0) * (1 if b % 2 else -1)
            L = R * r.uniform(0.45, 0.9)
            ex, ey = x + math.sin(ang) * L, hy - math.cos(ang) * L
            cv.line([(x, hy), (ex, ey)], tc, max(0.6, 0.06 * R))
            cv.line([(lerp(x, ex, 0.6), lerp(hy, ey, 0.6)), (ex + math.sin(ang * 1.8) * L * 0.4, ey - L * 0.35)], tc, max(0.5, 0.035 * R))
        return
    trunk = hz(p, (96, 68, 48), y)
    cv.poly([(x - 0.12 * R, y), (x + 0.12 * R, y), (x + 0.06 * R, y - 1.55 * R), (x - 0.06 * R, y - 1.55 * R)], trunk)
    cx, cy = x, y - 1.8 * R
    blobs = []
    for i in range(8):
        blobs.append((r.uniform(-0.55, 0.55) * R, r.uniform(-0.5, 0.32) * R, r.uniform(0.42, 0.66) * R))
    blobs.sort(key=lambda b: b[1])
    fol = p["foliage"]
    if fol < 0.95:
        bc = trunk
        for b in range(5):
            ang = r.uniform(-1.0, 1.0)
            L = R * r.uniform(0.6, 1.0)
            cv.line([(x, y - 1.3 * R), (x + math.sin(ang) * L, y - 1.3 * R - math.cos(ang) * L)], bc, max(0.6, 0.05 * R))
    dk, md, hi = hz(p, p["leaf_dk"], y), hz(p, p["leaf"], y), hz(p, p["leaf_hi"], y)
    order = r.permutation(len(blobs))
    for idx, (dx, dy, br) in enumerate(blobs):
        if order[idx] / len(blobs) >= fol:
            continue
        bx, by = cx + dx, cy + dy
        cv.ell(bx, by, br, br, dk)
        cv.ell(bx - 0.13 * br, by - 0.14 * br, br * 0.8, br * 0.8, md)
        cv.ell(bx - 0.32 * br, by - 0.34 * br, br * 0.42, br * 0.42, hi)
    if tr["fruit"] and p["fruit"] > 0 and fol > 0.5:
        for k in range(14):
            fx = cx + r.uniform(-0.75, 0.75) * R
            fy = cy + r.uniform(-0.55, 0.45) * R
            fr = 0.075 * R
            cv.ell(fx, fy, fr, fr, hz(p, (196, 30, 32), y))
            cv.ell(fx - fr * 0.3, fy - fr * 0.3, fr * 0.4, fr * 0.4, hz(p, (250, 120, 110), y))


def draw_pine(cv, p, x, y, size, seed, mode):
    s = sc(y) * size
    Hh = 175 * s
    w = 58 * s
    burn = p["burn"] > 0.4
    if y > 900:
        cv.ell(x + w * 0.9, y + w * 0.06, w * 1.3, w * 0.22, (0, 0, 0, 60))
    if mode == "snag":
        tc = hz(p, (38, 32, 28) if burn else (120, 110, 100), y)
        cv.poly([(x - 0.07 * w, y), (x + 0.07 * w, y), (x, y - Hh * 0.95)], tc)
        for i in range(6):
            hy = y - Hh * (0.3 + 0.1 * i)
            L = w * (0.55 - 0.07 * i)
            cv.line([(x, hy), (x - L, hy + L * 0.25)], tc, max(0.5, 0.04 * w))
            cv.line([(x, hy - Hh * 0.04), (x + L, hy + L * 0.2 - Hh * 0.04)], tc, max(0.5, 0.04 * w))
        return
    cv.rect(x - 0.08 * w, y - Hh * 0.12, x + 0.08 * w, y, hz(p, (86, 60, 44), y))
    lit, dark = hz(p, p["pine_hi"], y), hz(p, p["pine"], y)
    for apex, base, hw in ((0.55, 0.06, 1.0), (0.78, 0.3, 0.78), (1.0, 0.54, 0.55)):
        ay, byy = y - Hh * apex, y - Hh * base
        cv.poly([(x, ay), (x - hw * w, byy), (x + 0.12 * hw * w, byy + 0.05 * w)], lit)
        cv.poly([(x, ay), (x + 0.12 * hw * w, byy + 0.05 * w), (x + hw * w, byy)], dark)


def draw_house(cv, p, x, y, wscale, wall, roof, level, seed, kind="house", windows=None):
    if level >= 5:
        return
    s = sc(y) * wscale
    r = np.random.default_rng(seed)
    w = (230 if kind == "barn" else 150) * s
    h = (128 if kind == "barn" else 88) * s
    g = 0.36 * w
    dx, dy = (60 if kind == "barn" else 46) * s * 0.6, (60 if kind == "barn" else 46) * s * 0.42
    L, R = x - w / 2, x + w / 2
    if level >= 4:
        cv.ell(x, y - 3 * s, 0.6 * w, 0.11 * w, hz(p, mixc((128, 128, 116), p["grass"], 0.45), y))
        for i in range(5):
            cv.ell(x + r.uniform(-0.45, 0.45) * w, y - r.uniform(2, 8) * s, r.uniform(5, 11) * s, r.uniform(3, 6) * s, hz(p, (150, 146, 136), y))
        return
    weather = (0.0, 0.22, 0.42, 0.55)[level]
    stone = (150, 146, 138)
    wallc = mixc(wall, (150, 146, 136), weather)
    roofc = mixc(roof, (92, 84, 78), weather * 0.8)
    if p["burn"] > 0.4 and kind == "barn":
        wallc = mixc(wallc, (60, 46, 40), 0.35)
    wc, ws = hz(p, wallc, y), hz(p, shade(wallc, 0.7), y)
    rl, rr = hz(p, shade(roofc, 1.08), y), hz(p, shade(roofc, 0.72), y)
    cv.ell(x + w * 0.45, y + 2 * s, w * 0.7, w * 0.08, (0, 0, 0, 55))
    if level == 3:
        sc_ = hz(p, stone, y)
        sd = hz(p, shade(stone, 0.7), y)
        top = [(R, y)]
        n = 6
        for i in range(n + 1):
            xx = R - w * i / n
            top.append((xx, y - h * r.uniform(0.18, 0.62)))
        top.append((L, y))
        side = [(R, y), (R + dx, y - dy), (R + dx, y - dy - h * r.uniform(0.1, 0.4)), (R, y - h * r.uniform(0.2, 0.5))]
        cv.poly(side, sd)
        cv.poly(top, sc_)
        for i in range(9):
            cv.ell(x + r.uniform(-0.65, 0.75) * w, y + r.uniform(-2, 6) * s, r.uniform(4, 10) * s, r.uniform(3, 6) * s, hz(p, shade(stone, r.uniform(0.7, 1.05)), y))
        cv.rect(x - 0.08 * w, y - 0.3 * h, x + 0.08 * w, y, hz(p, (52, 48, 44), y))
        return
    cv.poly([(x, y - h - g), (L, y - h), (L + dx, y - h - dy), (x + dx, y - h - g - dy)], rl)
    cv.poly([(R, y), (R + dx, y - dy), (R + dx, y - h - dy), (R, y - h)], ws)
    cv.poly([(x, y - h - g), (R, y - h), (R + dx, y - h - dy), (x + dx, y - h - g - dy)], rr)
    cv.poly([(L, y), (R, y), (R, y - h), (x, y - h - g), (L, y - h)], wc)
    if level == 2:
        for i in range(3):
            u = r.uniform(0.15, 0.7)
            a = lerp2((x, y - h - g), (R, y - h), u)
            cv.poly([a, (a[0] + dx * 0.6, a[1] - dy * 0.6), (a[0] + dx * 0.6 + 5 * s, a[1] - dy * 0.6 + 7 * s), (a[0] + 6 * s, a[1] + 6 * s)], hz(p, (40, 34, 30), y))
        for i in range(4):
            cv.ell(L + r.uniform(0, 1) * w, y - r.uniform(0, 0.5) * h, r.uniform(6, 14) * s, r.uniform(5, 10) * s, hz(p, (70, 96, 48), y))
    if kind == "barn":
        trim = hz(p, mixc((240, 236, 226), (150, 146, 136), weather), y)
        cv.line([(L, y - h), (x, y - h - g), (R, y - h)], trim, 3 * s)
        dw = 0.22 * w
        cv.rect(x - dw, y - 0.62 * h, x + dw, y, hz(p, shade(wallc, 0.82), y))
        cv.line([(x - dw, y - 0.62 * h), (x + dw, y)], trim, 3 * s)
        cv.line([(x + dw, y - 0.62 * h), (x - dw, y)], trim, 3 * s)
        cv.line([(x - dw, y - 0.62 * h), (x + dw, y - 0.62 * h), (x + dw, y), (x - dw, y), (x - dw, y - 0.62 * h)], trim, 3 * s)
        cv.rect(x - 0.1 * w, y - h - g * 0.7, x + 0.1 * w, y - h - g * 0.3, hz(p, (52, 40, 34), y))
        return
    cv.rect(x - 0.08 * w, y - 0.46 * h, x + 0.08 * w, y, hz(p, (96, 64, 44), y))
    wcol = hz(p, (40, 40, 44) if level >= 2 else (150, 186, 214), y)
    for sx in (-1, 1):
        x0, x1 = x + sx * 0.22 * w - 0.08 * w, x + sx * 0.22 * w + 0.08 * w
        y0, y1 = y - 0.76 * h, y - 0.5 * h
        cv.rect(x0, y0, x1, y1, wcol)
        if windows is not None:
            windows.append((x0, y0, x1, y1))
    if windows is not None:
        windows.append((x - 0.05 * w, y - h - g * 0.6, x + 0.05 * w, y - h - g * 0.3))


def draw_church(cv, p, level, windows=None):
    x, y = CHURCH
    s = sc(y)
    if level >= 5:
        return
    draw_house(cv, p, x + 26 * s, y, 1.3, (232, 226, 214), (110, 100, 96), level, 99, windows=windows)
    if level >= 4:
        return
    tw, th = 44 * s, (250 if level < 3 else 90) * s
    tx = x - 70 * s
    wc = hz(p, mixc((236, 230, 218), (150, 146, 136), (0, 0.2, 0.4, 0.55)[level]), y)
    cv.poly([(tx + tw / 2, y), (tx + tw / 2 + 18 * s, y - 13 * s), (tx + tw / 2 + 18 * s, y - th - 13 * s), (tx + tw / 2, y - th)], hz(p, shade(wc, 0.72), y))
    cv.rect(tx - tw / 2, y - th, tx + tw / 2, y, wc)
    if level < 3:
        cv.poly([(tx - tw / 2 - 3 * s, y - th), (tx + tw / 2 + 3 * s, y - th), (tx + 9 * s, y - th - 90 * s)], hz(p, (90, 104, 96), y))
        cv.poly([(tx + tw / 2 + 3 * s, y - th), (tx + tw / 2 + 18 * s, y - th - 13 * s), (tx + 9 * s, y - th - 90 * s)], hz(p, (58, 70, 64), y))
        cv.rect(tx - 7 * s, y - th + 22 * s, tx + 7 * s, y - th + 46 * s, hz(p, (50, 46, 44), y))
        if windows is not None:
            windows.append((tx - 6 * s, y - th + 60 * s, tx + 6 * s, y - th + 84 * s))


def draw_windmill_body(cv, p, level):
    x, y = WINDMILL
    s = sc(y) * 1.25
    if level >= 5:
        return
    if level >= 4:
        cv.ell(x, y - 3 * s, 34 * s, 7 * s, hz(p, (140, 138, 128), y))
        return
    hgt = (170 if level < 3 else 60) * s
    bw, tw = 36 * s, 23 * s
    wc = hz(p, mixc((236, 230, 216), (150, 146, 136), (0, 0.2, 0.4, 0.55)[level]), y)
    cv.poly([(x - bw, y), (x + bw, y), (x + tw if level < 3 else x + 30 * s, y - hgt), (x - tw if level < 3 else x - 26 * s, y - hgt + (0 if level < 3 else 12 * s))], wc)
    cv.poly([(x + 0.2 * bw, y), (x + bw, y), (x + tw if level < 3 else x + 30 * s, y - hgt), (x + 0.2 * tw, y - hgt)], hz(p, shade(wc, 0.78), y))
    if level < 3:
        cv.ell(x, y - hgt, tw * 1.2, 14 * s, hz(p, (86, 62, 48), y))
        cv.rect(x - 6 * s, y - 34 * s, x + 6 * s, y, hz(p, (90, 62, 44), y))
    if level == 2:
        hx, hy = x, y - hgt - 4 * s
        L = 120 * s
        for ang in (2.3, 4.1):
            ex, ey = hx + math.cos(ang) * L * 0.7, hy + math.sin(ang) * L * 0.7
            cv.line([(hx, hy), (ex, ey)], hz(p, (110, 92, 76), y), 4 * s)


def windmill_hub():
    x, y = WINDMILL
    s = sc(y) * 1.25
    return x, y - 170 * s - 4 * s, 120 * s


def draw_silo(cv, p, level):
    if level >= 5:
        return
    x, y = SILO
    s = sc(y)
    w = 78 * s
    hgt = (250 if level < 3 else 140 if level == 3 else 40) * s
    c = mixc((186, 186, 182), (140, 136, 128), (0, 0.2, 0.4, 0.55, 0.6)[level])
    cv.ell(x + w * 0.6, y + 2 * s, w * 0.9, w * 0.14, (0, 0, 0, 55))
    for i, f in enumerate((1.08, 0.98, 0.86, 0.72)):
        x0 = x - w / 2 + w * i / 4
        cv.rect(x0, y - hgt, x0 + w / 4 + 1, y, hz(p, shade(c, f), y))
    cv.ell(x, y, w / 2, w * 0.1, hz(p, shade(c, 0.85), y))
    if level < 3:
        cv.pie(x, y - hgt, w / 2, w * 0.45, 180, 360, hz(p, shade((150, 160, 170), 1.0), y))
        cv.pie(x + w * 0.12, y - hgt, w * 0.36, w * 0.4, 270, 360, hz(p, shade((150, 160, 170), 0.8), y))
    else:
        r = np.random.default_rng(5)
        top = [(x + w / 2, y - hgt)]
        for i in range(6):
            top.append((x + w / 2 - w * (i + 1) / 6, y - hgt - r.uniform(-14, 6) * s))
        cv.poly(top + [(x - w / 2, y - hgt + 10 * s)], hz(p, shade(c, 0.95), y))
    if level >= 3 and p["moss"] > 0:
        cv.ell(x, y - hgt * 0.2, w * 0.55, hgt * 0.25, hz(p, (70, 124, 66, 180), y))


def draw_hive(cv, p, x, y, level, seed):
    if level >= 4:
        return
    s = sc(y) * 1.1
    w, hh = 46 * s, 24 * s
    body = mixc((240, 222, 150), (150, 144, 132), (0, 0.15, 0.45, 0.6)[level])
    cv.ell(x + w * 0.5, y + 2 * s, w * 0.8, w * 0.12, (0, 0, 0, 60))
    if level == 3:
        cv.poly([(x - w / 2, y), (x + w / 2, y), (x + w / 2 + 6 * s, y - hh), (x - w / 2 + 6 * s, y - hh)], hz(p, body, y))
        cv.poly([(x - w / 2 - 4 * s, y + 4 * s), (x + w / 2 - 10 * s, y + 6 * s), (x + w / 2 - 6 * s, y), (x - w / 2, y - 2 * s)], hz(p, shade(body, 0.7), y))
        return
    cv.rect(x - w / 2 + 4 * s, y - 6 * s, x + w / 2 - 4 * s, y, hz(p, (90, 70, 50), y))
    for i in range(2):
        y1 = y - 6 * s - hh * i
        cv.rect(x - w / 2, y1 - hh, x + w / 2, y1, hz(p, shade(body, 1.0 - 0.06 * i), y))
        cv.poly([(x + w / 2, y1), (x + w / 2 + 10 * s, y1 - 7 * s), (x + w / 2 + 10 * s, y1 - hh - 7 * s), (x + w / 2, y1 - hh)], hz(p, shade(body, 0.72), y))
        cv.line([(x - w / 2, y1 - 1 * s), (x + w / 2, y1 - 1 * s)], hz(p, shade(body, 0.8), y), 1.2 * s)
    yt = y - 6 * s - 2 * hh
    cv.poly([(x - w / 2 - 4 * s, yt), (x + w / 2 + 4 * s, yt), (x + w / 2 + 14 * s, yt - 8 * s), (x - w / 2 + 6 * s, yt - 8 * s)], hz(p, (196, 190, 180), y))
    cv.rect(x - 6 * s, y - 10 * s, x + 6 * s, y - 7 * s, hz(p, (40, 30, 24), y))


def draw_rock(cv, p, rk):
    x, y = rk["x"], rk["y"]
    s = sc(y) * rk["size"]
    r = np.random.default_rng(rk["seed"])
    n = 7
    pts, pts2 = [], []
    for i in range(n):
        a = math.pi * 2 * i / n + r.uniform(-0.2, 0.2)
        rr = r.uniform(0.75, 1.1)
        pts.append((x + math.cos(a) * 26 * s * rr, y - 6 * s + math.sin(a) * 14 * s * rr - (10 * s if math.sin(a) < 0 else 0)))
    cv.ell(x + 12 * s, y + 2 * s, 30 * s, 6 * s, (0, 0, 0, 50))
    base = (128, 124, 118) if p["sea"] == 0 else (96, 88, 86)
    cv.poly(pts, hz(p, shade(base, 0.7), y))
    pts2 = [(x - 4 * s + (px - x) * 0.72, y - 10 * s + (py - y + 6 * s) * 0.6) for px, py in pts]
    cv.poly(pts2, hz(p, shade(base, 1.05), y))
    if p["moss"] > 0 and rk["r"] < p["moss"]:
        cv.ell(x - 4 * s, y - 16 * s, 18 * s, 7 * s, hz(p, (74, 134, 66), y))
        cv.ell(x - 8 * s, y - 18 * s, 9 * s, 4 * s, hz(p, (112, 170, 90), y))


def draw_fern(cv, p, fn):
    x, y = fn["x"], fn["y"]
    s = sc(y) * fn["size"]
    r = np.random.default_rng(fn["seed"])
    c1 = hz(p, (52, 118, 56) if p["sea"] == 0 else (88, 120, 62), y)
    c2 = hz(p, (104, 166, 86) if p["sea"] == 0 else (138, 160, 84), y)
    for i in range(8):
        a = -1.25 + 2.5 * i / 7 + r.uniform(-0.1, 0.1)
        L = 46 * s * r.uniform(0.7, 1.0)
        pts = []
        for k in range(6):
            u = k / 5
            aa = a * (1 + 0.5 * u)
            pts.append((x + math.sin(aa) * L * u, y - math.cos(aa) * L * u + 12 * s * u * u * abs(a)))
        cv.line(pts, c1 if i % 2 else c2, max(0.6, 4 * s))
        for k in range(1, 5):
            px, py = pts[k]
            cv.line([(px, py), (px - 7 * s, py - 4 * s)], c2, max(0.5, 1.8 * s))
            cv.line([(px, py), (px + 7 * s, py - 4 * s)], c1, max(0.5, 1.8 * s))


def draw_post(cv, p, po, posts):
    if po["r"] >= p["fence"]:
        return
    x, y = po["x"], po["y"]
    s = sc(y)
    wood = hz(p, mixc((132, 96, 62), (126, 120, 112), 1 - p["fence"]), y)
    hgt = 48 * s
    cv.rect(x - 3.2 * s, y - hgt, x + 3.2 * s, y, wood)
    cv.rect(x + 0.5 * s, y - hgt, x + 3.2 * s, y, hz(p, shade(wood, 0.75), y))
    nxt = [q for q in posts if q["edge"] == po["edge"] and q["i"] == po["i"] + 1]
    if nxt and nxt[0]["r"] < p["fence"] and po["r2"] < p["fence"] + 0.15:
        q = nxt[0]
        s2 = sc(q["y"])
        for f in (0.42, 0.8):
            cv.line([(x, y - hgt * f), (q["x"], q["y"] - 48 * s2 * f)], wood, max(0.8, 3 * s))


def draw_flower(cv, p, x, y, col, big=1.0):
    s = sc(y) * big
    stem = hz(p, (54, 120, 48), y)
    cv.line([(x, y), (x + 1 * s, y - 12 * s)], stem, max(0.5, 1.4 * s))
    hc = hz(p, col, y)
    yy = y - 12 * s
    for a in range(5):
        ang = a * 1.2566
        cv.ell(x + math.cos(ang) * 3.0 * s, yy + math.sin(ang) * 2.2 * s, 2.6 * s, 2.2 * s, hc)
    cv.ell(x, yy, 1.6 * s, 1.4 * s, hz(p, (250, 220, 90), y))


def tree_mode(p, tr):
    if tr["kind"] == "pine":
        if tr["r"] < p["gone_p"]:
            return None
        return "snag" if tr["r"] < p["dead_p"] else "alive"
    if tr["r"] < p["gone_d"]:
        return None
    return "snag" if tr["r"] < p["dead_d"] else "alive"


def draw_field(cv, p):
    ft = p["field"]
    if ft == "none":
        return
    rows = 13
    xs = np.linspace(-330, 470, rows + 1)
    if ft == "crops":
        cols = ((70, 132, 46), (128, 96, 64))
    elif ft == "wheat":
        cols = ((216, 182, 92), (194, 158, 74))
    else:
        cols = ((64, 58, 52), (86, 76, 66))
    r = np.random.default_rng(77)
    for i in range(rows):
        a, b = xs[i], xs[i + 1]
        quad = [(field_px(a, FIELD_Y0), FIELD_Y0), (field_px(b, FIELD_Y0), FIELD_Y0), (b, FIELD_Y1), (a, FIELD_Y1)]
        cv.poly(quad, hz(p, cols[i % 2], (FIELD_Y0 + FIELD_Y1) / 2))
    if ft == "crops":
        for i in range(0, rows, 2):
            for k in range(14):
                u = r.random()
                y = lerp(FIELD_Y0, FIELD_Y1, u)
                xf = lerp(xs[i], xs[i + 1], r.uniform(0.2, 0.8))
                x = field_px(xf, y)
                s = sc(y)
                cv.ell(x, y - 4 * s, 7 * s, 5 * s, hz(p, (96, 156, 60), y))
                cv.ell(x + 2 * s, y - 3 * s, 3.2 * s, 3 * s, hz(p, (214, 44, 40) if k % 3 else (240, 140, 40), y))
    elif ft == "wheat":
        for k in range(1400):
            y = lerp(FIELD_Y0, FIELD_Y1, r.random())
            x = field_px(r.uniform(-330, 470), y)
            s = sc(y)
            cv.line([(x, y), (x + 1.5 * s, y - 13 * s)], hz(p, (232, 204, 120) if k % 2 else (178, 140, 64), y), max(0.5, 1.6 * s))
    else:
        for k in range(300):
            y = lerp(FIELD_Y0, FIELD_Y1, r.random())
            x = field_px(r.uniform(-330, 470), y)
            s = sc(y)
            cv.line([(x, y), (x + 1 * s, y - 8 * s)], hz(p, (34, 30, 28), y), max(0.5, 1.4 * s))


def draw_bridge(cv, p):
    lvl = p["bridge"]
    if lvl >= 4:
        return
    stone = (172, 162, 148)
    def L(u):
        return lerp2(BR_NL, BR_FL, u)
    def Rr(u):
        return lerp2(BR_NR, BR_FR, u)
    def hgt(u):
        return 74 * sc(L(u)[1])
    water_dk = shade(p["water"], 0.45)
    def segment(u0, u1, jag0=False, jag1=False):
        a0, a1 = L(u0), L(u1)
        wall = [a0, a1, (a1[0], a1[1] + hgt(u1)), (a0[0], a0[1] + hgt(u0))]
        cv.poly(wall, hz(p, shade(stone, 0.78), a0[1]))
        for ua in (0.2, 0.5, 0.8):
            if u0 + 0.02 < ua < u1 - 0.02:
                c = L(ua)
                hh = hgt(ua)
                span = abs(L(ua + 0.1)[1] - c[1])
                cv.pie(c[0] + 0.02 * span, c[1] + hh, hh * 0.32 + 2, hh * 0.72, 180, 360, hz(p, water_dk, c[1]))
                cv.ell(c[0], c[1] + hh * 1.25, hh * 0.35, hh * 0.25, rgba(hz(p, water_dk, c[1]), 90))
        deck = [L(u0), Rr(u0), Rr(u1), L(u1)]
        cv.poly(deck, hz(p, stone, a0[1]))
        for k in range(1, 8):
            uu = lerp(u0, u1, k / 8)
            cv.line([L(uu), Rr(uu)], hz(p, shade(stone, 0.88), L(uu)[1]), max(0.5, 1.6 * sc(L(uu)[1])))
        cv.line([L(u0), L(u1)], hz(p, shade(stone, 1.15), a0[1]), 7 * sc(a0[1]))
        cv.line([Rr(u0), Rr(u1)], hz(p, shade(stone, 0.95), a0[1]), 6 * sc(a0[1]))
        if p["moss"] > 0:
            cv.line([lerp2(a0, a1, 0.1), lerp2(a0, a1, 0.9)], hz(p, (76, 132, 66), a0[1]), 5 * sc(a0[1]))
    if lvl == 0:
        segment(0.0, 1.0)
    elif lvl == 1:
        segment(0.0, 0.34)
        segment(0.66, 1.0)
        for u in (0.42, 0.5, 0.58):
            c = L(u)
            s = sc(c[1])
            cv.ell(c[0] + 20 * s, c[1] + hgt(u) * 1.1, 14 * s, 6 * s, hz(p, shade(stone, 0.8), c[1]))
    else:
        piers = (0.34, 0.66) if lvl == 2 else (0.34,)
        for u in piers:
            c = L(u)
            s = sc(c[1])
            hh = 26 * s
            x0, x1 = c[0] - 4 * s, c[0] + 44 * s
            cv.rect(x0, c[1] + 30 * s - hh, x1, c[1] + 30 * s, hz(p, shade(stone, 0.8), c[1]))
            cv.poly([(x0, c[1] + 30 * s - hh), (x1, c[1] + 30 * s - hh), (x1 - 6 * s, c[1] + 24 * s - hh - 8 * s), (x0 + 6 * s, c[1] + 22 * s - hh - 8 * s)], hz(p, stone, c[1]))
            if p["moss"] > 0:
                cv.ell(c[0] + 20 * s, c[1] + 22 * s - hh - 4 * s, 22 * s, 6 * s, hz(p, (80, 138, 70), c[1]))
            cv.ell(c[0] + 20 * s, c[1] + 32 * s, 32 * s, 4 * s, rgba((230, 240, 245), 90))


def render_state(name, collect=False):
    p = STATES[name]
    k = S
    cv = Cv(k)
    cv.img.paste(draw_sky(p, k), (0, 0))
    cv.d = ImageDraw.Draw(cv.img, "RGBA")
    meta = dict(windows=[])
    win = meta["windows"] if collect else None

    if p["sea"]:
        draw_sea_world(cv, p)
        out = cv.img.resize((W, H), Image.LANCZOS)
        return np.asarray(out, dtype=np.uint8).copy(), meta

    # mountains
    pts = ridge(p["mtn_seed"], -140, 1220, 7, HOR + 20, 170, 300, 50, 110, p["mtn_amp"])
    draw_range(cv, p, pts, HOR + 60, p["mtn"], 0.22, snow_line=HOR - 140, snow=p["snow"])
    # far bank ground and green hills
    gfar = mixc(p["grass"], p["hill"], 0.5)
    band_fill(cv, p, HOR - 10, SHORE_FAR + 2, gfar, p["grass"], n=30)
    hp = ridge(p["mtn_seed"] + 1, -100, 1180, 6, 690, 70, 130, 20, 50, 1.0)
    draw_range(cv, p, hp, 700, p["hill"], 0.06)
    band_fill(cv, p, 690, SHORE_FAR + 2, mixc(gfar, p["grass"], 0.5), p["grass"], n=14)

    # far items, sorted by depth
    items = []
    for tr in WORLD["trees"]:
        if tr["y"] < SHORE_FAR:
            m = tree_mode(p, tr)
            if m:
                items.append((tr["y"], "tree", tr, m))
    for np_ in WORLD["newpines"]:
        if np_["y"] < SHORE_FAR and np_["r"] < p["newpines"]:
            items.append((np_["y"], "newpine", np_, None))
    for i, (x, y, ws) in enumerate(HOUSES):
        items.append((y, "house", (x, y, ws, i), None))
    items.append((CHURCH[1], "church", None, None))
    items.append((WINDMILL[1], "windmill", None, None))
    items.sort(key=lambda it: it[0])
    # far tufts / flowers first (they lie on the ground)
    for (x, y, rr, r2) in WORLD["far_tufts"]:
        s = sc(y)
        c = hz(p, p["tuft"] if rr < 0.6 else p["tuft2"], y)
        L = (14 + 18 * p["tall"]) * s
        cv.line([(x, y), (x - 2 * s, y - L)], c, max(0.5, 1.4 * s))
        cv.line([(x, y), (x + 3 * s, y - L * 0.8)], c, max(0.5, 1.4 * s))
    for (x, y, col, rr) in WORLD["far_flowers"]:
        if rr < p["flowers"]:
            cv.ell(x, y - 3 * sc(y), 2.2 * sc(y) + 0.6, 1.8 * sc(y) + 0.5, hz(p, col, y))
    if p["road"] > 0.3:
        cv.poly([(672, SHORE_FAR), (688, SHORE_FAR), (684, 712), (676, 712)], rgba(hz(p, p["dirt"], 740), 255 * p["road"]))
    for it in items:
        _, kind, obj, m = it
        if kind == "tree":
            if obj["kind"] == "pine":
                draw_pine(cv, p, obj["x"], obj["y"], obj["size"], obj["seed"], m)
            else:
                draw_decid(cv, p, obj, m)
        elif kind == "newpine":
            draw_pine(cv, p, obj["x"], obj["y"], obj["size"], obj["seed"], "alive")
        elif kind == "house":
            x, y, ws, i = obj
            draw_house(cv, p, x, y, ws, WALLS[i % len(WALLS)], ROOFS[i % len(ROOFS)], p["village"], 300 + i, windows=win)
        elif kind == "church":
            draw_church(cv, p, p["village"], windows=win)
        elif kind == "windmill":
            draw_windmill_body(cv, p, p["village"] + (1 if p["village"] >= 1 and p["burn"] > 0 else 0))

    # river
    band_fill(cv, p, SHORE_FAR, SHORE_NEAR + 4, p["water_far"], p["water"], n=34, haze=False)
    r = np.random.default_rng(8)
    cv.rect(-5, SHORE_FAR, W + 5, SHORE_FAR + 16, rgba(shade(gfar, 0.55), 110))
    for i in range(70):
        y = r.uniform(SHORE_FAR + 14, SHORE_NEAR - 8)
        x = r.uniform(-50, 1100)
        L = r.uniform(30, 160) * sc(y) * 2
        cv.ell(x, y, L, 1.2 + 1.5 * sc(y), rgba(shade(p["water_far"], 1.08), 70))
    draw_bridge(cv, p)

    # near bank ground
    g_top, g_bot = p["grass"], mixc(p["grass"], p["grass_dark"], 0.8)
    band_fill(cv, p, SHORE_NEAR - 6, H + 2, g_top, g_bot, n=60)
    shore = []
    for i in range(41):
        x = -10 + i * 1100 / 40
        shore.append((x, SHORE_NEAR - 4 + 4 * math.sin(i * 1.7) + 3 * math.sin(i * 0.53)))
    sand = hz(p, mixc((196, 178, 136), p["grass"], 0.25), SHORE_NEAR)
    cv.poly(shore + [(1100, SHORE_NEAR + 16), (-10, SHORE_NEAR + 16)], sand)
    cv.poly(shore + [(1100, SHORE_NEAR + 2), (-10, SHORE_NEAR + 2)], rgba(shade(p["water"], 0.8), 120))
    for (x, y, rad, a, b) in WORLD["patches"]:
        s = sc(y)
        c = shade(p["grass"], 0.86 if a < 0.5 else 1.1)
        cv.ell(x, y, rad * s * 2, rad * s * 0.6, rgba(hz(p, c, y), 46))
    # dust (dry, cracked soil)
    if p["dust"] > 0:
        for (x, y, rad, a, b) in WORLD["patches"]:
            s = sc(y)
            cv.ell(x + 40 * s, y + 10 * s, rad * s * 1.6, rad * s * 0.45, rgba(hz(p, (206, 186, 140), y), 90 * p["dust"]))
    # road
    if p["road"] > 0:
        ys = np.linspace(SHORE_NEAR - 2, H + 20, 80)
        left = [(road_x(y) - road_w(y) / 2, y) for y in ys]
        right = [(road_x(y) + road_w(y) / 2, y) for y in ys]
        cv.poly(left + right[::-1], rgba(hz(p, p["dirt"], 1200), 255 * p["road"]))
        for off in (-0.26, 0.26):
            cv.line([(road_x(y) + off * road_w(y), y) for y in ys], rgba(hz(p, shade(p["dirt"], 0.84), 1200), 200 * p["road"]), 7)
        cv.line([(road_x(y), y) for y in ys], rgba(hz(p, mixc(p["dirt"], p["grass"], 0.6), 1200), 200 * p["road"]), 5)
    draw_field(cv, p)
    if p["burn"] > 0:
        for (x, y, rad, rr) in WORLD["char"]:
            if rr < p["burn"]:
                s = sc(y)
                cv.ell(x, y, rad * s * 1.8, rad * s * 0.5, (26, 22, 20, 52))
    if p["moss"] > 0:
        for (x, y, rad, rr) in WORLD["moss"]:
            if rr < p["moss"]:
                s = sc(y)
                cv.ell(x, y, rad * s * 1.8, rad * s * 0.55, rgba(hz(p, (56, 128, 62) if rr < 0.5 else (98, 160, 80), y), 130))
    if p["litter"] > 0:
        for (x, y, rr, ci, ang) in WORLD["litter"]:
            if rr < p["litter"]:
                s = sc(y)
                c = hz(p, p["litter_col"][ci], y)
                cv.ell(x, y, 5.5 * s + 0.6, 2.4 * s + 0.4, c)
    # grass tufts
    for (x, y, rr, r2) in WORLD["tufts"]:
        if p["road"] > 0.5 and on_road(x, y):
            continue
        if p["field"] != "none" and in_field(x, y):
            continue
        s = sc(y)
        tall = p["tall"] + (p["pasture"] * 1.2 if in_pasture(x, y) else 0)
        if p["sea"] == 0 and p["dust"] > 0 and r2 < 0.55:
            continue
        c = hz(p, p["tuft"] if rr < 0.55 else p["tuft2"], y)
        L = (17 + 22 * tall * (0.6 + 0.6 * r2)) * s
        w = max(0.5, 1.7 * s)
        cv.line([(x, y), (x - 4 * s, y - L)], c, w)
        cv.line([(x, y), (x + 1 * s, y - L * 1.1)], c, w)
        cv.line([(x, y), (x + 5 * s, y - L * 0.8)], c, w)

    # near items sorted by depth
    items = []
    for tr in WORLD["trees"]:
        if tr["y"] >= SHORE_FAR:
            m = tree_mode(p, tr)
            if m:
                items.append((tr["y"], "tree", tr, m))
    for np_ in WORLD["newpines"]:
        if np_["y"] >= SHORE_FAR and np_["r"] < p["newpines"] and not (p["road"] > 0.5 and on_road(np_["x"], np_["y"], 30)):
            items.append((np_["y"], "newpine", np_, None))
    for fn in WORLD["ferns"]:
        if fn["r"] < p["ferns"]:
            items.append((fn["y"], "fern", fn, None))
    for rk in WORLD["rocks"]:
        if rk["r"] < p["rocks"]:
            items.append((rk["y"], "rock", rk, None))
    for po in WORLD["posts"]:
        items.append((po["y"], "post", po, None))
    for i, (x, y) in enumerate(HIVES):
        items.append((y, "hive", (x, y, i), None))
    items.append((BARN[1], "barn", None, None))
    items.append((SILO[1], "silo", None, None))
    items.append((FARMHOUSE[1], "farmhouse", None, None))
    if p["pasture"] > 0.7:
        r = np.random.default_rng(31)
        for i in range(14):
            y = r.uniform(PAST_Y0 + 20, PAST_Y1 - 10)
            x = r.uniform(past_left(y) + 20, 1080)
            items.append((y, "bush", (x, y, r.uniform(0.7, 1.3)), None))
    for (x, y, rr) in WORLD["reeds"]:
        items.append((y, "reed", (x, y, rr), None))
    for (x, y, col, rr) in WORLD["flowers"]:
        if rr < p["flowers"] and not on_road(x, y) and not in_field(x, y):
            items.append((y, "flower", (x, y, col), None))
    items.sort(key=lambda it: it[0])
    for it in items:
        _, kind, obj, m = it
        if kind == "tree":
            if obj["kind"] == "pine":
                draw_pine(cv, p, obj["x"], obj["y"], obj["size"], obj["seed"], m)
            else:
                draw_decid(cv, p, obj, m)
        elif kind == "newpine":
            draw_pine(cv, p, obj["x"], obj["y"], obj["size"], obj["seed"], "alive")
        elif kind == "fern":
            draw_fern(cv, p, obj)
        elif kind == "rock":
            draw_rock(cv, p, obj)
        elif kind == "post":
            draw_post(cv, p, obj, WORLD["posts"])
        elif kind == "hive":
            draw_hive(cv, p, obj[0], obj[1], p["farm"], obj[2])
        elif kind == "barn":
            draw_house(cv, p, BARN[0], BARN[1], 1.0, (172, 52, 42), (96, 88, 84), p["farm"], 7, kind="barn")
        elif kind == "silo":
            draw_silo(cv, p, p["farm"])
        elif kind == "farmhouse":
            draw_house(cv, p, FARMHOUSE[0], FARMHOUSE[1], 1.0, (238, 228, 208), (156, 64, 48), p["farm"] if p["farm"] < 2 else p["farm"], 8, windows=win)
        elif kind == "bush":
            x, y, z = obj
            s = sc(y) * z
            cv.ell(x + 10 * s, y, 26 * s, 6 * s, (0, 0, 0, 50))
            for (ox, oy, rr) in ((-12, -14, 15), (10, -16, 16), (0, -26, 15)):
                cv.ell(x + ox * s, y + oy * s, rr * s, rr * s, hz(p, shade(p["leaf"], 0.75), y))
                cv.ell(x + ox * s - 3 * s, y + oy * s - 3 * s, rr * s * 0.7, rr * s * 0.7, hz(p, p["leaf"], y))
        elif kind == "reed":
            x, y, rr = obj
            s = sc(y)
            c = hz(p, mixc((86, 120, 56), p["tuft"], 0.5), y)
            for k2 in range(5):
                cv.line([(x + k2 * 3 * s, y), (x + k2 * 3 * s + (k2 - 2) * 4 * s, y - (36 + 10 * rr) * s)], c, max(0.6, 2 * s))
            if p["burn"] == 0 and p["sea"] == 0:
                cv.ell(x + 6 * s, y - 34 * s, 2.5 * s, 7 * s, hz(p, (110, 80, 50), y))
        elif kind == "flower":
            x, y, col = obj
            draw_flower(cv, p, x, y, col, 1.25)

    out = cv.img.resize((W, H), Image.LANCZOS)
    return np.asarray(out, dtype=np.uint8).copy(), meta


def draw_sea_world(cv, p):
    """the far future: a new coastline, a young volcanic island, mossy rocks"""
    hy = 600
    band_fill(cv, p, hy, 1060, p["water_far"], p["water"], n=50, haze=False)
    # island silhouette on the horizon
    isl = [(-20, hy + 2), (60, hy - 30), (130, hy - 48), (180, hy - 92), (214, hy - 96), (250, hy - 58), (330, hy - 34), (420, hy + 2)]
    cv.poly(isl, mixc((120, 92, 110), p["haze"], 0.35))
    cv.poly([(180, hy - 92), (214, hy - 96), (250, hy - 58), (214, hy - 40)], mixc((96, 72, 96), p["haze"], 0.35))
    cv.poly([(820, hy + 2), (900, hy - 22), (980, hy - 30), (1100, hy - 10), (1100, hy + 2)], mixc((130, 104, 118), p["haze"], 0.45))
    # sun glitter column
    r = np.random.default_rng(4)
    for i in range(220):
        y = hy + 6 + (1060 - hy) * r.random() ** 1.4
        spread = 30 + (y - hy) * 0.5
        x = p["sun"][0] + r.normal(0, spread * 0.5)
        cv.ell(x, y, r.uniform(6, 26) * sc(y) * 2.2, 1.4 + 1.2 * sc(y), rgba((255, 226, 180), 150))
    for i in range(60):
        y = r.uniform(hy + 20, 1050)
        cv.ell(r.uniform(-40, 1120), y, r.uniform(40, 150) * sc(y), 1.0 + sc(y), rgba((250, 210, 190), 60))
    # shore
    pts = []
    for i in range(41):
        x = -10 + i * 1100 / 40
        pts.append((x, 1040 + 26 * math.sin(i * 0.37) + 10 * math.sin(i * 1.3)))
    cv.poly(pts + [(1100, H + 5), (-10, H + 5)], hz(p, p["grass"], 1100))
    cv.line(pts, (250, 244, 236), 6)
    cv.line([(x, y + 12) for x, y in pts], rgba((250, 244, 236), 120), 4)
    band_fill(cv, p, 1080, H + 2, p["grass"], p["grass_dark"], n=40)
    pts2 = [(x, y + 14) for x, y in pts]
    cv.poly(pts2 + [(1100, 1100), (-10, 1100)], hz(p, p["grass"], 1080))
    for (x, y, rad, a, b) in WORLD["patches"]:
        if y > 1080:
            s = sc(y)
            cv.ell(x, y, rad * s * 2, rad * s * 0.6, rgba(shade(p["grass"], 0.82 if a < 0.5 else 1.12), 70))
    for (x, y, rad, rr) in WORLD["moss"]:
        if y > 1090 and rr < p["moss"]:
            s = sc(y)
            cv.ell(x, y, rad * s * 1.8, rad * s * 0.55, rgba((72, 134, 70) if rr < 0.5 else (112, 166, 88), 170))
    items = []
    for fn in WORLD["ferns"]:
        if fn["r"] < p["ferns"] and fn["y"] > 1100:
            items.append((fn["y"], "fern", fn))
    for rk in WORLD["rocks"]:
        if rk["y"] > 1090:
            items.append((rk["y"], "rock", rk))
    items.sort(key=lambda it: it[0])
    for _, kind, obj in items:
        if kind == "fern":
            draw_fern(cv, p, obj)
        else:
            draw_rock(cv, p, obj)
    # tide pools
    for (x, y, rx) in ((250, 1260, 90), (820, 1420, 120), (430, 1700, 150)):
        cv.ell(x, y, rx, rx * 0.22, hz(p, shade(p["water"], 0.9), y))
        cv.ell(x - rx * 0.2, y - rx * 0.05, rx * 0.6, rx * 0.08, rgba((255, 220, 190), 90))

# ----------------------------------------------------------------------------
# timeline
# ----------------------------------------------------------------------------
TRANS = [(23.0, 24.4, "lush", "y1"), (30.0, 31.2, "y1", "y10"), (36.0, 37.2, "y10", "y100"),
         (42.0, 43.2, "y100", "y1000"), (48.0, 49.4, "y1000", "y100k"), (55.0, 56.4, "y100k", "y10m"),
         (62.0, 63.4, "y10m", "y500m")]

def state_at(t):
    cur = "lush"
    for t0, t1, a, b in TRANS:
        if t < t0:
            return a, a, 0.0
        if t < t1:
            return a, b, smooth((t - t0) / (t1 - t0))
        cur = b
    return cur, cur, 0.0

def weight(t, name):
    a, b, k = state_at(t)
    return (1 - k) * (a == name) + k * (b == name)

JUMPS = [(23.0, 24.4, "+1", "YEAR"), (48.0, 49.4, "+100,000", "YEARS"),
         (55.0, 56.4, "+10,000,000", "YEARS"), (62.0, 63.4, "+500,000,000", "YEARS")]

NIGHT = (12.7, 13.7, 17.5, 18.5)
def night_at(t):
    return ramp(t, NIGHT[0], NIGHT[1]) * (1 - ramp(t, NIGHT[2], NIGHT[3]))

POP = 19_874_302_551_208_746_119

COUNT = [(4.0, 8.5, "sec"), (8.5, 13.0, "hour"), (13.0, 18.0, "day"), (18.0, 23.7, "week"),
         (23.7, 30.0, "yr", 1, 9), (30.0, 36.0, "yr", 10, 99), (36.0, 42.0, "yr", 100, 990),
         (42.0, 48.7, "yr", 1000, 9800), (48.7, 55.7, "yr", 100_000, 141_200),
         (55.7, 62.7, "yr", 10_000_000, 10_640_000), (62.7, 99.0, "yr", 500_000_000, 508_200_000)]

def plural(n, word):
    return word if n == 1 else word + "S"

def counter(t):
    if t < 4.0:
        if t < T_V:
            v = POP + int(t * 37) * 3 + int(t * 7)
        else:
            k = smooth((t - T_V) / 0.55)
            v = int(POP * (1 - k) ** 3)
        return "ANIMALS ON EARTH", f"{v:,}", ""
    for c in COUNT:
        t0, t1, kind = c[0], c[1], c[2]
        if t0 <= t < t1:
            if kind == "sec":
                n = 1 + int(t - t0)
                return "TIME WITHOUT ANIMALS", str(n), plural(n, "SECOND")
            if kind == "hour":
                n = 1 + int((t - t0) / 1.2)
                return "TIME WITHOUT ANIMALS", str(n), plural(n, "HOUR")
            if kind == "day":
                return "TIME WITHOUT ANIMALS", "1", "DAY"
            if kind == "week":
                n = 1 + int((t - t0) / 1.9)
                return "TIME WITHOUT ANIMALS", str(n), plural(n, "WEEK")
            a, b = c[3], c[4]
            u = clamp((t - t0) / min(t1 - t0, 6.0))
            v = a * (b / a) ** u
            unit = 10 ** max(0, len(str(a)) - 3)
            n = int(round(v / unit) * unit)
            return "TIME WITHOUT ANIMALS", f"{n:,}", plural(n, "YEAR")
    return None

CAPS = [
    (4.25, 8.4, "Every animal on Earth vanishes at once. Only humans remain."),
    (8.75, 12.8, "The world goes silent. No birdsong, no buzzing, no barking."),
    (13.5, 17.6, "Night falls, but no crickets chirp and no owls call."),
    (18.6, 22.8, "Flowers bloom, but no bee will ever visit them."),
    (24.5, 29.8, "No pollinators: apples, berries, melons and cocoa disappear."),
    (30.6, 35.8, "Dead leaves pile up. Without worms and insects, they barely rot."),
    (37.0, 41.8, "Mountains of dry, dead wood feed huge wildfires."),
    (43.0, 47.8, "The soil turns to dust. Farms fail, and the village falls to ruin."),
    (49.6, 54.8, "Only grasses and pines are left. They need nothing but the wind."),
    (56.6, 61.8, "Fungi and bacteria slowly rebuild the soil. The land turns green again."),
    (63.6, 69.2, "Tiny cells begin to work together. Animal life starts over."),
]
TITLE = (0.15, 3.25, "What if all animals\ndisappeared?")
OUTRO = (69.6, DUR, "What should disappear next?")

# ----------------------------------------------------------------------------
# animals (intro only) - they all vanish at T_V
# ----------------------------------------------------------------------------
def build_animals():
    r = np.random.default_rng(7)
    A = []
    def add(kind, **kw):
        kw["kind"] = kind
        kw["tv"] = T_V + r.uniform(0.0, 0.5)
        kw["ph"] = r.uniform(0, 6.28)
        A.append(kw)
    for (x, y, f) in [(808, 1112, 1), (912, 1192, -1), (1012, 1098, -1), (858, 1262, 1)]:
        add("cow", x=x, y=y, face=f)
    for (x, y, f) in [(1008, 1258, -1), (1052, 1180, 1), (962, 1136, 1)]:
        add("sheep", x=x, y=y, face=f)
    for (x, y, f) in [(418, 1132, 1), (452, 1150, -1), (384, 1156, 1), (500, 1140, -1)]:
        add("chicken", x=x, y=y, face=f)
    for (x, y) in [(230, 878), (276, 896), (322, 872), (180, 900)]:
        add("duck", x=x, y=y)
    for i in range(11):
        row = i // 2 + 1 if i else 0
        side = 1 if i % 2 else -1
        add("bird", ox=-row * 34, oy=row * 18 * side, y=300, size=r.uniform(11, 14))
    add("swallow", x=560, y=620, dir=1)
    add("swallow", x=480, y=560, dir=-1)
    cols = [(250, 150, 40), (90, 140, 240), (250, 230, 90), (240, 100, 160), (255, 255, 250)]
    for i, (x, y) in enumerate([(200, 1760), (560, 1835), (930, 1720), (430, 1560), (980, 1840), (120, 1600)]):
        add("butterfly", x=x, y=y, col=cols[i % len(cols)])
    for i in range(10):
        hx, hy = HIVES[i % 3]
        add("bee", x=hx + r.uniform(-30, 30), y=hy - 50 + r.uniform(-20, 20), rx=r.uniform(30, 90), ry=r.uniform(14, 34), spd=r.uniform(2.0, 4.0) * (1 if i % 2 else -1))
    for (x, y) in [(150, 1840), (330, 1780), (620, 1720)]:
        add("bee", x=x, y=y, rx=r.uniform(30, 60), ry=r.uniform(10, 20), spd=r.uniform(2.0, 3.0))
    add("fish", x=470, y=905)
    add("dog", x=560, y=1092, face=1)
    return A

ANIMALS = build_animals()

def apos(a, t):
    k = a["kind"]
    if k == "duck":
        return a["x"] + 12 * t, a["y"] + 1.5 * math.sin(t * 2 + a["ph"])
    if k == "bird":
        return -170 + 215 * t + a["ox"], a["y"] + a["oy"] + 6 * math.sin(t * 1.5 + a["ph"])
    if k == "swallow":
        ang = a["ph"] + t * 2.0 * a["dir"]
        return a["x"] + 300 * math.cos(ang), a["y"] + 80 * math.sin(ang * 1.5)
    if k == "butterfly":
        return (a["x"] + 50 * math.sin(t * 0.9 + a["ph"]) + 20 * math.sin(t * 2.7),
                a["y"] + 26 * math.sin(t * 1.3 + a["ph"] * 2) - 14 * abs(math.sin(t * 5)))
    if k == "bee":
        ang = a["ph"] + t * a["spd"]
        return a["x"] + a["rx"] * math.cos(ang), a["y"] + a["ry"] * math.sin(ang * 1.3) + 6 * math.sin(t * 17)
    if k == "dog":
        return a["x"] + 8 * math.sin(t * 1.5), a["y"]
    return a["x"], a["y"]

def animal_center(a, t):
    x, y = apos(a, t)
    s = sc(y)
    k = a["kind"]
    if k == "cow":
        return x, y - 40 * s * 1.15, 60 * s
    if k == "sheep":
        return x, y - 30 * s, 40 * s
    if k == "chicken":
        return x, y - 14 * s, 22 * s
    if k == "duck":
        return x, y - 6 * s, 26 * s
    if k == "dog":
        return x, y - 18 * s, 30 * s
    if k in ("bird", "swallow"):
        return x, y, 22
    if k == "butterfly":
        return x, y, 30 * s
    if k == "bee":
        return x, y, 16 * s
    return x, y, 20


def draw_cow(cv, x, y, f, face, t, ph):
    s = sc(y) * 1.15
    cy = y - 40 * s
    def P(dx, dy):
        return (x + dx * s * face * f, cy + dy * s * f)
    cv.ell(x + 12 * s, y + 2 * s, 58 * s * f, 9 * s * f, (0, 0, 0, 60))
    graze = smooth(0.5 + 0.8 * math.sin(t * 0.9 + ph))
    leg = (66, 56, 50)
    for lx in (-36, -22, 24, 38):
        cv.line([P(lx, 8), P(lx + (2 if lx > 0 else -2), 40)], leg, 7 * s * f)
    body = (238, 234, 226)
    bx, by = P(0, 0)
    cv.ell(bx, by, 52 * s * f, 23 * s * f, body)
    cv.ell(bx, by + 8 * s * f, 46 * s * f, 14 * s * f, (214, 208, 198))
    for (dx, dy, rx, ry) in ((-14, -6, 14, 11), (20, 4, 12, 9), (-36, 6, 8, 8), (4, -14, 9, 6)):
        sx, sy = P(dx, dy)
        cv.ell(sx, sy, rx * s * f, ry * s * f, (42, 38, 36))
    ux, uy = P(-10, 22)
    cv.ell(ux, uy, 8 * s * f, 5 * s * f, (230, 170, 166))
    hx, hy = P(60, -6 + graze * 26)
    cv.line([P(40, -8), (hx, hy)], body, 18 * s * f)
    cv.ell(hx, hy, 15 * s * f, 13 * s * f, (46, 42, 40))
    mx, my = hx + face * 9 * s * f, hy + 7 * s * f
    cv.ell(mx, my, 9 * s * f, 7 * s * f, (226, 172, 162))
    cv.ell(hx - face * 9 * s * f, hy - 11 * s * f, 7 * s * f, 3.5 * s * f, (46, 42, 40))
    cv.line([(hx - face * 3 * s * f, hy - 11 * s * f), (hx - face * 1 * s * f, hy - 19 * s * f)], (236, 226, 196), 3 * s * f)
    cv.line([(hx + face * 5 * s * f, hy - 11 * s * f), (hx + face * 8 * s * f, hy - 19 * s * f)], (236, 226, 196), 3 * s * f)
    cv.ell(hx + face * 2 * s * f, hy - 3 * s * f, 2 * s * f, 2 * s * f, (10, 10, 10))
    sw = math.sin(t * 3.1 + ph) * 7
    cv.line([P(-50, -8), P(-56 + sw, 24)], leg, 3 * s * f)
    tx, ty = P(-56 + sw, 26)
    cv.ell(tx, ty, 3.5 * s * f, 5 * s * f, (40, 36, 34))


def draw_sheep(cv, x, y, f, face, t, ph):
    s = sc(y) * 1.05
    cy = y - 30 * s
    def P(dx, dy):
        return (x + dx * s * face * f, cy + dy * s * f)
    cv.ell(x + 10 * s, y + 2 * s, 34 * s * f, 6 * s * f, (0, 0, 0, 60))
    for lx in (-14, -6, 8, 16):
        cv.line([P(lx, 8), P(lx, 30)], (40, 36, 36), 4 * s * f)
    for (dx, dy, rr) in ((-20, 2, 13), (-6, 6, 14), (10, 4, 13), (20, -2, 12), (-14, -8, 14), (2, -10, 15), (16, -10, 12)):
        px, py = P(dx, dy)
        cv.ell(px, py + 2 * s * f, rr * s * f, rr * s * f, (214, 210, 200))
        cv.ell(px - 1.5 * s * f, py, rr * s * f * 0.92, rr * s * f * 0.92, (246, 244, 236))
    bob = 6 * smooth(0.5 + math.sin(t * 1.1 + ph))
    hx, hy = P(30, -6 + bob)
    cv.ell(hx, hy, 9 * s * f, 11 * s * f, (44, 40, 42))
    cv.ell(hx - face * 7 * s * f, hy - 6 * s * f, 6 * s * f, 3 * s * f, (44, 40, 42))
    cv.ell(hx + face * 3 * s * f, hy - 3 * s * f, 1.6 * s * f, 1.6 * s * f, (230, 230, 230))


def draw_chicken(cv, x, y, f, face, t, ph):
    s = sc(y) * 1.2
    peck = max(0.0, math.sin(t * 3.5 + ph)) ** 4
    cv.ell(x + 4 * s, y + 1 * s, 12 * s * f, 3 * s * f, (0, 0, 0, 60))
    cv.line([(x - 2 * s * f, y - 8 * s * f), (x - 3 * s * f, y)], (230, 170, 60), 1.8 * s * f)
    cv.line([(x + 3 * s * f, y - 8 * s * f), (x + 3 * s * f, y)], (230, 170, 60), 1.8 * s * f)
    body = (244, 238, 228) if ph < 3 else (176, 100, 52)
    cv.poly([(x - face * 8 * s * f, y - 16 * s * f), (x - face * 16 * s * f, y - 26 * s * f), (x - face * 4 * s * f, y - 20 * s * f)], shade(body, 0.85))
    cv.ell(x, y - 15 * s * f, 11 * s * f, 8.5 * s * f, body)
    hx = x + face * (9 + 5 * peck) * s * f
    hy = y - (24 - 14 * peck) * s * f
    cv.ell(hx, hy, 5 * s * f, 5 * s * f, body)
    cv.ell(hx, hy - 5 * s * f, 3 * s * f, 2.5 * s * f, (220, 40, 40))
    cv.poly([(hx + face * 4 * s * f, hy - 1 * s * f), (hx + face * 9 * s * f, hy + 1 * s * f), (hx + face * 4 * s * f, hy + 2 * s * f)], (240, 180, 50))
    cv.ell(hx + face * 1.5 * s * f, hy - 1 * s * f, 1 * s * f, 1 * s * f, (10, 10, 10))


def draw_dog(cv, x, y, f, face, t, ph):
    s = sc(y) * 1.2
    cv.ell(x + 6 * s, y + 1 * s, 22 * s * f, 4 * s * f, (0, 0, 0, 60))
    c, cd = (176, 120, 70), (120, 80, 50)
    step = math.sin(t * 9)
    for lx, ph2 in ((-12, 0), (-6, 1), (8, 1), (13, 0)):
        o = step * 3 * (1 if ph2 else -1)
        cv.line([(x + lx * s * f * face, y - 12 * s * f), (x + (lx + o) * s * f * face, y)], cd, 3 * s * f)
    cv.ell(x, y - 16 * s * f, 17 * s * f, 7.5 * s * f, c)
    tw = math.sin(t * 14) * 5
    cv.line([(x - face * 16 * s * f, y - 18 * s * f), (x - face * 24 * s * f, y - (28 + tw) * s * f)], c, 3 * s * f)
    hx, hy = x + face * 19 * s * f, y - 25 * s * f
    cv.ell(hx, hy, 8 * s * f, 7 * s * f, c)
    cv.ell(hx + face * 7 * s * f, hy + 2 * s * f, 5 * s * f, 3.5 * s * f, c)
    cv.ell(hx + face * 11 * s * f, hy + 1 * s * f, 1.6 * s * f, 1.6 * s * f, (20, 16, 14))
    cv.ell(hx - face * 3 * s * f, hy - 2 * s * f, 3 * s * f, 6 * s * f, cd)


def draw_duck(cv, x, y, f, t, ph):
    s = sc(y) * 1.4
    wake = rgba((226, 238, 246), 110)
    cv.line([(x - 14 * s, y + 1 * s), (x - 70 * s, y - 7 * s)], wake, 1.6 * s)
    cv.line([(x - 14 * s, y + 3 * s), (x - 70 * s, y + 11 * s)], wake, 1.6 * s)
    cv.ell(x, y + 2 * s, 18 * s * f, 3 * s * f, rgba((30, 60, 90), 70))
    cv.ell(x, y - 4 * s * f, 16 * s * f, 6.5 * s * f, (150, 118, 86))
    cv.poly([(x - 14 * s * f, y - 6 * s * f), (x - 22 * s * f, y - 11 * s * f), (x - 12 * s * f, y - 2 * s * f)], (120, 96, 74))
    cv.ell(x - 2 * s * f, y - 6 * s * f, 8 * s * f, 3.5 * s * f, (196, 176, 150))
    cv.line([(x + 10 * s * f, y - 6 * s * f), (x + 13 * s * f, y - 15 * s * f)], (34, 104, 64), 4 * s * f)
    cv.ell(x + 14 * s * f, y - 17 * s * f, 5.5 * s * f, 5 * s * f, (34, 104, 64))
    cv.ell(x + 20 * s * f, y - 16 * s * f, 4 * s * f, 1.8 * s * f, (240, 170, 50))
    cv.ell(x + 15 * s * f, y - 18 * s * f, 1 * s * f, 1 * s * f, (10, 10, 10))


def draw_bird(cv, x, y, f, t, ph, size):
    w = size * f
    fl = math.sin(t * 10 + ph)
    col = (40, 42, 54)
    tip = y - w * 0.55 * fl
    mid = y - w * 0.12 - w * 0.25 * fl
    cv.line([(x - w, tip), (x - w * 0.45, mid), (x, y)], col, max(1.0, w * 0.16))
    cv.line([(x, y), (x + w * 0.45, mid), (x + w, tip)], col, max(1.0, w * 0.16))
    cv.ell(x, y + w * 0.05, w * 0.16, w * 0.12, col)


def draw_butterfly(cv, x, y, f, t, ph, col):
    s = sc(y) * 1.7 * f
    flap = abs(math.sin(t * 13 + ph))
    ww = 11 * s * (0.2 + 0.8 * flap)
    dk = shade(col, 0.7)
    cv.ell(x - ww * 0.55, y - 5 * s, ww * 0.6, 7 * s, col)
    cv.ell(x + ww * 0.55, y - 5 * s, ww * 0.6, 7 * s, col)
    cv.ell(x - ww * 0.4, y + 3 * s, ww * 0.42, 4.5 * s, dk)
    cv.ell(x + ww * 0.4, y + 3 * s, ww * 0.42, 4.5 * s, dk)
    cv.line([(x, y - 8 * s), (x, y + 6 * s)], (40, 30, 30), 1.6 * s)


def draw_bee(cv, x, y, f, t, ph):
    s = sc(y) * 2.0 * f
    fl = math.sin(t * 60 + ph) * 1.5 * s
    cv.ell(x - 2 * s, y - 5 * s - fl, 3.5 * s, 2.6 * s, (255, 255, 255, 170))
    cv.ell(x + 2 * s, y - 5 * s + fl, 3.5 * s, 2.6 * s, (255, 255, 255, 170))
    cv.ell(x, y, 5.2 * s, 3.5 * s, (238, 186, 40))
    cv.line([(x - 1.5 * s, y - 3 * s), (x - 1.5 * s, y + 3 * s)], (30, 24, 20), 1.3 * s)
    cv.line([(x + 1.6 * s, y - 3 * s), (x + 1.6 * s, y + 3 * s)], (30, 24, 20), 1.3 * s)


def draw_fish(cv, t):
    u = (t - 1.0) / 0.95
    if not (0 <= u <= 1):
        return
    x = 470 + 100 * u
    y = 905 - 78 * math.sin(math.pi * u)
    ang = math.atan2(-78 * math.pi * math.cos(math.pi * u), 100)
    s = sc(905) * 1.5
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(16):
        th = 2 * math.pi * i / 16
        px, py = 20 * s * math.cos(th), 6.5 * s * math.sin(th)
        pts.append((x + px * ca - py * sa, y + px * sa + py * ca))
    tail = [(-18, 0), (-30, -9), (-30, 9)]
    cv.poly([(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in [(tp[0] * s, tp[1] * s) for tp in tail]], (120, 150, 170))
    cv.poly(pts, (170, 196, 210))
    cv.ell(x + 12 * s * ca, y + 12 * s * sa - 1.5 * s, 1.5 * s, 1.5 * s, (20, 20, 20))
    for (uu, xx) in ((0.02, 470), (0.98, 570)):
        if abs(u - uu) < 0.16:
            a = 1 - abs(u - uu) / 0.16
            for k in range(6):
                dx = (k - 2.5) * 6
                cv.ell(xx + dx, 905 - a * (10 + 6 * (k % 2)), 2.4, 2.4, rgba((236, 246, 252), 230 * a))
            cv.ring(xx, 905, 10 + 20 * (1 - a), rgba((236, 246, 252), 200 * a), 2)


def draw_poof(cv, x, y, r0, u):
    a = 1 - u
    if u < 0.3:
        b = 1 - u / 0.3
        cv.ell(x, y, r0 * (0.7 + 0.5 * u), r0 * (0.7 + 0.5 * u), rgba((255, 252, 236), 230 * b))
    cv.ring(x, y, r0 * (0.5 + 1.5 * smooth(u)), rgba((255, 255, 255), 220 * a), max(1.0, 3.5 * a))
    for i in range(8):
        ang = i * math.pi / 4 + r0
        d = r0 * (0.3 + 2.1 * smooth(u))
        sx, sy = x + math.cos(ang) * d, y + math.sin(ang) * d * 0.8
        L = (3 + r0 * 0.12) * a + 1
        c = rgba((255, 250, 210), 255 * a)
        cv.line([(sx - L, sy), (sx + L, sy)], c, 1.6)
        cv.line([(sx, sy - L), (sx, sy + L)], c, 1.6)


def draw_animals(cv, t):
    for a in ANIMALS:
        k = a["kind"]
        tv = a["tv"]
        if k == "fish":
            draw_fish(cv, t)
            continue
        if t >= tv + 0.6:
            continue
        if t < tv + 0.12:
            f = 1.0 - smooth((t - tv) / 0.12) if t > tv else 1.0
            f = max(f, 0.001)
            x, y = apos(a, min(t, tv))
            if k == "cow":
                draw_cow(cv, x, y, f, a["face"], t, a["ph"])
            elif k == "sheep":
                draw_sheep(cv, x, y, f, a["face"], t, a["ph"])
            elif k == "chicken":
                draw_chicken(cv, x, y, f, a["face"], t, a["ph"])
            elif k == "dog":
                draw_dog(cv, x, y, f, a["face"], t, a["ph"])
            elif k == "duck":
                draw_duck(cv, x, y, f, t, a["ph"])
            elif k in ("bird", "swallow"):
                draw_bird(cv, x, y, f, t, a["ph"], a.get("size", 9 if k == "swallow" else 12))
            elif k == "butterfly":
                draw_butterfly(cv, x, y, f, t, a["ph"], a["col"])
            elif k == "bee":
                draw_bee(cv, x, y, f, t, a["ph"])
        if t >= tv:
            cx, cy, r0 = animal_center(a, tv)
            draw_poof(cv, cx, cy, max(10, r0), (t - tv) / 0.6)

# ----------------------------------------------------------------------------
# per-frame effects
# ----------------------------------------------------------------------------
_fx = np.random.default_rng(99)
STARS = [(_fx.uniform(0, W), _fx.uniform(0, 540) ** 1.0, _fx.uniform(0.6, 2.0), _fx.uniform(0, 6.3)) for _ in range(170)]
SPARK = [(_fx.uniform(-20, 1100), _fx.uniform(SHORE_FAR + 20, SHORE_NEAR - 10), _fx.uniform(0, 6.3), _fx.uniform(1.5, 3.5)) for _ in range(70)]
FIRES = [(80, 680, 1.4), (260, 650, 1.2), (470, 690, 1.0), (930, 660, 1.3), (1040, 700, 1.0),
         (196, 1380, 1.0), (462, 1520, 1.0), (1010, 1395, 1.1), (330, 1650, 1.2), (742, 1532, 0.8), (900, 1150, 0.9)]
FIRES = [(x, y, z, _fx.uniform(0, 6.3)) for x, y, z in FIRES]
LEAVES = [(_fx.uniform(0, W), _fx.uniform(1000, 1700), _fx.uniform(0, 6.3), _fx.uniform(30, 60), int(_fx.integers(3))) for _ in range(34)]
DUST = [(_fx.uniform(0, 1400), _fx.uniform(1000, 1850), _fx.uniform(120, 260), _fx.uniform(20, 60)) for _ in range(14)]
CELLS = [(_fx.uniform(-20, 1100), _fx.uniform(640, 1030), _fx.uniform(0, 6.3), _fx.uniform(1.5, 4.0), _fx.random()) for _ in range(70)]

def night_mul():
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top = np.array([0.10, 0.14, 0.30], np.float32)
    bot = np.array([0.15, 0.18, 0.30], np.float32)
    return top * (1 - y) + bot * y

NMUL = None

def make_clouds():
    r = np.random.default_rng(55)
    out = []
    for i in range(5):
        w, h = int(r.uniform(300, 460)), 150
        im = Image.new("RGBA", (w, h), (255, 255, 255, 0))
        d = ImageDraw.Draw(im)
        for k in range(9):
            cx = r.uniform(0.15, 0.85) * w
            cy = r.uniform(0.45, 0.7) * h
            rr = r.uniform(0.12, 0.2) * w
            d.ellipse([cx - rr, cy - rr * 0.7, cx + rr, cy + rr * 0.7], fill=(255, 255, 255, 235))
        d.rectangle([0.12 * w, 0.66 * h, 0.88 * w, h], fill=(255, 255, 255, 0))
        im = im.filter(ImageFilter.GaussianBlur(5))
        out.append(dict(img=im, x0=r.uniform(0, W + 400), y=r.uniform(70, 340), v=r.uniform(6, 13)))
    return out

CLOUDS = None

def draw_effects(img, t):
    d = ImageDraw.Draw(img, "RGBA")
    n = night_at(t)
    a, b, k = state_at(t)
    # clouds
    ca = 0.9 * (1 - 0.75 * n) * (1 - 0.6 * weight(t, "y500m"))
    warm = weight(t, "y100") + weight(t, "y500m")
    for c in CLOUDS:
        x = (c["x0"] + c["v"] * t) % (W + 500) - 400
        cim = c["img"]
        if warm > 0 or n > 0:
            arr = np.asarray(cim).astype(np.float32)
            tint = np.array([255, 255, 255], np.float32) * (1 - warm) + np.array([255, 196, 160], np.float32) * warm
            tint = tint * (1 - n) + np.array([70, 80, 110], np.float32) * n
            arr[..., :3] = tint
            arr[..., 3] *= ca
            cim = Image.fromarray(arr.astype(np.uint8))
        elif ca < 0.99:
            arr = np.asarray(cim).copy()
            arr[..., 3] = (arr[..., 3] * ca).astype(np.uint8)
            cim = Image.fromarray(arr)
        img.paste(cim, (int(x), int(c["y"])), cim)
    # river sparkle
    sp = (1 - n) * (1 - weight(t, "y100")) * (1 - weight(t, "y500m"))
    if sp > 0.01:
        for (x, y, ph, sz) in SPARK:
            v = max(0.0, math.sin(t * 2.3 + ph)) ** 10
            if v > 0.02:
                L = sz * 3 * sc(y) * 3
                d.line([(x - L, y), (x + L, y)], fill=rgba((255, 255, 255), 230 * v * sp), width=2)
    # windmill blades
    wf = weight(t, "lush") + weight(t, "y1") + weight(t, "y10") + weight(t, "y100") * 0.0
    if wf > 0.01:
        hx, hy, L = windmill_hub()
        lc = Cv(4, size=(2 * L + 8, 2 * L + 8), off=(hx - L - 4, hy - L - 4), mode="RGBA")
        ang0 = t * 1.4
        col = rgba((236, 230, 216), 255 * wf)
        frame = rgba((110, 84, 62), 255 * wf)
        for i in range(4):
            ang = ang0 + i * math.pi / 2
            ca_, sa_ = math.cos(ang), math.sin(ang)
            px, py = -sa_, ca_
            p0 = (hx + ca_ * L * 0.18, hy + sa_ * L * 0.18)
            p1 = (hx + ca_ * L, hy + sa_ * L)
            wdt = L * 0.2
            lc.poly([p0, p1, (p1[0] + px * wdt, p1[1] + py * wdt), (p0[0] + px * wdt * 0.6, p0[1] + py * wdt * 0.6)], col)
            lc.line([(hx, hy), p1], frame, max(1.0, L * 0.035))
        lc.ell(hx, hy, L * 0.07, L * 0.07, frame)
        bl = lc.down()
        img.paste(bl, (int(hx - L - 4), int(hy - L - 4)), bl)
    # night: stars, moon, lit windows
    if n > 0.01:
        for (x, y, sz, ph) in STARS:
            if y > HOR - 40:
                continue
            tw = 0.6 + 0.4 * math.sin(t * 3 + ph)
            d.ellipse([x - sz, y - sz, x + sz, y + sz], fill=rgba((255, 255, 240), 230 * n * tw))
        mx, my = 860, 200
        for rr, aa in ((120, 18), (80, 30), (50, 50)):
            d.ellipse([mx - rr, my - rr, mx + rr, my + rr], fill=rgba((220, 230, 255), aa * n))
        d.ellipse([mx - 34, my - 34, mx + 34, my + 34], fill=rgba((246, 244, 230), 255 * n))
        for (dx, dy, rr) in ((-10, -8, 7), (9, 6, 5), (-4, 14, 4)):
            d.ellipse([mx + dx - rr, my + dy - rr, mx + dx + rr, my + dy + rr], fill=rgba((214, 212, 200), 255 * n))
        rr_ = np.random.default_rng(3)
        for (x0, y0, x1, y1) in META["windows"]:
            if rr_.random() < 0.22:
                continue
            gx, gy = (x0 + x1) / 2, (y0 + y1) / 2
            gr = (x1 - x0) * 2.4
            d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=rgba((255, 190, 100), 40 * n))
            d.rectangle([x0, y0, x1, y1], fill=rgba((255, 216, 130), 255 * n))
    # falling leaves (10 years)
    lf = weight(t, "y10")
    if lf > 0.01:
        cols = ((196, 120, 46), (176, 90, 40), (214, 168, 70))
        for (x0, y0, ph, sp_, ci) in LEAVES:
            yy = y0 + ((t * sp_ + ph * 40) % 260)
            xx = x0 + 18 * math.sin(t * 1.7 + ph)
            s = sc(yy) * 1.6
            fa = clamp(1 - ((t * sp_ + ph * 40) % 260) / 260 * 0.4)
            d.ellipse([xx - 5 * s, yy - 2.5 * s, xx + 5 * s, yy + 2.5 * s], fill=rgba(cols[ci], 230 * lf * fa))
    # wildfire
    ff = weight(t, "y100") * ramp(t, 36.4, 37.8)
    if ff > 0.01:
        for (x, y, z, ph) in FIRES:
            s = sc(y) * z * 1.6
            for kk in range(9):
                age = ((t * 0.32 + kk / 9 + ph) % 1.0)
                sx = x + age * 140 * s + 14 * s * math.sin(t + kk)
                sy = y - 40 * s - age * 520 * s
                rr = (24 + age * 120) * s
                d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=rgba((74, 66, 62), 120 * (1 - age) * ff))
        for (x, y, z, ph) in FIRES:
            s = sc(y) * z * 1.6
            for gr, ga in ((80 * s, 12), (50 * s, 16), (28 * s, 22)):
                d.ellipse([x - gr, y - gr * 0.9, x + gr, y + gr * 0.35], fill=rgba((255, 150, 50), ga * ff))
            for j in range(5):
                fl = 0.75 + 0.35 * math.sin(t * 13 + ph + j * 1.7) + 0.15 * math.sin(t * 29 + j)
                bx = x + (j - 2) * 11 * s
                hh = (46 + 18 * (2 - abs(j - 2))) * s * fl
                ww = 11 * s
                d.polygon([(bx - ww, y), (bx + ww, y), (bx + ww * 0.4, y - hh * 0.6), (bx + 2 * s * math.sin(t * 9 + j), y - hh)], fill=rgba((248, 116, 30), 230 * ff))
                d.polygon([(bx - ww * 0.55, y), (bx + ww * 0.55, y), (bx + 1 * s * math.sin(t * 11 + j), y - hh * 0.6)], fill=rgba((255, 214, 90), 240 * ff))
            for e in range(5):
                age = (t * 0.7 + e * 0.2 + ph) % 1.0
                ex = x + 30 * s * math.sin(e * 2.1 + t * 2) + age * 40 * s
                ey = y - age * 260 * s
                d.ellipse([ex - 1.6, ey - 1.6, ex + 1.6, ey + 1.6], fill=rgba((255, 190, 90), 255 * (1 - age) * ff))
    # dust wisps (1,000 years)
    df = weight(t, "y1000")
    if df > 0.01:
        for (x0, y, rx, sp_) in DUST:
            x = (x0 + sp_ * t) % 1500 - 200
            s = sc(y)
            d.ellipse([x - rx * s * 1.6, y - 16 * s, x + rx * s * 1.6, y + 16 * s], fill=rgba((230, 214, 176), 46 * df))
    # glowing cells in the young sea
    cf = weight(t, "y500m") * ramp(t, 63.6, 66.0)
    if cf > 0.01:
        for (x0, y0, ph, sz, kind) in CELLS:
            x = x0 + 14 * math.sin(t * 0.6 + ph) + 6 * t
            y = y0 + 6 * math.sin(t * 0.9 + ph * 2)
            s = 0.6 + sc(y)
            gr = sz * 4 * s
            d.ellipse([x - gr, y - gr * 0.6, x + gr, y + gr * 0.6], fill=rgba((120, 255, 220), 50 * cf))
            d.ellipse([x - sz * s, y - sz * s * 0.7, x + sz * s, y + sz * s * 0.7], fill=rgba((200, 255, 240), 230 * cf))
            if kind > 0.6:
                d.line([(x - sz * s, y), (x - sz * s * 3, y + 3 * math.sin(t * 8 + ph))], fill=rgba((180, 255, 230), 200 * cf), width=1)


def cv_overlay_animals(img, t):
    if t > T_V + 1.2:
        if 0.9 < t < 2.1:
            pass
        return
    cv = Cv(2, mode="RGBA")
    draw_animals(cv, t)
    ov = cv.down()
    img.paste(ov, (0, 0), ov)

# ----------------------------------------------------------------------------
# text
# ----------------------------------------------------------------------------
FONTDIR = "/usr/share/fonts/truetype/liberation/"
def font(name, sz):
    return ImageFont.truetype(FONTDIR + name, sz)

FT = None
_TC = {}

def init_fonts():
    global FT
    FT = dict(
        title=font("LiberationSerif-Regular.ttf", 80),
        cap=font("LiberationSerif-Italic.ttf", 47),
        num=font("LiberationSerif-Regular.ttf", 78),
        pop=font("LiberationSerif-Regular.ttf", 56),
        lbl=font("LiberationSans-Regular.ttf", 22),
        jump=font("LiberationSerif-Regular.ttf", 150),
        jumpu=font("LiberationSans-Regular.ttf", 34),
        out=font("LiberationSerif-Italic.ttf", 64),
    )

def text_sprite(txt, fkey, track=0, blur=6, shadow_a=0.75):
    key = (txt, fkey, track, blur)
    if key in _TC:
        return _TC[key]
    if len(_TC) > 600:
        _TC.clear()
    f = FT[fkey]
    if track:
        ws = [f.getlength(ch) for ch in txt]
        tw = int(sum(ws) + track * (len(txt) - 1)) + 2
    else:
        tw = int(f.getlength(txt)) + 2
    asc, desc = f.getmetrics()
    th = asc + desc
    pad = blur * 3 + 6
    lay = Image.new("L", (tw + 2 * pad, th + 2 * pad), 0)
    dd = ImageDraw.Draw(lay)
    if track:
        x = pad
        for ch, wch in zip(txt, ws):
            dd.text((x, pad), ch, font=f, fill=255)
            x += wch + track
    else:
        dd.text((pad, pad), txt, font=f, fill=255)
    sh = lay.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(min(255, v * 1.6 * shadow_a)))
    out = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    shimg = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    shimg.putalpha(sh)
    out.alpha_composite(shimg, (0, 3))
    white = Image.new("RGBA", lay.size, (255, 255, 255, 0))
    white.putalpha(lay)
    out.alpha_composite(white)
    _TC[key] = (out, pad, tw, th)
    return _TC[key]

def put_text(img, txt, fkey, x, y, anchor="l", alpha=1.0, track=0, blur=6):
    if alpha <= 0.01 or not txt:
        return
    spr, pad, tw, th = text_sprite(txt, fkey, track, blur)
    if alpha < 0.999:
        spr = spr.copy()
        spr.putalpha(spr.getchannel("A").point(lambda v: int(v * alpha)))
    if anchor == "c":
        x = x - tw / 2
    img.paste(spr, (int(x - pad), int(y - pad)), spr)

def wrap(txt, fkey, maxw):
    f = FT[fkey]
    words, lines, cur = txt.split(), [], ""
    for w_ in words:
        t2 = (cur + " " + w_).strip()
        if f.getlength(t2) > maxw and cur:
            lines.append(cur)
            cur = w_
        else:
            cur = t2
    if cur:
        lines.append(cur)
    return lines

def draw_text(img, t):
    # title
    t0, t1, txt = TITLE
    a = ramp(t, t0, t0 + 0.5) * (1 - ramp(t, t1 - 0.4, t1))
    for i, line in enumerate(txt.split("\n")):
        put_text(img, line, "title", W / 2, 150 + i * 92, "c", a, blur=8)
    # counter
    ca = ramp(t, 0.2, 0.7) * (1 - ramp(t, 69.3, 69.9))
    c = counter(t)
    if c and ca > 0.01:
        lbl, num, unit = c
        put_text(img, lbl, "lbl", 64, 868, "l", ca * 0.95, track=4, blur=4)
        put_text(img, num, "pop" if lbl.startswith("ANIMALS") else "num", 58, 896, "l", ca, blur=6)
        if unit:
            put_text(img, unit, "lbl", 64, 988, "l", ca * 0.95, track=4, blur=4)
    # captions
    for (c0, c1, txt) in CAPS:
        if c0 - 0.1 <= t <= c1 + 0.1:
            a = ramp(t, c0, c0 + 0.45) * (1 - ramp(t, c1 - 0.35, c1))
            for i, line in enumerate(wrap(txt, "cap", 900)):
                put_text(img, line, "cap", W / 2, 1048 + i * 58, "c", a, blur=7)
    # big time jumps
    for (j0, j1, big, unit) in JUMPS:
        if j0 <= t <= j1 + 0.8:
            a = ramp(t, j0 + 0.05, j0 + 0.45) * (1 - ramp(t, j1 + 0.2, j1 + 0.8))
            put_text(img, big, "jump", W / 2, 520, "c", a, blur=10)
            put_text(img, unit, "jumpu", W / 2 + 4, 700, "c", a, track=10, blur=5)
            d = ImageDraw.Draw(img, "RGBA")
            d.line([(W / 2 - 34, 752), (W / 2 + 34, 752)], fill=rgba((255, 255, 255), 230 * a), width=3)
    # outro
    o0, o1, txt = OUTRO
    if t >= o0:
        a = ramp(t, o0 + 0.3, o0 + 1.0)
        put_text(img, txt, "out", W / 2, 880, "c", a, blur=8)

# ----------------------------------------------------------------------------
# frame assembly
# ----------------------------------------------------------------------------
SA = {}
META = {}

def init(names=None):
    global NMUL, CLOUDS, META
    init_fonts()
    NMUL = night_mul()
    CLOUDS = make_clouds()
    for name in (names or STATES.keys()):
        arr, meta = render_state(name, collect=(name == "lush"))
        SA[name] = arr
        if name == "lush":
            META = meta
        print("state", name, "ready", flush=True)


def flash_at(t):
    a = 0.0
    for (j0, j1, _, _) in JUMPS:
        if j0 <= t <= j1:
            u = (t - j0) / (j1 - j0)
            a = max(a, 0.82 * math.sin(math.pi * u) ** 1.5)
    return a


def render_frame(fi):
    t = fi / FPS
    a, b, k = state_at(t)
    n = night_at(t)
    if k <= 0.0005 and n <= 0.0005:
        arr = SA[a]
    else:
        arr = SA[a].astype(np.float32)
        if k > 0.0005:
            arr += (SA[b].astype(np.float32) - arr) * k
        if n > 0.0005:
            arr *= (1 - n) + n * NMUL
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    draw_effects(img, t)
    if t < T_V + 1.2:
        cv_overlay_animals(img, t)
    fl = flash_at(t)
    dk = ramp(t, 69.4, 70.6) * 0.78
    if fl > 0.001 or dk > 0.001:
        x = np.asarray(img).astype(np.float32)
        if fl > 0.001:
            x[..., :3] += (np.array([236, 238, 242], np.float32) - x[..., :3]) * fl
        if dk > 0.001:
            x[..., :3] *= (1 - dk)
        img = Image.fromarray(np.clip(x, 0, 255).astype(np.uint8))
    # slow camera push-in
    z = 1.012 + 0.045 * smooth(t / DUR) + 0.01 * math.sin(t * 0.21)
    cx, cy = W / 2, 980
    bw, bh = W / z, H / z
    box = (cx - bw / 2, cy - bh * (cy / H), cx + bw / 2, cy + bh * (1 - cy / H))
    img = img.resize((W, H), Image.BILINEAR, box=box)
    draw_text(img, t)
    return img.tobytes()

# ----------------------------------------------------------------------------
# audio
# ----------------------------------------------------------------------------
def bandnoise(n, lo, hi, rng):
    x = rng.normal(0, 1, n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 / (1 + ((lo / np.maximum(f, 1)) ** 4)) / (1 + (f / hi) ** 4)
    y = np.fft.irfft(X * g, n)
    return y / (np.abs(y).max() + 1e-9)


class Bus:
    def __init__(self, n):
        self.L = np.zeros(n)
        self.R = np.zeros(n)

    def add(self, t, sig, amp=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0 or i >= len(self.L):
            return
        m = min(len(sig), len(self.L) - i)
        gl = math.cos((clamp(pan, -1, 1) + 1) * math.pi / 4) * 1.414
        gr = math.sin((clamp(pan, -1, 1) + 1) * math.pi / 4) * 1.414
        self.L[i:i + m] += sig[:m] * amp * gl
        self.R[i:i + m] += sig[:m] * amp * gr


def env_keys(n, keys):
    tt = np.arange(n) / SR
    ks = np.array(keys, dtype=np.float64)
    return np.interp(tt, ks[:, 0], ks[:, 1])


def chirp(dur, f0, f1, curve=1.0):
    n = int(SR * dur)
    u = np.arange(n) / n
    f = f0 + (f1 - f0) * u ** curve
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * u) ** 2
    return (np.sin(ph) + 0.12 * np.sin(2 * ph)) * env


def voiced(dur, f0fn, formants, n_h=24, breath=0.0, rng=None):
    n = int(SR * dur)
    tt = np.arange(n) / SR
    f0 = f0fn(tt / dur)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    sig = np.zeros(n)
    for h in range(1, n_h + 1):
        fh = f0 * h
        amp = 1.0 / h ** 0.7
        g = 0.08
        for (F, B, A) in formants:
            g = g + A * np.exp(-((fh - F) / B) ** 2)
        sig += amp * g * np.sin(h * ph) * (fh < SR / 2.2)
    if breath and rng is not None:
        sig += bandnoise(n, 300, 4000, rng) * breath * np.abs(sig).max()
    return sig / (np.abs(sig).max() + 1e-9)


def adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    na, nr = min(na, n), min(nr, n)
    e[:na] = np.linspace(0, 1, na)
    e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def build_audio(path):
    n = int(SR * (DUR + 0.5))
    rng = np.random.default_rng(12)
    nat = Bus(n)    # living world (cut when animals vanish)
    amb = Bus(n)    # wind, water, fire, ocean
    mus = Bus(n)    # music (gets reverb)
    fx = Bus(n)     # transitions / pings (gets reverb)
    tt = np.arange(n) / SR

    # --- nature: birdsong, bees, grasshoppers, farm animals --------------------------
    for bird in range(6):
        pan = rng.uniform(-0.9, 0.9)
        base = rng.uniform(2400, 4800)
        t = rng.uniform(0, 0.5)
        while t < T_V + 0.3:
            m = int(rng.integers(3, 9))
            style = rng.integers(3)
            for j in range(m):
                if style == 0:
                    sig = chirp(rng.uniform(0.05, 0.11), base * rng.uniform(0.9, 1.3), base * rng.uniform(0.6, 1.5), 0.7)
                elif style == 1:
                    sig = chirp(0.035, base * 1.4, base * 0.8)
                else:
                    sig = chirp(rng.uniform(0.08, 0.16), base * 0.8, base * 1.6, 2.0)
                nat.add(t, sig, rng.uniform(0.04, 0.08), pan)
                t += len(sig) / SR + rng.uniform(0.02, 0.08)
            t += rng.uniform(0.35, 1.1)
    # bees
    for (f0, pan0) in ((212, -0.3), (236, 0.4), (198, 0.1)):
        nn = int(SR * (T_V + 0.6))
        u = np.arange(nn) / SR
        f = f0 * (1 + 0.03 * np.sin(2 * np.pi * 0.7 * u) + 0.01 * np.sin(2 * np.pi * 5.3 * u))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = sum(np.sin(h * ph) / h for h in range(1, 14))
        sig *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.37 * u + pan0) ** 2
        nat.add(0, sig / np.abs(sig).max(), 0.035, pan0)
    # grasshoppers
    gh = bandnoise(int(SR * (T_V + 0.6)), 4500, 8000, rng)
    u = np.arange(len(gh)) / SR
    gate = (np.sin(2 * np.pi * 28 * u) > 0.3) * (np.sin(2 * np.pi * 0.9 * u) > -0.2)
    nat.add(0, gh * gate, 0.022, 0.5)
    nat.add(0.37, gh * np.roll(gate, 3000), 0.016, -0.6)
    # cow moos
    for (t0, pan, dur) in ((0.55, 0.45, 1.6), (2.25, 0.6, 1.3)):
        sig = voiced(dur, lambda u: 92 + 52 * np.sin(np.pi * np.clip(u * 1.2, 0, 1)) ** 0.8 - 20 * u,
                     [(380, 160, 1.2), (720, 200, 1.0), (2400, 500, 0.15)], 30, 0.04, rng)
        sig *= adsr(len(sig), 0.12, 0.35)
        nat.add(t0, sig, 0.16, pan)
    # sheep
    sig = voiced(0.85, lambda u: 290 * (1 + 0.05 * np.sin(2 * np.pi * 7.5 * u * 0.85)) - 30 * u,
                 [(800, 220, 1.0), (1300, 260, 0.8), (2600, 400, 0.3)], 20, 0.1, rng)
    sig *= adsr(len(sig), 0.04, 0.25)
    nat.add(1.55, sig, 0.1, 0.75)
    # duck quacks
    for t0 in (0.25, 0.45, 1.95, 2.12, 2.3):
        sig = voiced(0.16, lambda u: 260 - 40 * u, [(1050, 220, 1.4), (2100, 300, 0.8)], 30, 0.25, rng)
        sig *= adsr(len(sig), 0.008, 0.07)
        nat.add(t0, sig, 0.08, -0.45)
    # hens
    for t0 in np.arange(0.2, T_V, 0.47):
        sig = voiced(0.07, lambda u: 420 + 80 * u, [(1500, 300, 1.0)], 14, 0.2, rng) * adsr(int(SR * 0.07), 0.005, 0.04)
        nat.add(t0 + rng.uniform(0, 0.15), sig, 0.035, -0.35)
    # dog barks
    for t0 in (1.2, 1.45):
        sig = voiced(0.14, lambda u: 380 - 120 * u, [(900, 300, 1.2), (1800, 400, 0.6)], 18, 0.4, rng) * adsr(int(SR * 0.14), 0.005, 0.08)
        nat.add(t0, sig, 0.07, 0.15)
    # gate the living world at the vanish moment
    g = np.clip(1 - (tt - (T_V + 0.32)) / 0.18, 0, 1)
    nat.L *= g
    nat.R *= g

    # --- vanish: shimmer pings, rising swell, sub drop ---------------------------------
    for a in ANIMALS:
        if a["kind"] == "fish":
            continue
        x, y, _ = animal_center(a, a["tv"])
        fr = rng.uniform(1600, 3400)
        nn = int(SR * 0.5)
        u = np.arange(nn) / SR
        sig = (np.sin(2 * np.pi * fr * u) + 0.4 * np.sin(2 * np.pi * fr * 1.5 * u)) * np.exp(-u * 10)
        fx.add(a["tv"], sig, 0.022, (x / W) * 2 - 1)

    def swell(t_end, dur, amp):
        nn = int(SR * dur)
        sig = bandnoise(nn, 200, 7000, rng)
        u = np.linspace(0, 1, nn)
        fx.add(t_end - dur, sig * u ** 3, amp, 0.0)

    def boom(t0, amp, f0=70):
        nn = int(SR * 2.4)
        u = np.arange(nn) / SR
        f = f0 * np.exp(-u * 0.9) + 26
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = np.sin(ph) * np.exp(-u * 2.2) + bandnoise(nn, 30, 400, rng) * np.exp(-u * 6) * 0.5
        fx.add(t0, sig, amp, 0.0)

    swell(T_V, 1.1, 0.07)
    boom(T_V + 0.02, 0.32)
    for (j0, j1, _, _) in JUMPS:
        mid = (j0 + j1) / 2
        swell(mid, 1.2, 0.08)
        boom(mid, 0.3, 60)

    # --- ambience beds --------------------------------------------------------------
    wind = bandnoise(n, 70, 1100, rng)
    wind2 = np.roll(bandnoise(n, 70, 1100, rng), 5000)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * tt) * np.sin(2 * np.pi * 0.023 * tt + 1)
    we = env_keys(n, [(0, 0.3), (T_V, 0.3), (T_V + 0.6, 0.55), (12.5, 0.55), (13.2, 0.35), (17.8, 0.35), (18.6, 0.55),
                      (36, 0.6), (37, 0.75), (42, 0.75), (43, 1.15), (48, 1.15), (49.4, 0.75), (55, 0.7), (56.4, 0.55),
                      (62, 0.55), (63.4, 0.35), (DUR, 0.25)])
    amb.L += wind * lfo * we * 0.06
    amb.R += wind2 * lfo * we * 0.06
    whis = bandnoise(n, 520, 880, rng) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * tt) ** 2)
    whe = env_keys(n, [(0, 0), (42.3, 0), (43.5, 1), (47.6, 1), (48.6, 0), (DUR, 0)])
    amb.L += whis * whe * 0.03
    amb.R += np.roll(whis, 7000) * whe * 0.03
    water = bandnoise(n, 400, 6000, rng)
    wae = env_keys(n, [(0, 0.7), (T_V, 0.7), (T_V + 0.5, 0.9), (36, 0.9), (37, 0.5), (42, 0.5), (43, 0.35),
                       (48, 0.35), (49.4, 0.6), (62, 0.6), (63.4, 0), (DUR, 0)])
    amb.L += water * wae * 0.016
    amb.R += np.roll(water, 9000) * wae * 0.016
    # wildfire roar + crackle
    fe = env_keys(n, [(0, 0), (36.4, 0), (37.6, 1), (41.6, 1), (42.6, 0), (DUR, 0)])
    roar = bandnoise(n, 40, 500, rng)
    amb.L += roar * fe * 0.09
    amb.R += np.roll(roar, 4000) * fe * 0.09
    t = 36.4
    while t < 42.6:
        t += rng.exponential(1 / 45)
        nn = int(SR * rng.uniform(0.002, 0.01))
        cr = bandnoise(max(nn, 64), 800, 9000, rng) * np.exp(-np.arange(max(nn, 64)) / (nn / 4 + 1))
        amb.add(t, cr, 0.25 * rng.lognormal(-1.2, 0.7) * float(np.interp(t, [36.4, 37.6, 41.6, 42.6], [0, 1, 1, 0])), rng.uniform(-0.8, 0.8))
    # ocean
    oe = env_keys(n, [(0, 0), (62.3, 0), (63.6, 1), (DUR, 0.8)])
    waves = (0.25 + 0.75 * (0.5 + 0.5 * np.sin(2 * np.pi * tt / 6.0 - 1.5)) ** 3)
    surf = bandnoise(n, 120, 5000, rng)
    amb.L += surf * waves * oe * 0.07
    amb.R += np.roll(surf, 6000) * np.roll(waves, int(SR * 0.4)) * oe * 0.07
    # distant church bell in the silent night
    for (t0, a) in ((13.9, 0.06), (16.2, 0.045)):
        nn = int(SR * 4.5)
        u = np.arange(nn) / SR
        f0 = 196.0
        sig = sum(A * np.sin(2 * np.pi * f0 * r_ * u) * np.exp(-u * d_) for (r_, A, d_) in
                  ((0.5, 0.6, 0.6), (1.0, 1.0, 0.9), (1.19, 0.5, 1.4), (1.5, 0.45, 1.6), (2.0, 0.35, 2.0), (2.74, 0.2, 3.0)))
        sig *= np.clip(u / 0.004, 0, 1)
        fx.add(t0, sig / np.abs(sig).max(), a, -0.4)

    # --- music: slow pad + soft plucked arpeggio -------------------------------------
    A_, F_, C_, G_, D_, E_, Bb = ([45, 57, 64, 69, 72], [41, 53, 60, 65, 69], [48, 55, 64, 67, 72],
                                  [43, 55, 62, 67, 71], [38, 50, 57, 62, 65], [40, 52, 59, 64, 68], [46, 53, 62, 65, 70])
    prog = []
    def section(t0, t1, chords):
        d = (t1 - t0) / len(chords)
        for i, ch in enumerate(chords):
            prog.append((t0 + i * d, d, ch))
    section(4.0, 23.0, [A_, F_, C_, G_])
    section(23.7, 48.0, [D_, A_, F_, E_, D_, A_, Bb, E_])
    section(48.7, 62.0, [F_, C_, A_, G_])
    section(62.7, 69.4, [C_, G_, A_])
    prog.append((69.4, DUR + 0.5 - 69.4, F_[:1] + [53, 60, 65, 69]))
    for (t0, d, ch) in prog:
        nn = int(SR * (d + 2.0))
        u = np.arange(nn) / SR
        for m in ch:
            f = midi(m)
            sig = np.zeros(nn)
            for det in (-0.0035, 0.0, 0.0035):
                sig += np.sin(2 * np.pi * f * (1 + det) * u + rng.uniform(0, 6))
            sig += 0.25 * np.sin(2 * np.pi * 2 * f * u)
            e = np.clip(u / 1.4, 0, 1) * np.clip((d + 2.0 - u) / 2.0, 0, 1)
            amp = 0.018 if m < 50 else 0.012
            mus.add(t0, sig * e, amp, rng.uniform(-0.3, 0.3))
        # arpeggio
        tones = [m + 12 for m in ch[1:]] + [ch[2] + 24]
        step = 0.62 if t0 < 23 else 0.5 if t0 < 48 else 0.62
        ta, i = t0 + 0.2, 0
        while ta < t0 + d - 0.1:
            m = tones[(i * 3) % len(tones)] if i % 4 else tones[0]
            f = midi(m)
            nn2 = int(SR * 2.2)
            u2 = np.arange(nn2) / SR
            sig = (np.sin(2 * np.pi * f * u2) + 0.35 * np.sin(2 * np.pi * 2 * f * u2) * np.exp(-u2 * 4) + 0.1 * np.sin(2 * np.pi * 3 * f * u2) * np.exp(-u2 * 6))
            sig *= np.exp(-u2 * 1.7) * np.clip(u2 / 0.004, 0, 1)
            mus.add(ta, sig, 0.032 * (0.8 + 0.4 * rng.random()), rng.uniform(-0.5, 0.5))
            ta += step
            i += 1
    me = env_keys(n, [(0, 0), (4.0, 0), (5.5, 1), (12.6, 1), (13.4, 0.6), (17.8, 0.6), (18.6, 1), (DUR - 1.5, 1), (DUR, 0)])
    mus.L *= me
    mus.R *= me

    # --- reverb for music + fx --------------------------------------------------------
    nir = int(SR * 2.8)
    u = np.arange(nir) / SR
    irL = rng.normal(0, 1, nir) * np.exp(-u / 0.55)
    irR = rng.normal(0, 1, nir) * np.exp(-u / 0.55)
    irL[: int(SR * 0.01)] = 0
    irR[: int(SR * 0.013)] = 0
    nfft = 1 << int(math.ceil(math.log2(n + nir)))
    def conv(x, ir):
        return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:n]
    wetL = conv(mus.L + fx.L * 0.6, irL)
    wetR = conv(mus.R + fx.R * 0.6, irR)
    sc_ = (np.abs(mus.L).max() + 1e-9) / (np.abs(wetL).max() + 1e-9)
    L = nat.L + amb.L + mus.L + fx.L + wetL * sc_ * 0.45
    R = nat.R + amb.R + mus.R + fx.R + wetR * sc_ * 0.45
    st = np.stack([L, R], 1)[: int(SR * DUR)]
    nfa = int(SR * 0.15)
    st[:nfa] *= np.linspace(0, 1, nfa)[:, None]
    nfo = int(SR * 2.0)
    st[-nfo:] *= np.linspace(1, 0, nfo)[:, None]
    pk = np.abs(st).max() + 1e-9
    st = np.tanh(st / pk * 1.6) / math.tanh(1.6) * 0.9
    pcm = (st * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

# ----------------------------------------------------------------------------
def main():
    if "--frame" in sys.argv:
        tsec = float(sys.argv[sys.argv.index("--frame") + 1])
        init()
        fi = int(round(tsec * FPS))
        Image.frombytes("RGB", (W, H), render_frame(fi)).save(f"preview_{tsec:05.2f}.png")
        return
    if "--sheet" in sys.argv:
        init()
        times = [1.5, 3.55, 6.0, 15.0, 20.0, 23.7, 27.0, 33.0, 39.0, 45.0, 52.0, 59.0, 66.0, 71.0]
        th = []
        for tt_ in times:
            im = Image.frombytes("RGB", (W, H), render_frame(int(round(tt_ * FPS))))
            th.append(im.resize((270, 480), Image.LANCZOS))
        cols = 7
        sheet = Image.new("RGB", (270 * cols, 480 * ((len(th) + cols - 1) // cols)))
        for i, im in enumerate(th):
            sheet.paste(im, ((i % cols) * 270, (i // cols) * 480))
        sheet.save("sheet.png")
        return
    wav = "_audio.wav"
    build_audio(wav)
    print("audio done", flush=True)
    if "--audio" in sys.argv:
        return
    init()
    from multiprocessing import Pool
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", OUT]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for i, fr in enumerate(pool.imap(render_frame, range(NF), chunksize=4)):
            ff.stdin.write(fr)
            if i % 150 == 0:
                print(f"frame {i}/{NF}", flush=True)
    ff.stdin.close()
    ff.wait()
    os.remove(wav)
    print("wrote", OUT)

if __name__ == "__main__":
    main()
