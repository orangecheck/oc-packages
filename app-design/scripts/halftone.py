#!/usr/bin/env python3
"""Turn a photo into the dot layer of an ochk.app halftone sphere.

    python3 scripts/halftone.py in.jpg out.png --size 1200 --pitch 11

The output is black dots on transparent, already masked to a circle, ready to sit
on <HalftoneSphere>'s orange gradient. Tone comes from the photo's luminance after a
blur of about one pitch, so an image that is already halftoned (as Sou's deck
portrait is) re-screens cleanly at any size. The screen is rotated 45 degrees, the
classic angle for black. Only Pillow is needed.

Options:
    --size N       output edge in px (square)               default 1200
    --pitch P      dot spacing in output px                  default 11
    --gamma G      >1 lightens mid-tones, <1 darkens         default 1.0
    --invert       treat light pixels as ink
    --threshold T  the source is a dot pattern: ink = L < T  default off (continuous)
"""

import argparse
import math

from PIL import Image, ImageDraw, ImageFilter, ImageOps


def tone_map(src: Image.Image, size: int, pitch: float, threshold: int | None, invert: bool) -> Image.Image:
    g = ImageOps.grayscale(src)
    if threshold is not None:
        g = g.point(lambda v: 0 if v < threshold else 255)
    if invert:
        g = ImageOps.invert(g)
    # Blur about one source-pitch so an existing screen becomes continuous tone.
    scale = src.width / size
    g = g.filter(ImageFilter.GaussianBlur(radius=int(max(1, round(pitch * scale * 0.55)))))
    return g.resize((size, size), Image.Resampling.LANCZOS)


def screen(tone: Image.Image, pitch: float, gamma: float) -> Image.Image:
    size = tone.width
    ss = 2  # supersample for clean edges
    canvas = Image.new('L', (size * ss, size * ss), 0)
    draw = ImageDraw.Draw(canvas)
    px = tone.load()
    assert px is not None
    c, r_mask = size / 2, size / 2
    angle = math.radians(45)
    ca, sa = math.cos(angle), math.sin(angle)
    span = int(size * 1.5 / pitch) + 2
    for i in range(-span, span):
        for j in range(-span, span):
            u, v = i * pitch, j * pitch
            x = c + u * ca - v * sa
            y = c + u * sa + v * ca
            if not (0 <= x < size and 0 <= y < size):
                continue
            if math.hypot(x - c, y - r_mask) > r_mask - pitch * 0.4:
                continue
            ink = 1 - px[int(x), int(y)] / 255
            if gamma != 1:
                ink = ink ** gamma
            if ink < 0.04:
                continue
            # Area-true: the dot covers `ink` of its cell, overlapping in shadows.
            rad = pitch * math.sqrt(ink / math.pi) * 1.08
            draw.ellipse(
                [(x - rad) * ss, (y - rad) * ss, (x + rad) * ss, (y + rad) * ss], fill=255
            )
    alpha = canvas.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (size, size), 0)
    out.paste((10, 10, 10, 0), (0, 0, size, size))
    out.putalpha(alpha)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src')
    p.add_argument('out')
    p.add_argument('--size', type=int, default=1200)
    p.add_argument('--pitch', type=float, default=11)
    p.add_argument('--gamma', type=float, default=1.0)
    p.add_argument('--invert', action='store_true')
    p.add_argument('--threshold', type=int, default=None)
    a = p.parse_args()
    src = Image.open(a.src).convert('RGB')
    edge = min(src.size)
    src = src.crop(((src.width - edge) // 2, (src.height - edge) // 2, (src.width + edge) // 2, (src.height + edge) // 2))
    tone = tone_map(src, a.size, a.pitch, a.threshold, a.invert)
    screen(tone, a.pitch, a.gamma).save(a.out)


if __name__ == '__main__':
    main()
