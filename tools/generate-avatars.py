#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成站点用的占位头像（友人帐卡片、页脚推荐位）。

起因：模板自带的小图标/头像都是 picsum.photos 外链，既依赖外网也不好确认版权。
这里用纯代码画几张「字母头像」放进 source/assets/friends/，离线可用、风格统一。

用法：
    python tools/generate-avatars.py
想换成朋友的真头像：直接把 png 覆盖成同名文件，或者在 source/_data/link.yml 里改 avatar 路径。
"""

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.join("source", "assets", "friends")
SIZE = 240

# 文件名, 字母, 渐变起色, 渐变止色
AVATARS = [
    ("hexo.png", "H", (14, 131, 205), (9, 88, 152)),        # Hexo 的青蓝
    ("butterfly.png", "B", (139, 92, 246), (91, 46, 178)),  # Butterfly 的紫
    ("frontier.png", "F", (57, 197, 187), (16, 120, 118)),  # 主题色
    ("slot.png", "+", (150, 156, 168), (104, 110, 124)),    # 广告位
]

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\msyhbd.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size), top)
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize((size, size), Image.BICUBIC)


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def build(name, letter, c1, c2):
    size = SIZE
    bg = vertical_gradient(size, c1, c2)
    # 右上角加一团柔光，避免整块纯色显得死板
    glow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * 0.45, -size * 0.25, size * 1.15, size * 0.55], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    bg = Image.composite(Image.new("RGB", (size, size), (255, 255, 255)), bg, glow.point(lambda v: int(v * 0.35)))

    draw = ImageDraw.Draw(bg)
    font = load_font(int(size * 0.52) if letter != "+" else int(size * 0.46))
    box = draw.textbbox((0, 0), letter, font=font)
    x = (size - (box[2] - box[0])) / 2 - box[0]
    y = (size - (box[3] - box[1])) / 2 - box[1]
    draw.text((x + 2, y + 3), letter, font=font, fill=(0, 0, 0))  # 极淡的投影
    draw.text((x, y), letter, font=font, fill=(255, 255, 255))

    img = bg.convert("RGBA")
    img.putalpha(rounded_mask(size, int(size * 0.24)))
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG", optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, letter, c1, c2 in AVATARS:
        path = build(name, letter, c1, c2)
        print(f"  {path}  {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()