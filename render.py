#!/usr/bin/env python3
"""
Affe isst Steak mit Pommes  -  ASMR
Procedurally rendered 1080p/30fps short with synthesized ASMR audio.

    python3 render.py            -> affe_steak_pommes_asmr.mp4
    python3 render.py --frame 4.6  -> single preview frame (png)
"""
import math, os, sys, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
S = 2                      # supersampling factor (scene is rendered at 4K)
RW, RH = W * S, H * S
FPS = 30
DUR = 24.0
NF = int(FPS * DUR)
OUT = "affe_steak_pommes_asmr.mp4"

# ----------------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------------
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)

def lerp(a, b, t):
    return a + (b - a) * t

def lerp2(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

def norm(v):
    l = math.hypot(v[0], v[1]) or 1.0
    return (v[0] / l, v[1] / l)

def ramp(t, a, b):
    """0 before a, 1 after b, smooth between"""
    return smooth((t - a) / (b - a))

def ell(d, cx, cy, rx, ry, fill, off=(0, 0), s=S):
    ox, oy = off
    d.ellipse([(cx - rx - ox) * s, (cy - ry - oy) * s, (cx + rx - ox) * s, (cy + ry - oy) * s], fill=fill)

def poly(d, pts, fill, off=(0, 0), s=S):
    ox, oy = off
    d.polygon([((x - ox) * s, (y - oy) * s) for x, y in pts], fill=fill)

def pline(d, pts, fill, w, off=(0, 0), s=S):
    ox, oy = off
    d.line([((x - ox) * s, (y - oy) * s) for x, y in pts], fill=fill, width=max(1, int(round(w * s))), joint="curve")

def shade(c, f):
    return tuple(int(clamp(v * f, 0, 255)) for v in c[:3]) + tuple(c[3:])

# ----------------------------------------------------------------------------
# scene layout (world coordinates, 1920x1080)
# ----------------------------------------------------------------------------
TABLE_Y = 700
PLATE = (960, 878, 410, 128)            # cx, cy, rx, ry
HEAD0 = (960, 425)
SHOULDER_L = (765, 655)
SHOULDER_R = (1155, 655)
REST_L = (470, 935)
REST_R = (1450, 935)
FUR = (78, 50, 33)
FUR_DARK = (44, 27, 18)
FUR_LIGHT = (128, 86, 56)
SKIN = (216, 163, 124)
SKIN_DARK = (176, 120, 88)
HAND = (66, 46, 37)

def light_factor(x, y, cx, cy, R):
    lx, ly = cx - 0.45 * R, cy - 0.55 * R
    d = math.hypot(x - lx, y - ly) / (1.7 * R)
    return clamp(1.22 - 0.8 * d, 0.45, 1.25)

# ----------------------------------------------------------------------------
# fries
# ----------------------------------------------------------------------------
def make_fries():
    r = np.random.default_rng(11)
    fries = []
    for i in range(30):
        cx = 1170 + r.normal(0, 62)
        cy = 852 + r.normal(0, 30)
        a = r.uniform(-0.9, 0.9) + (math.pi if r.random() < 0.5 else 0)
        fries.append(dict(c=(cx, cy), a=a, L=r.uniform(105, 160), w=r.uniform(19, 24), seed=int(r.integers(1e9))))
    fries.sort(key=lambda f: f["c"][1])
    # three hero fries on top of the pile, grip end pointing up/right toward the right hand
    hero = [
        dict(c=(1135, 872), a=math.radians(196), L=150, w=23, seed=101),
        dict(c=(1215, 846), a=math.radians(160), L=146, w=22, seed=202),
        dict(c=(1165, 905), a=math.radians(186), L=154, w=23, seed=303),
    ]
    return fries, hero

FRIES, HERO = make_fries()

def draw_fry(d, c, a, L, wd, seed, bitten=False, shadow=True, off=(0, 0)):
    if L < 4:
        return
    r = np.random.default_rng(seed)
    u = (math.cos(a), math.sin(a))
    n = (-u[1], u[0])
    def rect(cc, LL, ww, du=0.0, dn=0.0):
        c2 = (cc[0] + u[0] * du + n[0] * dn, cc[1] + u[1] * du + n[1] * dn)
        hl, hw = LL / 2, ww / 2
        return [(c2[0] + u[0] * sx * hl + n[0] * sy * hw, c2[1] + u[1] * sx * hl + n[1] * sy * hw)
                for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    if shadow:
        poly(d, rect((c[0] + 5, c[1] + 8), L + 4, wd + 4), (25, 12, 5, 70), off)
    poly(d, rect(c, L, wd), (168, 98, 28), off)                              # crust edge
    poly(d, rect(c, L - 3, wd * 0.74), (222, 154, 56), off)                  # body
    lightside = -1 if (n[1] > 0) else 1                                       # highlight faces up
    poly(d, rect(c, L - 10, wd * 0.26, dn=lightside * wd * 0.14), (250, 212, 122), off)
    poly(d, rect(c, L - 22, wd * 0.08, dn=lightside * wd * 0.2), (255, 238, 180), off)
    # browned tips
    for s in (-1, 1):
        if bitten and s == 1:
            continue
        poly(d, rect(c, 9, wd * 0.96, du=s * (L / 2 - 4.5)), (150, 82, 22), off)
    # crispy speckles + salt
    for k in range(int(L / 14)):
        t = r.uniform(-0.45, 0.45) * L
        sd = r.uniform(-0.35, 0.35) * wd
        p = (c[0] + u[0] * t + n[0] * sd, c[1] + u[1] * t + n[1] * sd)
        ell(d, p[0], p[1], 1.4, 1.4, (170, 100, 30), off)
    for k in range(int(L / 22)):
        t = r.uniform(-0.45, 0.45) * L
        sd = r.uniform(-0.4, 0.4) * wd
        p = (c[0] + u[0] * t + n[0] * sd, c[1] + u[1] * t + n[1] * sd)
        ell(d, p[0], p[1], 1.6, 1.6, (255, 255, 250), off)
    if bitten:
        # jagged bitten end showing the fluffy potato inside
        tip = (c[0] + u[0] * L / 2, c[1] + u[1] * L / 2)
        pts = []
        steps = 7
        for k in range(steps + 1):
            sd = (k / steps - 0.5) * wd * 0.95
            j = (-6 if k % 2 else 2) + r.uniform(-2, 2)
            pts.append((tip[0] + n[0] * sd + u[0] * j, tip[1] + n[1] * sd + u[1] * j))
        back = [(tip[0] - u[0] * 9 + n[0] * sd, tip[1] - u[1] * 9 + n[1] * sd) for sd in (wd * 0.45, -wd * 0.45)]
        poly(d, pts + back, (246, 230, 172), off)
        poly(d, [(p[0] - u[0] * 3, p[1] - u[1] * 3) for p in pts[2:6]] + [back[0]], (255, 244, 205), off)

# ----------------------------------------------------------------------------
# steak piece sprite (sliced, medium rare)
# ----------------------------------------------------------------------------
def make_piece_sprite(frac=1.0):
    pw, ph = 118, 66
    sz = 220
    im = Image.new("RGBA", (sz * S, sz * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = sz / 2
    x0, x1 = c - pw / 2, c - pw / 2 + pw * frac
    y0, y1 = c - ph / 2, c + ph / 2
    r = np.random.default_rng(5)
    # outline with jagged bite edge on the right if bitten
    def shape(inset):
        pts = []
        for k in range(14):
            t = k / 13
            pts.append((lerp(x0, x1, t) + inset * (1 if 0 < t < 1 else 0), y0 + inset + r.uniform(-1.5, 1.5)))
        if frac < 1:
            for k in range(9):
                t = k / 8
                pts.append((x1 - inset + (-7 if k % 2 else 3), lerp(y0, y1, t)))
        else:
            pts += [(x1 - inset, y0 + 10), (x1 - inset + 2, c), (x1 - inset, y1 - 10)]
        for k in range(14):
            t = 1 - k / 13
            pts.append((lerp(x0, x1, t), y1 - inset + r.uniform(-1.5, 1.5)))
        pts += [(x0 + inset, y1 - 10), (x0 + inset - 2, c), (x0 + inset, y0 + 10)]
        return pts
    poly(d, shape(0), (62, 30, 14, 255))          # crust
    poly(d, shape(7), (120, 70, 52, 255))          # grey-brown band
    poly(d, shape(13), (170, 72, 70, 255))         # pink
    poly(d, shape(20), (196, 82, 84, 255))         # deep pink centre
    # fibres + juice gloss
    for k in range(10):
        xx = lerp(x0 + 16, x1 - 14, k / 9)
        pline(d, [(xx, y0 + 16), (xx + 6, y1 - 16)], (150, 60, 58, 255), 1.2)
    pline(d, [(x0 + 22, y0 + 18), (lerp(x0, x1, 0.7), y0 + 15)], (255, 190, 180, 255), 2.5)
    im = im.filter(ImageFilter.GaussianBlur(1.0))
    return im

PIECE_FULL = make_piece_sprite(1.0)
PIECE_HALF = make_piece_sprite(0.55)

def paste_piece(frame, sprite, c, a, off):
    rot = sprite.rotate(-math.degrees(a), resample=Image.BICUBIC, expand=False)
    x = int(round((c[0] - off[0]) * S - rot.width / 2))
    y = int(round((c[1] - off[1]) * S - rot.height / 2))
    frame.paste(rot, (x, y), rot)

PIECE_POS = (1000, 918)
PIECE_ANG = math.radians(-8)

# ----------------------------------------------------------------------------
# static background: room, bokeh, monkey body, table, plate, steak, fries
# ----------------------------------------------------------------------------
def fur_strokes(d, cx, cy, rx, ry, n, base, seed, off=(0, 0), s=S, edge_only=False):
    r = np.random.default_rng(seed)
    for i in range(n):
        th = r.uniform(0, 2 * math.pi)
        rr = r.uniform(0.86, 1.05) if (edge_only or r.random() < 0.55) else math.sqrt(r.random()) * 0.86
        px, py = cx + rx * rr * math.cos(th), cy + ry * rr * math.sin(th)
        dirx, diry = math.cos(th + r.normal(0, 0.35)), math.sin(th + r.normal(0, 0.35)) + 0.35
        dl = math.hypot(dirx, diry)
        L = r.uniform(7, 20)
        f = r.uniform(0.6, 1.45) * light_factor(px, py, cx, cy, max(rx, ry))
        col = shade(base, f) + (255,)
        pline(d, [(px, py), (px + dirx / dl * L, py + diry / dl * L)], col, r.uniform(1.0, 2.2), off, s)

def build_background():
    yy, xx = np.mgrid[0:RH, 0:RW].astype(np.float32) / S
    img = np.zeros((RH, RW, 3), np.float32)
    # dark warm room with spotlight glow
    t = yy / H
    top = np.array([34, 22, 16], np.float32)
    bot = np.array([16, 10, 7], np.float32)
    img[:] = top * (1 - t[..., None]) + bot * t[..., None]
    g = np.exp(-(((xx - 940) / 760) ** 2 + ((yy - 300) / 520) ** 2))
    img += g[..., None] * np.array([70, 44, 26], np.float32)
    # bokeh lights (low res, blurred)
    bk = Image.new("RGB", (W // 4, H // 4), (0, 0, 0))
    bd = ImageDraw.Draw(bk, "RGBA")
    r = np.random.default_rng(3)
    for i in range(26):
        x = r.uniform(0, W / 4); y = r.uniform(10, TABLE_Y / 4 - 20)
        if abs(x - W / 8) < 70 and y > 40:
            continue
        rad = r.uniform(8, 26)
        col = [(255, 170, 80), (255, 200, 120), (255, 140, 60), (230, 190, 150)][int(r.integers(4))]
        a = int(r.uniform(25, 70))
        bd.ellipse([x - rad, y - rad, x + rad, y + rad], fill=col + (a,))
        bd.ellipse([x - rad * 0.8, y - rad * 0.8, x + rad * 0.8, y + rad * 0.8], fill=col + (a // 3,))
    bk = bk.filter(ImageFilter.GaussianBlur(4)).resize((RW, RH), Image.BICUBIC)
    img += np.asarray(bk, np.float32) * 0.9
    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

    # ---- monkey body (behind the table)
    body = Image.new("RGBA", (RW, RH), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    ell(bd, 960, 800, 315, 240, FUR + (255,))
    ell(bd, 960, 560, 120, 70, FUR + (255,))   # neck
    fur_strokes(bd, 960, 800, 315, 240, 9000, FUR, 21)
    ell(bd, 960, 840, 170, 150, shade(FUR, 1.15) + (255,))   # chest, lighter
    fur_strokes(bd, 960, 840, 170, 150, 2500, shade(FUR, 1.12), 22)
    body = body.filter(ImageFilter.GaussianBlur(1.2))
    # body shading
    ba = np.asarray(body, np.float32)
    lf = np.clip(1.15 - 0.85 * np.hypot(xx - 820, yy - 560) / 620, 0.35, 1.2)
    ba[..., :3] *= lf[..., None]
    body = Image.fromarray(np.clip(ba, 0, 255).astype(np.uint8))
    base.paste(body, (0, 0), body)
    del ba

    # ---- table (walnut)
    tb = np.asarray(base, np.float32).copy()
    r2 = np.random.default_rng(9)
    streak = np.asarray(Image.fromarray((r2.random((RH // 6, 14)) * 255).astype(np.uint8)).resize((RW, RH), Image.BICUBIC), np.float32) / 255
    streak2 = np.asarray(Image.fromarray((r2.random((RH // 3, 40)) * 255).astype(np.uint8)).resize((RW, RH), Image.BICUBIC), np.float32) / 255
    grain = 0.55 * streak + 0.45 * streak2
    grain = np.clip((grain - 0.25) / 0.5, 0, 1)
    fine = np.asarray(Image.fromarray((r2.random((RH // 2, RW // 8)) * 255).astype(np.uint8)).resize((RW, RH), Image.BICUBIC), np.float32) / 255
    wood = np.array([92, 54, 32], np.float32)
    wc = wood[None, None, :] * (0.6 + 0.45 * grain[..., None] + 0.08 * (fine[..., None] - 0.5))
    depth = np.clip((yy - TABLE_Y) / (H - TABLE_Y), 0, 1)
    wc *= (0.72 + 0.4 * depth)[..., None]
    spec = np.exp(-(((xx - 980) / 650) ** 2 + ((yy - 780) / 110) ** 2))
    wc += spec[..., None] * np.array([90, 60, 38], np.float32)
    # contact shadow of the monkey body on the table
    sh = np.exp(-np.maximum(yy - TABLE_Y, 0) / 55) * np.exp(-((xx - 960) / 360) ** 6)
    wc *= (1 - 0.6 * sh)[..., None]
    # front edge falloff
    wc *= (1 - 0.35 * np.clip((yy - 1000) / 80, 0, 1))[..., None]
    m = np.clip(yy - TABLE_Y + 0.5, 0, 1)[..., None]
    tb = tb * (1 - m) + wc * m
    # table top edge highlight
    edge = np.exp(-((yy - TABLE_Y - 2) / 2.2) ** 2)
    tb += edge[..., None] * np.array([70, 45, 28], np.float32)
    base = Image.fromarray(np.clip(tb, 0, 255).astype(np.uint8))
    del tb, wc, grain, fine

    # ---- soft shadows under plate
    shl = Image.new("L", (RW // 4, RH // 4), 0)
    sd = ImageDraw.Draw(shl)
    cx, cy, rx, ry = PLATE
    sd.ellipse([(cx - rx + 10) / 2, (cy - ry + 24) / 2, (cx + rx + 30) / 2, (cy + ry + 34) / 2], fill=170)
    shl = shl.filter(ImageFilter.GaussianBlur(14)).resize((RW, RH), Image.BICUBIC)
    base.paste(Image.new("RGB", (RW, RH), (8, 4, 2)), (0, 0), shl)

    # ---- plate (numpy, analytic ellipse)
    bx0, bx1 = int((cx - rx - 4) * S), int((cx + rx + 4) * S)
    by0, by1 = int((cy - ry - 4) * S), int((cy + ry + 4) * S)
    py, px = np.mgrid[by0:by1, bx0:bx1].astype(np.float32) / S
    e = np.sqrt(((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2)
    ang = np.arctan2((py - cy) / ry, (px - cx) / rx)
    pa = np.asarray(base, np.float32)[by0:by1, bx0:bx1].copy()
    col = np.zeros_like(pa)
    white = np.array([238, 233, 224], np.float32)
    rim = (e > 0.76)
    # rim: lit from top-left, darker toward bottom-right
    rimlight = 0.86 + 0.16 * np.cos(ang - math.radians(-130))
    rimprof = 0.9 + 0.12 * np.sin(np.clip((e - 0.76) / 0.24, 0, 1) * math.pi)
    col[:] = white * (rimlight * rimprof)[..., None]
    # inner well
    well = np.clip((0.76 - e) / 0.02, 0, 1)
    wl = 0.97 + 0.04 * np.cos(ang - math.radians(-120)) - 0.12 * np.exp(-((e - 0.72) / 0.05) ** 2) * (0.5 + 0.5 * np.sin(-ang))
    col = col * (1 - well[..., None]) + (white * wl[..., None]) * well[..., None]
    # rim inner crease + outer edge darkening
    col *= (1 - 0.18 * np.exp(-((e - 0.765) / 0.012) ** 2))[..., None]
    col *= (1 - 0.25 * np.clip((e - 0.95) / 0.05, 0, 1))[..., None]
    # specular highlight on rim
    col += (np.exp(-(((ang - math.radians(-125)) / 0.25) ** 2)) * np.exp(-((e - 0.88) / 0.05) ** 2) * 40)[..., None]
    aa = np.clip((1 - e) * rx * S, 0, 1)[..., None]
    pa = pa * (1 - aa) + col * aa
    arr = np.asarray(base, np.float32).copy()
    arr[by0:by1, bx0:bx1] = pa
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    del arr

    d = ImageDraw.Draw(base, "RGBA")

    # ---- steak
    steak_c = (772, 862)
    srx, sry = 178, 70
    rr = np.random.default_rng(4)
    ph = rr.uniform(0, 6, 3)
    pts = []
    for k in range(90):
        th = 2 * math.pi * k / 90
        f = 1 + 0.06 * math.sin(3 * th + ph[0]) + 0.035 * math.sin(5 * th + ph[1]) + 0.02 * math.sin(9 * th + ph[2])
        x = steak_c[0] + srx * f * math.cos(th)
        y = steak_c[1] + sry * f * math.sin(th)
        pts.append((min(x, steak_c[0] + srx * 0.93), y))     # flat cut end on the right
    # shadow + juice
    sl = Image.new("L", (RW // 4, RH // 4), 0)
    ImageDraw.Draw(sl).polygon([((x + 8) * S / 4, (y + 22) * S / 4) for x, y in pts], fill=200)
    sl = sl.filter(ImageFilter.GaussianBlur(6)).resize((RW, RH), Image.BICUBIC)
    base.paste(Image.new("RGB", (RW, RH), (60, 35, 25)), (0, 0), sl)
    d = ImageDraw.Draw(base, "RGBA")
    ell(d, 870, 930, 85, 18, (110, 40, 25, 120))
    ell(d, 860, 927, 50, 9, (200, 120, 100, 70))
    # side (thickness)
    poly(d, [(x, y + 20) for x, y in pts], (52, 25, 12, 255))
    poly(d, [(x, y + 11) for x, y in pts], (82, 40, 20, 255))
    # top surface texture via mask
    mask = Image.new("L", (RW, RH), 0)
    ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in pts], fill=255)
    tex = Image.new("RGB", (RW, RH), (0, 0, 0))
    bb = (int((steak_c[0] - srx * 1.2) * S), int((steak_c[1] - sry * 1.3) * S),
          int((steak_c[0] + srx * 1.2) * S), int((steak_c[1] + sry * 1.4) * S))
    tw, th_ = bb[2] - bb[0], bb[3] - bb[1]
    ty, tx = np.mgrid[0:th_, 0:tw].astype(np.float32) / S
    tx += bb[0] / S; ty += bb[1] / S
    n1 = np.asarray(Image.fromarray((rr.random((th_ // 10, tw // 10)) * 255).astype(np.uint8)).resize((tw, th_), Image.BICUBIC), np.float32) / 255
    n2 = np.asarray(Image.fromarray((rr.random((th_ // 3, tw // 3)) * 255).astype(np.uint8)).resize((tw, th_), Image.BICUBIC), np.float32) / 255
    crust = np.array([128, 66, 30], np.float32)
    lfm = np.clip(1.25 - 0.7 * np.hypot(tx - (steak_c[0] - 80), ty - (steak_c[1] - 50)) / 260, 0.6, 1.3)
    sc_ = crust * (0.7 + 0.45 * n1[..., None] + 0.25 * (n2[..., None] - 0.5)) * lfm[..., None]
    # grill marks
    gm = np.zeros_like(tx)
    for k in range(-4, 5):
        dd = ((tx - steak_c[0]) * 0.45 + (ty - steak_c[1]) * 1.0) - k * 34
        gm = np.maximum(gm, np.exp(-(dd / 6.5) ** 2))
    sc_ *= (1 - 0.72 * gm * (0.75 + 0.5 * n2))[..., None]
    # pink sliced end on the right
    pinkm = np.clip((tx - (steak_c[0] + srx * 0.80)) / 8, 0, 1)
    pink = np.array([188, 78, 78], np.float32) * (0.85 + 0.25 * n1[..., None])
    sc_ = sc_ * (1 - pinkm[..., None]) + pink * pinkm[..., None]
    # glossy butter / fat sheen
    sheen = np.exp(-(((tx - (steak_c[0] - 60)) / 70) ** 2 + ((ty - (steak_c[1] - 28)) / 14) ** 2))
    sc_ += (sheen * (0.5 + n2) * 70)[..., None]
    tex.paste(Image.fromarray(np.clip(sc_, 0, 255).astype(np.uint8)), bb[:2])
    tex = tex.filter(ImageFilter.GaussianBlur(0.8))
    base.paste(tex, (0, 0), mask)
    d = ImageDraw.Draw(base, "RGBA")
    # herb butter + rosemary + flaky salt on the steak
    ell(d, 735, 845, 26, 12, (250, 220, 140, 255))
    ell(d, 731, 842, 18, 7, (255, 238, 180, 255))
    for k in range(9):
        a0 = rr.uniform(0, 6.28)
        ell(d, 735 + 14 * math.cos(a0), 845 + 6 * math.sin(a0), 2.5, 1.5, (60, 110, 40, 255))
    rx0, ry0 = 690, 835
    pline(d, [(rx0, ry0), (rx0 + 120, ry0 + 30)], (70, 60, 30, 255), 3)
    for k in range(16):
        t = k / 15
        x, y = rx0 + 120 * t, ry0 + 30 * t
        for s in (-1, 1):
            pline(d, [(x, y), (x + 6, y + s * 14)], (52, 92, 46, 255), 3.4)
            pline(d, [(x + 1, y), (x + 5, y + s * 11)], (90, 140, 70, 255), 1.4)
    for k in range(60):
        x = steak_c[0] + rr.normal(0, 70); y = steak_c[1] + rr.normal(0, 22)
        ell(d, x, y - 4, rr.uniform(1.2, 2.6), rr.uniform(1.0, 2.0), (255, 252, 245, 230))
    for k in range(60):
        x = steak_c[0] + rr.normal(0, 70); y = steak_c[1] + rr.normal(0, 22)
        ell(d, x, y - 4, 1.2, 1.2, (25, 15, 10, 255))   # cracked pepper

    # ketchup / pepper sauce dollop
    ell(d, 905, 958, 46, 17, (90, 15, 10, 255))
    ell(d, 905, 955, 42, 14, (170, 28, 18, 255))
    ell(d, 897, 950, 22, 6, (230, 90, 70, 255))
    ell(d, 893, 949, 8, 2.5, (255, 200, 190, 255))

    # ---- fries pile (non-hero fries)
    for f in FRIES:
        draw_fry(d, f["c"], f["a"], f["L"], f["w"], f["seed"])
    return base

# ----------------------------------------------------------------------------
# head sprite
# ----------------------------------------------------------------------------
HS_W, HS_H = 560, 470              # world size of head sprite
HS_C = (280, 235)                  # head centre inside the sprite

def build_head():
    im = Image.new("RGBA", (HS_W * S, HS_H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    o = (HEAD0[0] - HS_C[0], HEAD0[1] - HS_C[1])     # draw in world coords relative to HEAD0
    hx, hy = HEAD0
    # ears
    for s in (-1, 1):
        ex = hx + s * 188
        ell(d, ex, hy + 8, 64, 70, FUR_DARK + (255,), o)
        ell(d, ex, hy + 8, 58, 64, (150, 98, 74, 255), o)
        ell(d, ex + s * 4, hy + 12, 38, 44, (196, 128, 104, 255), o)
        ell(d, ex + s * 9, hy + 16, 20, 26, (150, 88, 70, 255), o)
    # head fur
    ell(d, hx, hy, 182, 172, FUR + (255,), o)
    fur_strokes(d, hx, hy, 182, 172, 6500, FUR, 31, o)
    fur_strokes(d, hx, hy - 20, 150, 140, 2500, FUR_LIGHT, 32, o)
    # face mask: two eye discs + muzzle + widow's peak
    fm = shade(SKIN, 0.97) + (255,)
    for s in (-1, 1):
        ell(d, hx + s * 60, hy - 28, 80, 78, fm, o)
    ell(d, hx, hy + 52, 118, 66, fm, o)
    ell(d, hx, hy + 10, 90, 60, fm, o)
    poly(d, [(hx - 26, hy - 118), (hx + 26, hy - 118), (hx, hy - 78)], FUR + (255,), o)
    fur_strokes(d, hx, hy - 105, 30, 22, 200, FUR, 33, o)
    im = im.filter(ImageFilter.GaussianBlur(0.9))
    d = ImageDraw.Draw(im)
    # eye sockets (shadow)
    for s in (-1, 1):
        ell(d, hx + s * 60, hy - 26, 44, 38, (168, 112, 82, 255), o)
        ell(d, hx + s * 60, hy - 24, 38, 33, (150, 98, 72, 255), o)
    # brow ridge
    for s in (-1, 1):
        pts = [(hx + s * (24 + 76 * t), hy - 70 - 16 * math.sin(math.pi * t) + 6 * t) for t in np.linspace(0, 1, 16)]
        pline(d, pts, (160, 108, 80, 255), 14, o)
        pline(d, [(x, y + 2) for x, y in pts], (140, 92, 68, 255), 6, o)
    # nose
    ell(d, hx, hy + 22, 34, 22, (196, 140, 106, 255), o)
    ell(d, hx, hy + 18, 20, 9, (226, 180, 146, 255), o)
    for s in (-1, 1):
        ell(d, hx + s * 14, hy + 34, 9, 6, (52, 28, 20, 255), o)
    # philtrum + muzzle shading
    pline(d, [(hx, hy + 42), (hx, hy + 92)], (186, 128, 96, 255), 4, o)
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    # global shading of the sprite
    a = np.asarray(im, np.float32).copy()
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32) / S
    xx += o[0]; yy += o[1]
    lf = np.clip(1.2 - 0.75 * np.hypot(xx - (hx - 90), yy - (hy - 110)) / 330, 0.5, 1.22)
    a[..., :3] *= lf[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# ----------------------------------------------------------------------------
# timeline
# ----------------------------------------------------------------------------
EVENTS = [
    dict(kind="fry", arm="R", t0=1.5, hero=0),
    dict(kind="fry", arm="R", t0=6.1, hero=1),
    dict(kind="steak", arm="L", t0=10.7),
    dict(kind="fry", arm="R", t0=15.6, hero=2),
]
for ev in EVENTS:
    t0 = ev["t0"]
    ev["open1"] = t0 + 1.45
    ev["bite1"] = t0 + 2.1
    ev["open2"] = t0 + 2.6
    ev["bite2"] = t0 + 3.1
    ev["end"] = t0 + 4.0
    ev["chew_f"] = 2.2 if ev["kind"] == "steak" else 2.7
    ev["chew_len"] = 3.4 if ev["kind"] == "steak" else 2.6
    ev["grab"] = t0 + 0.95
    ev["return"] = t0 + 3.95

def chew_segments():
    segs = []
    for ev in EVENTS:
        segs.append(dict(ts=ev["bite1"] + 0.05, te=ev["open2"] - 0.02, f=ev["chew_f"], A=5.0, kind=ev["kind"]))
        segs.append(dict(ts=ev["bite2"] + 0.05, te=ev["bite2"] + ev["chew_len"], f=ev["chew_f"], A=10.0, kind=ev["kind"]))
    return segs

CHEWS = chew_segments()

def jaw_at(t):
    j = 0.0
    for c in CHEWS:
        if c["ts"] <= t <= c["te"]:
            amp = c["A"] * smooth((t - c["ts"]) / 0.12) * (1 - 0.55 * (t - c["ts"]) / (c["te"] - c["ts"]))
            amp *= smooth((c["te"] - t) / 0.15)
            j += amp * (0.5 - 0.5 * math.cos(2 * math.pi * c["f"] * (t - c["ts"])))
    return j

def open_at(t):
    o = 0.0
    for ev in EVENTS:
        a = ev["open1"]
        o = max(o, ramp(t, a, a + 0.4) * (1 - ramp(t, ev["bite1"] - 0.1, ev["bite1"])))
        b = ev["open2"]
        o = max(o, 0.8 * ramp(t, b, b + 0.33) * (1 - ramp(t, ev["bite2"] - 0.1, ev["bite2"])))
    return o

def chewing_amount(t):
    v = 0.0
    for c in CHEWS:
        if c["ts"] - 0.1 <= t <= c["te"] + 0.3:
            v = max(v, smooth((t - c["ts"] + 0.1) / 0.3) * smooth((c["te"] + 0.3 - t) / 0.4))
    return v

def head_at(t):
    hx, hy = HEAD0
    hx += 5 * math.sin(t * 0.7) + 3 * math.sin(t * 1.9)
    hy += 3 * math.sin(t * 1.1)
    for ev in EVENTS:
        lean = ramp(t, ev["open1"] - 0.2, ev["bite1"] - 0.05) * (1 - ramp(t, ev["bite1"], ev["bite1"] + 0.45))
        lean = max(lean, ramp(t, ev["open2"] - 0.1, ev["bite2"] - 0.05) * (1 - ramp(t, ev["bite2"], ev["bite2"] + 0.5)))
        side = -1 if ev["arm"] == "L" else 1
        hy += 16 * lean
        hx += side * 10 * lean
    hy += jaw_at(t) * 0.35
    # happy end: little head tilt and nod
    hy += 8 * ramp(t, 20.6, 21.6)
    return hx, hy

def mouth_pos(t):
    hx, hy = head_at(t)
    return (hx, hy + 100)

BLINKS = [0.8, 4.9, 9.2, 14.3, 19.4]

def eye_close_at(t):
    c = 0.0
    for b in BLINKS:
        c = max(c, 1 - min(1, abs(t - b) / 0.09))
    c = max(c, 0.5 * chewing_amount(t))
    for ev in EVENTS:
        for bt in (ev["bite1"], ev["bite2"]):
            c = max(c, 0.85 * max(0, 1 - abs(t - bt - 0.05) / 0.25))
    c = max(c, ramp(t, 20.5, 21.0))
    return clamp(c)

# per-arm hand / item state ---------------------------------------------------
U_MOUTH = {"R": norm((-0.38, -1.0)), "L": norm((0.38, -1.0))}

def item_grip_on_plate(ev):
    if ev["kind"] == "fry":
        f = HERO[ev["hero"]]
        u = (math.cos(f["a"]), math.sin(f["a"]))
        return (f["c"][0] - u[0] * (f["L"] / 2 - 18), f["c"][1] - u[1] * (f["L"] / 2 - 18)), f["a"]
    u = (math.cos(PIECE_ANG + math.pi), math.sin(PIECE_ANG + math.pi))
    # grip the right end of the piece; piece points left (toward centre)
    return (PIECE_POS[0] - u[0] * 45, PIECE_POS[1] - u[1] * 45), PIECE_ANG + math.pi

def item_len(ev, t):
    """fry length / piece fraction currently held"""
    if ev["kind"] == "fry":
        L = HERO[ev["hero"]]["L"]
        if t >= ev["bite2"]:
            return 0.0
        if t >= ev["bite1"]:
            return L * 0.5
        return L
    if t >= ev["bite2"]:
        return 0.0
    if t >= ev["bite1"]:
        return 0.55
    return 1.0

def grip_at_mouth(ev, t, Lcur, push=0.0):
    u = U_MOUTH[ev["arm"]]
    m = mouth_pos(t)
    if ev["kind"] == "fry":
        reach = Lcur - 18 + 4 + push
    else:
        reach = 45 + 59 * Lcur - 10 + push
    return (m[0] - u[0] * reach, m[1] - u[1] * reach)

def arm_state(arm, t):
    rest = REST_L if arm == "L" else REST_R
    for ev in EVENTS:
        if ev["arm"] != arm or not (ev["t0"] <= t < ev["end"]):
            continue
        tau = t - ev["t0"]
        gp, a_plate = item_grip_on_plate(ev)
        u_m = U_MOUTH[arm]
        a_m = math.atan2(u_m[1], u_m[0])
        Lfull = item_len(ev, ev["t0"])
        Lhalf = item_len(ev, ev["bite1"] + 0.01)
        holding = ev["grab"] - 0.05 <= t < ev["bite2"]
        Lcur = item_len(ev, t)
        if tau < 0.9:
            g = lerp2(rest, gp, smooth(tau / 0.9))
            # little arc upward while reaching
            g = (g[0], g[1] - 30 * math.sin(math.pi * clamp(tau / 0.9)))
            ang = a_plate
            closed = 0.0
        elif tau < 1.1:
            g = gp; ang = a_plate; closed = smooth((tau - 0.9) / 0.15)
        elif tau < 2.0:
            k = smooth((tau - 1.1) / 0.9)
            ga = grip_at_mouth(ev, t, Lfull, push=-14)
            g = lerp2(gp, ga, k)
            g = (g[0], g[1] - 40 * math.sin(math.pi * k))
            da = (a_m - a_plate + math.pi) % (2 * math.pi) - math.pi
            ang = a_plate + da * smooth((tau - 1.1) / 0.75)
            closed = 1.0
        elif tau < 2.1:
            g = grip_at_mouth(ev, t, Lfull, push=-14 + 14 * smooth((tau - 2.0) / 0.1))
            ang = a_m; closed = 1.0
        elif tau < 3.1:
            # pull back after first bite, then go in for the second
            back = 30 * math.sin(math.pi * clamp((tau - 2.1) / 0.9))
            push = -14 + 14 * smooth((tau - 2.95) / 0.15)
            g = grip_at_mouth(ev, t, Lhalf, push=push - back)
            ang = a_m; closed = 1.0
        else:
            k = smooth((tau - 3.1) / 0.85)
            g0 = grip_at_mouth(ev, ev["bite2"], 0 if ev["kind"] == "fry" else 0.2)
            g = lerp2(g0, rest, k)
            g = (g[0], g[1] - 25 * math.sin(math.pi * k))
            ang = a_m; closed = 1 - k
        return dict(g=g, ang=ang, closed=closed, holding=holding and Lcur > 0, ev=ev, L=Lcur,
                    bitten=t >= ev["bite1"])
    return dict(g=rest, ang=0, closed=0.0, holding=False, ev=None, L=0, bitten=False)

def item_on_plate(ev, t):
    return t < ev["grab"]

# ----------------------------------------------------------------------------
# crumbs
# ----------------------------------------------------------------------------
def make_crumbs():
    out = []
    for i, ev in enumerate(EVENTS):
        for j, bt in enumerate((ev["bite1"], ev["bite2"])):
            r = np.random.default_rng(1000 + i * 10 + j)
            n = 16 if ev["kind"] == "fry" else 9
            for k in range(n):
                out.append(dict(
                    t0=bt + r.uniform(0, 0.08), dx=r.normal(0, 14), dy=r.uniform(5, 18),
                    vx=r.normal(0, 70), vy=r.uniform(-160, 10), land=r.uniform(745, 960),
                    size=r.uniform(1.6, 4.2),
                    col=((236, 190, 96) if r.random() < 0.6 else (190, 120, 40)) if ev["kind"] == "fry"
                        else ((96, 50, 24) if r.random() < 0.6 else (180, 80, 70)),
                    ev=i))
    return out

CRUMBS = make_crumbs()

def draw_crumbs(d, t, off):
    G = 1500.0
    for c in CRUMBS:
        if t < c["t0"]:
            continue
        m = mouth_pos(c["t0"])
        x0, y0 = m[0] + c["dx"], m[1] + c["dy"]
        dt = t - c["t0"]
        # landing time
        A, B, C = 0.5 * G, c["vy"], y0 - c["land"]
        tl = (-B + math.sqrt(B * B - 4 * A * C)) / (2 * A)
        tt = min(dt, tl)
        x = x0 + c["vx"] * tt
        y = y0 + c["vy"] * tt + 0.5 * G * tt * tt
        if dt > tl:  # tiny bounce settle
            y -= 6 * math.exp(-(dt - tl) * 12) * abs(math.sin((dt - tl) * 25))
        s = c["size"]
        ell(d, x + 1.5, y + 2, s, s * 0.6, (20, 10, 5, 80), off)
        ell(d, x, y, s, s * 0.85, c["col"] + (255,), off)

# ----------------------------------------------------------------------------
# arms & hands
# ----------------------------------------------------------------------------
UPPER, FORE = 205, 215

def ik(sh, wr, outward):
    dx, dy = wr[0] - sh[0], wr[1] - sh[1]
    dist = min(math.hypot(dx, dy), UPPER + FORE - 1)
    dist = max(dist, abs(UPPER - FORE) + 1)
    base = math.atan2(dy, dx)
    cosA = (UPPER ** 2 + dist ** 2 - FORE ** 2) / (2 * UPPER * dist)
    A = math.acos(clamp(cosA, -1, 1))
    best = None
    for s in (-1, 1):
        e = (sh[0] + UPPER * math.cos(base + s * A), sh[1] + UPPER * math.sin(base + s * A))
        score = (e[0] - 960) * outward + 0.25 * e[1]
        if best is None or score > best[0]:
            best = (score, e)
    return best[1]

def fuzzy_limb(d, p0, p1, w0, w1, seed, off):
    steps = 10
    for k in range(steps + 1):
        p = lerp2(p0, p1, k / steps); w_ = lerp(w0, w1, k / steps)
        ell(d, p[0], p[1], w_ / 2 + 3, w_ / 2 + 3, FUR_DARK + (255,), off)
    for k in range(steps + 1):
        p = lerp2(p0, p1, k / steps); w_ = lerp(w0, w1, k / steps)
        ell(d, p[0], p[1], w_ / 2, w_ / 2, FUR + (255,), off)
    ux, uy = norm((p1[0] - p0[0], p1[1] - p0[1]))
    nx, ny = -uy, ux
    if ny > 0:
        nx, ny = -nx, -ny
    # light stripe on the upper side
    hl0 = (p0[0] + nx * w0 * 0.22, p0[1] + ny * w0 * 0.22)
    hl1 = (p1[0] + nx * w1 * 0.22, p1[1] + ny * w1 * 0.22)
    pline(d, [hl0, hl1], FUR_LIGHT + (150,), (w0 + w1) * 0.14, off)
    r = np.random.default_rng(seed)
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    for k in range(int(L * 0.9)):
        t = r.random(); sd = r.choice([-1, 1]) * r.uniform(0.35, 0.55) * lerp(w0, w1, t)
        px, py = p0[0] + ux * L * t + nx * sd, p0[1] + uy * L * t + ny * sd
        f = r.uniform(0.6, 1.5)
        sgn = 1 if sd > 0 else -1
        ex, ey = px + nx * sgn * r.uniform(3, 9) + ux * r.uniform(2, 8), py + ny * sgn * r.uniform(3, 9) + uy * r.uniform(2, 8)
        pline(d, [(px, py), (ex, ey)], shade(FUR, f) + (255,), 1.6, off)

def draw_arm(frame, d, arm, st, off, t):
    sh = SHOULDER_L if arm == "L" else SHOULDER_R
    outward = -1 if arm == "L" else 1
    g = st["g"]
    w = norm((g[0] - sh[0], g[1] - sh[1]))
    wrist = (g[0] - w[0] * 46, g[1] - w[1] * 46)
    el = ik(sh, wrist, outward)
    fuzzy_limb(d, sh, el, 80, 66, 7 if arm == "L" else 8, off)
    fuzzy_limb(d, el, wrist, 66, 52, 9 if arm == "L" else 10, off)
    v = norm((wrist[0] - el[0], wrist[1] - el[1]))
    n = (-v[1], v[0])
    palm = (wrist[0] + v[0] * 22, wrist[1] + v[1] * 22)
    closed = st["closed"]
    # palm
    ell(d, palm[0], palm[1], 36, 31, shade(HAND, 0.8) + (255,), off)
    ell(d, palm[0] - 3, palm[1] - 4, 31, 26, HAND + (255,), off)
    ell(d, palm[0] - 8, palm[1] - 9, 14, 9, shade(HAND, 1.35) + (255,), off)
    # held item between palm and fingers
    if st["holding"]:
        ev = st["ev"]
        a = st["ang"]
        u = (math.cos(a), math.sin(a))
        if ev["kind"] == "fry":
            L = st["L"]
            fc = (g[0] + u[0] * (L / 2 - 18), g[1] + u[1] * (L / 2 - 18))
            f = HERO[ev["hero"]]
            draw_fry(d, fc, a, L, f["w"], f["seed"], bitten=st["bitten"], shadow=False, off=off)
        else:
            frac = st["L"]
            spr = PIECE_FULL if frac > 0.9 else PIECE_HALF
            pc = (g[0] + u[0] * 45, g[1] + u[1] * 45)
            # sprite's "front" is +x; when half, shift so bitten end leads
            if frac < 0.9:
                pc = (g[0] + u[0] * 26, g[1] + u[1] * 26)
            paste_piece(frame, spr, pc, a, off)
            d = ImageDraw.Draw(frame, "RGBA")
    # fingers: curled around item when closed, spread on the table when open
    for k, s in enumerate((-1.5, -0.5, 0.5, 1.5)):
        spread = (palm[0] + v[0] * 30 + n[0] * s * 15, palm[1] + v[1] * 30 + n[1] * s * 15)
        curl = (g[0] - v[0] * 2 + n[0] * s * 12, g[1] - v[1] * 2 + n[1] * s * 12)
        p = lerp2(spread, curl, closed)
        rl = lerp(17, 12, closed)
        ell(d, p[0], p[1], rl * 0.72, rl, shade(HAND, 0.75) + (255,), off)
        ell(d, p[0] - 1.5, p[1] - 2.5, rl * 0.6, rl * 0.82, HAND + (255,), off)
        ell(d, p[0] - 3, p[1] - 5, rl * 0.25, rl * 0.25, shade(HAND, 1.4) + (255,), off)
    # thumb
    side = 1 if arm == "R" else -1
    tp = (palm[0] - n[0] * side * 30 + v[0] * 8, palm[1] - n[1] * side * 30 + v[1] * 8)
    ell(d, tp[0], tp[1], 12, 15, shade(HAND, 0.8) + (255,), off)
    ell(d, tp[0] - 1, tp[1] - 2, 9, 12, HAND + (255,), off)
    return d

# ----------------------------------------------------------------------------
# face (dynamic): eyes, mouth, jaw
# ----------------------------------------------------------------------------
def draw_eye(d, cx, cy, close, look, off):
    rx, ry = 27, 24
    ell(d, cx, cy, rx + 2, ry + 2, (40, 22, 14, 255), off)
    ell(d, cx, cy, rx, ry, (238, 228, 212, 255), off)
    ix, iy = cx + look[0], cy + look[1]
    ell(d, ix, iy, 21, 21, (92, 50, 20, 255), off)
    ell(d, ix, iy + 3, 18, 17, (130, 74, 30, 255), off)
    ell(d, ix, iy, 11, 11, (12, 6, 4, 255), off)
    ell(d, ix - 7, iy - 8, 6, 5.5, (255, 255, 255, 255), off)
    ell(d, ix + 7, iy + 6, 2.4, 2.4, (255, 250, 240, 230), off)
    # upper shadow on the eyeball
    pts = [(cx + rx * math.cos(a), cy + ry * math.sin(a)) for a in np.linspace(math.pi, 2 * math.pi, 18)]
    pts2 = [(x, y + 6) for x, y in reversed(pts)]
    poly(d, pts + pts2, (0, 0, 0, 60), off)
    if close > 0.02:
        xs = np.linspace(-rx - 2, rx + 2, 22)
        top, lid = [], []
        for x in xs:
            q = math.sqrt(max(0.0, 1 - (x / (rx + 2)) ** 2))
            yt = cy - (ry + 3) * q
            yb = cy + (ry + 3) * q
            top.append((cx + x, yt - 3))
            lid.append((cx + x, yt + (yb - yt) * close))
        poly(d, top + list(reversed(lid)), (196, 140, 106, 255), off)
        pline(d, [(x, y - 4) for x, y in lid[3:-3]], (176, 120, 90, 255), 4, off)
        pline(d, lid, (38, 20, 12, 255), 3.4, off)
    else:
        pline(d, [(cx + rx * math.cos(a), cy + ry * math.sin(a)) for a in np.linspace(math.pi * 1.05, 1.95 * math.pi, 14)],
              (38, 20, 12, 255), 3.2, off)

def draw_face(d, t, off):
    hx, hy = head_at(t)
    close = eye_close_at(t)
    look = (2 * math.sin(t * 0.5), 6 + 3 * math.sin(t * 0.8))
    # look down at the food while reaching
    for ev in EVENTS:
        k = ramp(t, ev["t0"] - 0.2, ev["t0"] + 0.4) * (1 - ramp(t, ev["t0"] + 1.0, ev["t0"] + 1.5))
        look = (look[0] + (-6 if ev["arm"] == "L" else 6) * k, look[1] + 6 * k)
    for s in (-1, 1):
        draw_eye(d, hx + s * 60, hy - 24, close, look, off)
    # mouth
    o = open_at(t)
    jaw = jaw_at(t)
    drop = o * 40 + jaw
    mx, my = hx, hy + 100
    lf = light_factor(mx, my + 20, hx, hy, 180)
    chin = shade(SKIN, lf * 0.97) + (255,)
    width = 46 + 10 * o
    if drop > 1.5:
        ell(d, mx, my + drop * 0.45, width, drop * 0.55 + 9, (60, 16, 18, 255), off)
        ell(d, mx, my + drop * 0.8 + 6, width * 0.6, drop * 0.3 + 5, (190, 84, 92, 255), off)  # tongue
        # upper teeth
        ell(d, mx, my - 1, width * 0.62, 6 + 3 * o, (245, 238, 222, 255), off)
        pline(d, [(mx - width * 0.6, my - 6), (mx + width * 0.6, my - 6)], (150, 96, 76, 255), 3, off)
    # chin / lower lip
    ell(d, mx, my + 20 + drop, 56, 24, chin, off)
    ell(d, mx, my + 14 + drop, 50, 10, shade(SKIN, lf * 0.82) + (255,), off)
    ell(d, mx, my + 30 + drop, 30, 9, shade(SKIN, lf * 1.08) + (255,), off)
    if drop <= 1.5:
        smile = 6 + 6 * ramp(t, 20.4, 21.2)
        pts = [(mx + x, my + 2 + smile * (1 - (x / 50) ** 2)) for x in np.linspace(-50, 50, 20)]
        pline(d, pts, (70, 38, 28, 255), 3.6, off)
    else:
        pline(d, [(mx + x, my + drop + 6 - 4 * (1 - (x / width) ** 2)) for x in np.linspace(-width * 0.9, width * 0.9, 16)],
              (90, 50, 40, 255), 3, off)
    # chewing cheeks
    ch = chewing_amount(t) * (0.5 + 0.5 * math.sin(2 * math.pi * 2.6 * t))
    if ch > 0.01:
        for s in (-1, 1):
            ell(d, hx + s * 80, hy + 82 + jaw * 0.3, 18 + 6 * ch, 13 + 4 * ch, (0, 0, 0, int(28 * ch)), off)

# ----------------------------------------------------------------------------
# steam (low-res layer)
# ----------------------------------------------------------------------------
def steam_layer(t, off, zoom):
    sw, sh = W // 2, H // 2
    lay = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay, "RGBA")
    k = 0.5
    strength = 1.0 - 0.45 * t / DUR
    for i, (x0, ph) in enumerate(((690, 0.0), (790, 2.1), (870, 4.0), (760, 5.3))):
        prev = None
        for j in range(26):
            s = j / 25
            yw = 830 - 330 * s
            loop = (t * 0.35 + ph / 6.28) % 1.0
            yw -= 60 * loop
            xw = x0 + 22 * math.sin(0.018 * yw + 1.6 * t + ph) + 40 * s * math.sin(0.6 * t + ph)
            a = int(42 * strength * math.sin(math.pi * s) * (0.6 + 0.4 * math.sin(t * 1.3 + ph)))
            p = ((xw - off[0]) * k, (yw - off[1]) * k)
            if prev and a > 0:
                d.line([prev, p], fill=(255, 245, 235, a), width=int((8 + 26 * s) * k))
            prev = p
    return lay.filter(ImageFilter.GaussianBlur(9))

# ----------------------------------------------------------------------------
# camera + post
# ----------------------------------------------------------------------------
def camera(t):
    z = 1.0 + 0.2 * smooth(t / 21.0)
    cx = 960 + 6 * math.sin(t * 0.37)
    cy = lerp(540, 590, smooth(t / 21.0)) + 4 * math.sin(t * 0.29 + 1)
    # micro "handheld" drift
    cx += 2.0 * math.sin(t * 1.7) ; cy += 1.5 * math.sin(t * 2.3)
    return z, cx, cy

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
VIG = (1 - 0.55 * np.clip(((XX - W / 2) / (W * 0.62)) ** 2 + ((YY - H / 2) / (H * 0.68)) ** 2, 0, 1) ** 1.4)[..., None]

FONT_T = None
def font(sz, bold=False):
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(p, sz)

def post(img, t, fi):
    a = np.asarray(img, np.float32)
    # warm grade + soft contrast
    a = a / 255.0
    a = a * a * (3 - 2 * a) * 0.35 + a * 0.65
    a *= np.array([1.04, 1.0, 0.93], np.float32)
    a *= VIG
    # gentle bloom from highlights
    a = a * 255
    r = np.random.default_rng(fi)
    a += r.normal(0, 1.6, (H, W, 1)).astype(np.float32)
    fade = smooth(t / 1.4) * (1 - smooth((t - (DUR - 1.4)) / 1.4))
    a *= fade
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def overlay_text(img, t):
    d = ImageDraw.Draw(img, "RGBA")
    a = ramp(t, 1.0, 2.0) * (1 - ramp(t, 5.0, 6.0))
    if a > 0:
        f1, f2 = font(30, True), font(22)
        d.text((64, 54), "ASMR", font=f1, fill=(255, 236, 210, int(220 * a)))
        d.text((64, 94), "Steak  ·  Pommes  ·  Kopfhörer auf", font=f2, fill=(255, 236, 210, int(170 * a)))
    b = ramp(t, 21.2, 22.0)
    if b > 0:
        f = font(26)
        txt = "mmmh."
        w = d.textlength(txt, font=f)
        d.text(((W - w) / 2, 90), txt, font=f, fill=(255, 236, 210, int(200 * b * (1 - ramp(t, 23.0, 23.6)))))
    return img

# ----------------------------------------------------------------------------
# frame renderer
# ----------------------------------------------------------------------------
BASE = HEAD = None

def init():
    global BASE, HEAD
    BASE = build_background()
    HEAD = build_head()

def render_frame(fi):
    t = fi / FPS
    z, ccx, ccy = camera(t)
    vw, vh = W / z, H / z
    x0, y0 = ccx - vw / 2, ccy - vh / 2
    # render only the visible window of the 4K scene, at S x output resolution
    box = (int(x0 * S), int(y0 * S), int((x0 + vw) * S), int((y0 + vh) * S))
    off = (box[0] / S, box[1] / S)
    frame = BASE.crop(box)
    # head
    hx, hy = head_at(t)
    hpos = (int(round((hx - HS_C[0] - off[0]) * S)), int(round((hy - HS_C[1] - off[1]) * S)))
    frame.paste(HEAD, hpos, HEAD)
    d = ImageDraw.Draw(frame, "RGBA")
    draw_face(d, t, off)
    # dynamic food still on the plate
    for ev in EVENTS:
        if ev["kind"] == "fry" and item_on_plate(ev, t):
            f = HERO[ev["hero"]]
            draw_fry(d, f["c"], f["a"], f["L"], f["w"], f["seed"], off=off)
        if ev["kind"] == "steak" and item_on_plate(ev, t):
            # shadow + piece
            ell(d, PIECE_POS[0] + 6, PIECE_POS[1] + 14, 62, 26, (40, 20, 10, 90), off)
            paste_piece(frame, PIECE_FULL, PIECE_POS, PIECE_ANG, off)
            d = ImageDraw.Draw(frame, "RGBA")
    draw_crumbs(d, t, off)
    # hand shadows on the table
    for arm in ("L", "R"):
        st = arm_state(arm, t)
        g = st["g"]
        h = clamp((g[1] - 640) / 180)
        if h > 0:
            ell(d, g[0] + 18, g[1] + 34, 50, 16, (10, 5, 2, int(70 * h)), off)
    # arms
    for arm in ("L", "R"):
        st = arm_state(arm, t)
        d = draw_arm(frame, d, arm, st, off, t)
    # steam
    st_l = steam_layer(t, off, z)
    st_l = st_l.resize(frame.size, Image.BILINEAR)
    frame.paste(st_l, (0, 0), st_l)
    out = frame.resize((W, H), Image.LANCZOS)
    out = post(out, t, fi)
    out = overlay_text(out, t)
    return out.tobytes()

# ----------------------------------------------------------------------------
# audio
# ----------------------------------------------------------------------------
SR = 48000

def bandnoise(n, lo, hi, rng):
    x = rng.normal(0, 1, n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 / (1 + ((lo / np.maximum(f, 1)) ** 4)) / (1 + (f / hi) ** 4)
    y = np.fft.irfft(X * g, n)
    return y / (np.abs(y).max() + 1e-9)

class Mixer:
    def __init__(self):
        self.L = np.zeros(int(SR * (DUR + 1)))
        self.R = np.zeros_like(self.L)
        self.rng = np.random.default_rng(42)
        # grain bank
        self.bank = {}
        for name, lo, hi in (("hi", 2500, 11000), ("mid", 1200, 6000), ("low", 300, 2500), ("wet", 150, 1400)):
            self.bank[name] = [bandnoise(int(SR * 0.03), lo, hi, self.rng) for _ in range(24)]

    def add(self, t, sig, amp=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0 or i >= len(self.L):
            return
        n = min(len(sig), len(self.L) - i)
        gl = math.cos((pan + 1) * math.pi / 4) * 1.414
        gr = math.sin((pan + 1) * math.pi / 4) * 1.414
        self.L[i:i + n] += sig[:n] * amp * gl
        self.R[i:i + n] += sig[:n] * amp * gr

    def grain(self, t, kind, amp, length, pan):
        g = self.bank[kind][int(self.rng.integers(len(self.bank[kind])))]
        n = int(SR * length)
        env = np.exp(-np.arange(n) / (n / 4.5))
        env[: min(24, n)] *= np.linspace(0, 1, min(24, n))
        self.add(t, g[:n] * env, amp, pan)

    def crunch(self, t, intensity=1.0, bright=1.0, dur=0.22, grains=70, pan=0.0):
        r = self.rng
        # initial snap
        self.grain(t, "hi", 0.9 * intensity, 0.004, pan + r.normal(0, 0.05))
        self.grain(t, "low", 0.6 * intensity, 0.03, pan)
        for k in range(grains):
            dt = r.exponential(dur / 3.2)
            if dt > dur * 1.6:
                continue
            kind = "hi" if r.random() < 0.55 * bright else ("mid" if r.random() < 0.7 else "low")
            a = intensity * r.lognormal(-0.9, 0.6) * math.exp(-dt / dur)
            self.grain(t + dt, kind, a, r.uniform(0.0015, 0.009), clamp(pan + r.normal(0, 0.18), -1, 1))

    def squish(self, t, intensity=1.0, dur=0.25, pan=0.0):
        n = int(SR * dur)
        x = bandnoise(n, 120, 1500, self.rng)
        tt = np.arange(n) / SR
        mod = 0.5 + 0.5 * np.sin(2 * math.pi * self.rng.uniform(18, 30) * tt + self.rng.uniform(0, 6)) ** 2
        env = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 1.5
        self.add(t, x * env * mod, 0.22 * intensity, pan)
        # little wet clicks
        for k in range(int(6 * intensity) + 2):
            self.grain(t + self.rng.uniform(0, dur), "wet", 0.18 * intensity, self.rng.uniform(0.004, 0.012), pan + self.rng.normal(0, 0.1))

    def smack(self, t, amp=0.25, pan=0.0):
        self.grain(t, "wet", amp, 0.012, pan)
        self.grain(t + 0.012, "mid", amp * 0.35, 0.004, pan)

def build_audio(path):
    m = Mixer()
    r = m.rng
    n = len(m.L)
    # room tone
    m.L += bandnoise(n, 40, 3000, r) * 0.004
    m.R += bandnoise(n, 40, 3000, r) * 0.004
    # sizzle bed: hiss + crackles, fading as the steak rests
    hiss = bandnoise(n, 3000, 14000, r)
    tt = np.arange(n) / SR
    env = (0.012 + 0.006 * np.sin(tt * 2.1) ** 2) * np.clip(tt / 1.5, 0, 1) * (1 - 0.6 * tt / DUR)
    m.L += hiss * env * 2.4
    m.R += np.roll(hiss, 997) * env * 2.6
    t = 0.0
    while t < DUR:
        t += r.exponential(1 / 55)
        a = 0.12 * r.lognormal(-0.6, 0.7) * (1 - 0.6 * t / DUR) * clamp(t / 1.5)
        m.grain(t, "hi", a, r.uniform(0.0008, 0.003), r.uniform(-0.8, 0.0))
        if r.random() < 0.06:
            m.grain(t, "mid", a * 2.2, 0.004, r.uniform(-0.8, -0.2))
    # events
    for ev in EVENTS:
        pan = -0.15 if ev["arm"] == "L" else 0.15
        # fry rustle when grabbing from the pile / fork-free steak pickup
        for k in range(14 if ev["kind"] == "fry" else 5):
            m.grain(ev["grab"] - 0.05 + r.uniform(0, 0.25), "hi", 0.05, r.uniform(0.002, 0.006), pan * 3)
        m.smack(ev["open1"] + 0.1, 0.22)
        m.smack(ev["open2"] + 0.08, 0.18)
        if ev["kind"] == "fry":
            m.crunch(ev["bite1"], 1.0, 1.0, 0.24, 90, pan * 0.5)
            m.crunch(ev["bite2"], 0.85, 0.9, 0.2, 70, pan * 0.5)
        else:
            m.crunch(ev["bite1"], 0.75, 0.55, 0.16, 45, pan * 0.5)
            m.squish(ev["bite1"] + 0.03, 1.4, 0.32)
            m.crunch(ev["bite2"], 0.5, 0.4, 0.12, 25, pan * 0.5)
            m.squish(ev["bite2"] + 0.03, 1.2, 0.3)
        # soft hand tap on the table when the hand returns
        m.grain(ev["return"], "low", 0.08, 0.03, pan * 4)
    # chewing synced to jaw closings
    for c in CHEWS:
        k = 1
        while True:
            tc = c["ts"] + k / c["f"]
            if tc > c["te"] - 0.05:
                break
            prog = (tc - c["ts"]) / (c["te"] - c["ts"])
            inten = (1 - 0.7 * prog) * (0.55 if c["A"] < 6 else 0.75)
            if c["kind"] == "fry":
                m.crunch(tc - 0.03, 0.55 * inten, 0.8 * (1 - 0.5 * prog), 0.12, int(40 * inten) + 6, r.normal(0, 0.08))
                m.squish(tc, 0.35 + 0.6 * prog, 0.16)
            else:
                m.crunch(tc - 0.02, 0.25 * inten, 0.35, 0.08, 12, r.normal(0, 0.08))
                m.squish(tc - 0.04, 0.9 * inten + 0.3, 0.22)
            k += 1
    # final contented "mmh" hum (soft voiced tone)
    th0 = 21.3
    nn = int(SR * 1.1)
    tt2 = np.arange(nn) / SR
    f0 = 150 - 12 * tt2
    ph = 2 * np.pi * np.cumsum(f0) / SR
    voice = sum((0.6 ** h) * np.sin((h + 1) * ph) for h in range(6))
    voice *= np.sin(np.pi * tt2 / 1.1) ** 2
    m.add(th0, voice / np.abs(voice).max(), 0.09, 0.0)
    # small early reflections for a close, intimate room
    L, R = m.L.copy(), m.R.copy()
    for dly, g in ((0.011, 0.18), (0.017, 0.12), (0.029, 0.08), (0.043, 0.05)):
        k = int(dly * SR)
        L[k:] += m.R[:-k] * g
        R[k:] += m.L[:-k] * g
    st = np.stack([L, R], 1)[: int(SR * DUR)]
    # fades
    nfa = int(SR * 1.2)
    st[:nfa] *= np.linspace(0, 1, nfa)[:, None]
    st[-nfa:] *= np.linspace(1, 0, nfa)[:, None]
    st = np.tanh(st / (np.abs(st).max() + 1e-9) * 2.2)
    st = st / np.abs(st).max() * 0.93
    pcm = (st * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

# ----------------------------------------------------------------------------
def main():
    if "--frame" in sys.argv:
        tsec = float(sys.argv[sys.argv.index("--frame") + 1])
        init()
        fi = int(tsec * FPS)
        Image.frombytes("RGB", (W, H), render_frame(fi)).save(f"preview_{tsec:05.2f}.png")
        return
    wav = "_audio.wav"
    build_audio(wav)
    print("audio done", flush=True)
    init()
    from multiprocessing import Pool
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", OUT]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for i, fr in enumerate(pool.imap(render_frame, range(NF), chunksize=2)):
            ff.stdin.write(fr)
            if i % 60 == 0:
                print(f"frame {i}/{NF}", flush=True)
    ff.stdin.close()
    ff.wait()
    os.remove(wav)
    print("wrote", OUT)

if __name__ == "__main__":
    main()
