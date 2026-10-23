"""Build wordmark and favicons from Montserrat Bold. See brand-source/README.md."""
from hashlib import sha256
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
FONT_PATH = Path(__file__).parent / 'brand-source' / 'Montserrat-Bold.ttf'
FONT_SHA256 = 'bc6e854971cea46b463be6f9eef4d9cd52f51cfc1fc0dd90c9d3e6483dc0ec61'
NAVY = '#102336'
WHITE = '#FFFFFF'
TRACKING_EM = -0.02

font_bytes = FONT_PATH.read_bytes()
assert sha256(font_bytes).hexdigest() == FONT_SHA256, 'Review font changes before regenerating.'
font = TTFont(FONT_PATH)
assert font['OS/2'].usWeightClass == 700 and font['post'].italicAngle == 0
glyphs = font.getGlyphSet()
upm = font['head'].unitsPerEm


def number(value):
    return f'{value:.4f}'.rstrip('0').rstrip('.') or '0'


def shaped_glyphs(text, tracking=0):
    hb_font = hb.Font(hb.Face(font_bytes))
    hb_font.scale = (upm, upm)
    hb.ot_font_set_funcs(hb_font)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(hb_font, buffer, {'kern': True})
    positioned = []
    cursor = 0
    for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions):
        positioned.append((font.getGlyphName(info.codepoint), cursor + pos.x_offset, pos.y_offset))
        cursor += pos.x_advance + tracking * upm
    return positioned


def bounds(positioned):
    pen = BoundsPen(glyphs)
    for name, x, y in positioned:
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, y)))
    return pen.bounds


def paths(positioned, scale, dx, dy):
    result = []
    for name, x, y in positioned:
        pen = SVGPathPen(glyphs, ntos=number)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, dx + x * scale, dy - y * scale)))
        result.append(f'<path d="{pen.getCommands()}"/>')
    return ''.join(result)


word = shaped_glyphs('PROMIX', TRACKING_EM)
x0, y0, x1, y1 = bounds(word)
viewbox = f'0 0 {number(x1 - x0)} {number(y1 - y0)}'
word_paths = paths(word, 1, -x0, y1)
svg_start = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"'
svg_dir = ROOT / 'src' / 'assets' / 'brand'
svg_dir.mkdir(parents=True, exist_ok=True)
(svg_dir / 'promix-wordmark.svg').write_text(
    f'{svg_start} fill="currentColor" aria-hidden="true" focusable="false">{word_paths}</svg>\n', encoding='utf-8')
(PUBLIC / 'brand').mkdir(exist_ok=True)
for color, name in [(NAVY, 'navy'), (WHITE, 'white')]:
    (PUBLIC / 'brand' / f'promix-wordmark-{name}.svg').write_text(
        f'{svg_start} fill="{color}" role="img" aria-label="PROMIX">{word_paths}</svg>\n', encoding='utf-8')

# Ordinary upright P: 62.5% ink height, small optical offset toward the lower
# right to balance its upper bowl and stem. The geometry comes from the font.
letter = shaped_glyphs('P')
px0, py0, px1, py1 = bounds(letter)
p_scale = 320 / (py1 - py0)
p_width = (px1 - px0) * p_scale
left = (512 - p_width) / 2 + 4
top = (512 - 320) / 2 + 4
p_paths = paths(letter, p_scale, left - px0 * p_scale, top + py1 * p_scale)
(PUBLIC / 'favicon.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    f'<rect width="512" height="512" rx="32" fill="{NAVY}"/>'
    f'<g fill="{WHITE}">{p_paths}</g></svg>\n', encoding='utf-8')

# Rasterize the same genuine glyph at high resolution, then downsample.
master_size = 2048
factor = master_size / 512
raster_font = ImageFont.truetype(str(FONT_PATH), upm * 4)
raster_bounds = raster_font.getbbox('P', anchor='ls')
mask = Image.new('L', (raster_bounds[2] - raster_bounds[0] + 8, raster_bounds[3] - raster_bounds[1] + 8))
ImageDraw.Draw(mask).text((4 - raster_bounds[0], 4 - raster_bounds[1]), 'P', font=raster_font, anchor='ls', fill=255)
mask = mask.crop(mask.getbbox()).resize((round(p_width * factor), 1280), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (master_size, master_size), (0, 0, 0, 0))
ImageDraw.Draw(canvas).rounded_rectangle((0, 0, master_size - 1, master_size - 1), radius=round(32 * factor), fill=NAVY)
canvas.paste(WHITE, (round(left * factor), round(top * factor)), mask)

outputs = [(16, 'favicon-16x16.png'), (32, 'favicon-32x32.png'), (48, 'favicon-48x48.png'),
           (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png'),
           (192, 'android-chrome-192x192.png'), (512, 'android-chrome-512x512.png'),
           (512, 'favicon-master.png')]
for size, name in outputs:
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name, optimize=True)
canvas.save(PUBLIC / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
print(f'Generated Montserrat 700 wordmark ({viewbox}, tracking {TRACKING_EM}em) and favicon family.')
