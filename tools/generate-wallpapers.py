#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「我的画廊」用的本地壁纸（离线、无版权风险、可重复生成）。

为什么不用外部图源：相册页原本引用了 picsum.photos 的随机图，既依赖外网，
也无法确认版权。这里用纯代码生成一批抽象壁纸，产物落在 source/assets/gallery/。

用法：
    python tools/generate-wallpapers.py            # 重新生成全部
    python tools/generate-wallpapers.py --count 8  # 只生成前 8 张
    python tools/generate-wallpapers.py --width 1600 --height 900 --quality 82

生成后记得把 source/box/gallery/wallpaper/index.md 里的图片数量对齐
（多余的行删掉即可，gallery-pager 会自动分页）。
"""

import argparse
import math
import os
import random

import numpy as np
from PIL import Image, ImageFilter

OUT_DIR = os.path.join("source", "assets", "gallery")

# 每张壁纸一个配方：名称、配色（用作渐变主色）、生成风格
RECIPES = [
    # name,              palette,                          style
    ("aurora-teal",      [(0, 62, 66), (57, 197, 187), (10, 28, 46)], "mesh"),
    ("deep-blue",        [(6, 18, 44), (30, 78, 140), (110, 190, 220)], "mesh"),
    ("sunset-grade",     [(38, 16, 44), (232, 108, 96), (250, 196, 120)], "mesh"),
    ("mint-fog",         [(12, 44, 40), (120, 214, 190), (232, 248, 240)], "mesh"),
    ("violet-hour",      [(20, 12, 38), (98, 66, 180), (196, 140, 236)], "mesh"),
    ("teal-rings",       [(4, 30, 34), (57, 197, 187)], "rings"),
    ("indigo-rings",     [(8, 10, 30), (96, 120, 220)], "rings"),
    ("ember-rings",      [(30, 10, 8), (232, 120, 70)], "rings"),
    ("contour-sea",      [(6, 26, 44), (86, 186, 216)], "contour"),
    ("contour-sand",     [(44, 34, 24), (222, 186, 138)], "contour"),
    ("ridge-dusk",       [(24, 18, 40), (150, 118, 200)], "ridges"),
    ("ridge-teal",       [(6, 28, 32), (72, 200, 190)], "ridges"),
    ("starfield",        [(4, 8, 20), (220, 232, 255)], "stars"),
    ("starfield-warm",   [(20, 12, 12), (255, 226, 190)], "stars"),
    ("soft-mesh-light",  [(238, 240, 236), (170, 226, 214), (120, 180, 200)], "mesh"),
    ("soft-mesh-pink",   [(250, 238, 240), (246, 186, 196), (186, 170, 236)], "mesh"),
]

FLAT_LABELS = {
    "aurora-teal": "极光·青",
    "deep-blue": "深海蓝",
    "sunset-grade": "落日渐变",
    "mint-fog": "薄荷雾",
    "violet-hour": "紫罗兰时刻",
    "teal-rings": "同心·青",
    "indigo-rings": "同心·靛",
    "ember-rings": "同心·烬",
    "contour-sea": "等高线·海",
    "contour-sand": "等高线·沙",
    "ridge-dusk": "山脊·薄暮",
    "ridge-teal": "山脊·青",
    "starfield": "星野",
    "starfield-warm": "星野·暖",
    "soft-mesh-light": "浅色·雾青",
    "soft-mesh-pink": "浅色·粉黛",
}


def smooth_noise(h, w, scale, rng, octaves=4):
    """多倍频平滑噪声：每层用小分辨率随机场放大插值，再叠加。"""
    total = np.zeros((h, w), dtype=np.float32)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        sh = max(2, int(h / (scale / (2 ** o))))
        sw = max(2, int(w / (scale / (2 ** o))))
        layer = rng.random((sh, sw)).astype(np.float32)
        img = Image.fromarray((layer * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        total += np.asarray(img, dtype=np.float32) / 255.0 * amp
        norm += amp
        amp *= 0.5
    total /= norm
    return total


def mesh_gradient(h, w, palette, rng):
    """多个色团叠加成柔和渐变（类似 mesh gradient）。"""
    ys, xs = np.mgrid[0:h, 0:w]
    xs = xs / max(1, w - 1)
    ys = ys / max(1, h - 1)
    field = np.zeros((h, w, 3), dtype=np.float32)
    weight = np.zeros((h, w, 1), dtype=np.float32)
    blobs = max(3, len(palette) * 2)
    for i in range(blobs):
        color = np.array(palette[i % len(palette)], dtype=np.float32) / 255.0
        cx, cy = rng.uniform(-0.15, 1.15), rng.uniform(-0.15, 1.15)
        sx, sy = rng.uniform(0.25, 0.75), rng.uniform(0.25, 0.75)
        g = np.exp(-(((xs - cx) / sx) ** 2 + ((ys - cy) / sy) ** 2) * 2.2)[..., None]
        field += g * color
        weight += g
    out = field / np.maximum(weight, 1e-4)
    # 再叠一层低频噪声，避免过于"塑料"
    n = smooth_noise(h, w, 220, rng, 3)[..., None]
    out = out * (0.9 + 0.2 * n)
    return out


def rings(h, w, palette, rng):
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = rng.uniform(0.3, 0.7) * w, rng.uniform(0.3, 0.7) * h
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / max(w, h)
    # 半径扰动：让圆环不规整
    noise = smooth_noise(h, w, 160, rng, 3) - 0.5
    phase = d * rng.uniform(28, 46) + noise * 2.2
    band = 0.5 + 0.5 * np.sin(phase * math.pi)
    base = np.array(palette[0], dtype=np.float32) / 255.0
    hi = np.array(palette[1], dtype=np.float32) / 255.0
    out = base + (hi - base) * (band[..., None] ** 1.4)
    glow = np.exp(-((d * 3.0) ** 2))[..., None]
    out = out * (0.75 + 0.45 * glow)
    return out


def contour(h, w, palette, rng):
    ys, xs = np.mgrid[0:h, 0:w]
    n = smooth_noise(h, w, 260, rng, 4)
    phase = (n * rng.uniform(10, 16) + ys / h * rng.uniform(1.0, 2.0)) * math.pi
    line = np.abs(np.sin(phase))
    line = line ** 6  # 细线
    base = np.array(palette[0], dtype=np.float32) / 255.0
    hi = np.array(palette[1], dtype=np.float32) / 255.0
    out = base + (hi - base) * (0.25 + 0.55 * n[..., None])
    out = out + (hi - out) * (0.55 * line[..., None])
    return out


def ridges(h, w, palette, rng):
    """层叠山脊：每层用噪声剪影，越靠下越深。"""
    ys, xs = np.mgrid[0:h, 0:w]
    base = np.array(palette[0], dtype=np.float32) / 255.0
    hi = np.array(palette[1], dtype=np.float32) / 255.0
    sky = base + (hi - base) * ((1 - ys / h) ** 2)[..., None] * 0.55
    out = sky.copy()
    layers = 5
    for i in range(layers):
        t = (i + 1) / (layers + 0.6)
        n = smooth_noise(h, w, 300, rng, 3)
        ridge = h * (1 - t * 0.85) + (n - 0.5) * h * 0.18
        mask = ys > ridge
        shade = base * (0.35 + 0.5 * (1 - t)) + hi * (0.05 + 0.1 * (1 - t))
        out = np.where(mask[..., None], shade, out)
    return out


def stars(h, w, palette, rng):
    ys, xs = np.mgrid[0:h, 0:w]
    base = np.array(palette[0], dtype=np.float32) / 255.0
    star_color = np.array(palette[1], dtype=np.float32) / 255.0
    nebula = smooth_noise(h, w, 340, rng, 4)[..., None]
    out = base * (0.7 + 0.6 * nebula)
    # 银河带
    band = np.exp(-(((ys / h - 0.45 - 0.12 * np.sin(xs / w * 3.2)) / 0.22) ** 2))[..., None]
    out = out + band * 0.22 * star_color
    # 星点：稀疏随机点 + 少数亮星
    count = int(h * w / 3200)
    px = rng.integers(0, w, count)
    py = rng.integers(0, h, count)
    brightness = (rng.random(count) ** 3) * 0.9 + 0.1
    for x, y, b in zip(px, py, brightness):
        out[max(0, y - 1):y + 2, max(0, x - 1):x + 2] += star_color * float(b) * 0.55
    return out


GENERATORS = {
    "mesh": mesh_gradient,
    "rings": rings,
    "contour": contour,
    "ridges": ridges,
    "stars": stars,
}


def vignette_and_grain(arr, rng, strength=0.35):
    h, w = arr.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xs - w / 2) / (w / 2)) ** 2 + ((ys - h / 2) / (h / 2)) ** 2)
    v = np.clip(1.0 - strength * (d / math.sqrt(2)) ** 2, 0, 1)[..., None]
    out = arr * v
    grain = (rng.random((h, w, 1)).astype(np.float32) - 0.5) * 0.018
    return np.clip(out + grain, 0, 1)


def build(name, palette, style, w, h, quality, seed):
    rng = np.random.default_rng(seed)
    arr = GENERATORS[style](h, w, palette, rng)
    arr = vignette_and_grain(arr, rng)
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    # 轻模糊掉色带，再补一点锐度，观感更干净
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    path = os.path.join(OUT_DIR, name + ".jpg")
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return path, os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=1600)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--quality", type=int, default=84)
    ap.add_argument("--count", type=int, default=len(RECIPES))
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for i, (name, palette, style) in enumerate(RECIPES[: args.count]):
        path, size = build(name, palette, style, args.width, args.height, args.quality, seed=1000 + i)
        total += size
        print(f"  {path}  {size / 1024:.0f} KB  [{style}] {FLAT_LABELS.get(name, name)}")
    print(f"共 {min(args.count, len(RECIPES))} 张，合计 {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()