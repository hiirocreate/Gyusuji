"""Generate all web/PWA/Android launcher icons from the approved mascot artwork.

Run: python3 gen/build_icons.py
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'packages/client'
MASTER = ROOT / 'gen/assets/gyusuji-icon-master.png'
WEB = CLIENT / 'public/icons'
ANDROID = CLIENT / 'android/app/src/main/res'
RESAMPLE = Image.Resampling.LANCZOS


def square(size: int) -> Image.Image:
    image = Image.open(MASTER).convert('RGBA')
    return ImageOps.fit(image, (size, size), method=RESAMPLE, centering=(0.5, 0.5))


WEB.mkdir(parents=True, exist_ok=True)
for size, filename in ((192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png'), (32, 'favicon-32.png')):
    square(size).save(WEB / filename, optimize=True)

# Multi-resolution browser bookmark icon.
square(48).save(WEB / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])

# Android legacy launcher icons and adaptive-icon foregrounds at each density.
for density, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    folder = ANDROID / f'mipmap-{density}'
    folder.mkdir(parents=True, exist_ok=True)
    image = square(px)
    image.save(folder / 'ic_launcher.png', optimize=True)
    image.save(folder / 'ic_launcher_round.png', optimize=True)
    # Adaptive icon foregrounds are provided at the platform's 108dp canvas.
    fg_px = round(px * 2.25)
    square(fg_px).save(folder / 'ic_launcher_foreground.png', optimize=True)

print('Generated web, PWA, Apple touch and Android launcher icon variants.')
