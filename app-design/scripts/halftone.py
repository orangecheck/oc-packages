#!/usr/bin/env python3
"""Turn a photo into the dot layer of an ochk.app halftone sphere.

    python3 scripts/halftone.py in.jpg out.png --size 1200 --pitch 11
    python3 scripts/halftone.py deck-sphere.png out.png --size 1200 --pitch 10.9 --channel R --contrast 1.5 --floor 0.12 --gamma 1.1

The output is black dots on transparent, already masked to a circle, ready to sit
on <HalftoneSphere>'s orange gradient. Tone comes from the photo's luminance after a
blur of about one pitch, so an image that is already halftoned (as the design's
portrait is) re-screens cleanly at any size. The screen is rotated 45 degrees, the
classic angle for black. Only Pillow is needed.

Re-screening the deck's own sphere, read the red channel: there the orange is as light as
the paper, so only the black ink becomes dots. Luminance reads the orange as mid-grey
and fills the whole ball with faint dots.

Options:
    --size N       output edge in px (square)               default 1200
    --pitch P      dot spacing in output px                  default 11
    --gamma G      >1 lightens mid-tones, <1 darkens         default 1.0
    --invert       treat light pixels as ink
    --threshold T  the source is a dot pattern: ink = L < T  default off (continuous)
    --channel C    L (luminance) or R (red; drops an orange ground)  default L
    --contrast K   stretch tone around mid-grey                  default 1.0
    --floor F      drop dots lighter than F (0-1)                default 0.04
"""

import argparse
import math

from PIL import Image, ImageDraw, ImageFilter, ImageOps


def tone_map(
    src: Image.Image, size: int, pitch: float, threshold: int | None, invert: bool, channel: str
) -> Image.Image:
    g = src.getchannel('R') if channel == 'R' else ImageOps.grayscale(src)
    if threshold is not None:
        g = g.point(lambda v: 0 if v < threshold else 255)
    if invert:
        g = ImageOps.invert(g)
    # Blur about one source-pitch so an existing screen becomes continuous tone.
    scale = src.width / size
    g = g.filter(ImageFilter.GaussianBlur(radius=int(max(1, round(pitch * scale * 0.55)))))
    return g.resize((size, size), Image.Resampling.LANCZOS)


def screen(tone: Image.Image, pitch: float, gamma: float, contrast: float, floor: float) -> Image.Image:
    size = tone.width
    ss = 3  # supersample for clean edges
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
            if math.hypot(x - c, y - r_mask) > r_mask - pitch * 0.6:
                continue
            ink = 1 - px[int(x), int(y)] / 255
            ink = min(1.0, max(0.0, (ink - 0.5) * contrast + 0.5))
            if gamma != 1:
                ink = ink ** gamma
            if ink < floor:
                continue
            # Area-true: the dot covers `ink` of its cell, overlapping in shadows.
            rad = pitch * math.sqrt(ink / math.pi) * 1.1
            draw.ellipse(
                [(x - rad) * ss, (y - rad) * ss, (x + rad) * ss, (y + rad) * ss], fill=255
            )
    alpha = canvas.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (size, size), 0)
    out.paste((12, 10, 9, 0), (0, 0, size, size))
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
    p.add_argument('--channel', choices=['L', 'R'], default='L')
    p.add_argument('--contrast', type=float, default=1.0)
    p.add_argument('--floor', type=float, default=0.04)
    a = p.parse_args()
    src = Image.open(a.src).convert('RGB')
    edge = min(src.size)
    src = src.crop(((src.width - edge) // 2, (src.height - edge) // 2, (src.width + edge) // 2, (src.height + edge) // 2))
    tone = tone_map(src, a.size, a.pitch, a.threshold, a.invert, a.channel)
    screen(tone, a.pitch, a.gamma, a.contrast, a.floor).save(a.out)


if __name__ == '__main__':
    main()
