# Source of the PROMIX digital wordmark

The unmodified `Montserrat-Bold.ttf` is Montserrat Bold 700, upright, version 9.000.
It was obtained from the typeface authors' official repository:

- https://github.com/JulietaUla/Montserrat/blob/master/fonts/ttf/Montserrat-Bold.ttf
- https://github.com/JulietaUla/Montserrat/blob/master/OFL.txt
- SHA-256: `bc6e854971cea46b463be6f9eef4d9cd52f51cfc1fc0dd90c9d3e6483dc0ec61`

The font and accompanying SIL Open Font License are retained as build sources,
outside `public`. They are not loaded as a website font.

Run `python scripts/generate-favicons.py` with `fonttools==4.65.0`,
`uharfbuzz==0.56.2` and Pillow available. The script verifies the source hash,
weight and upright style, shapes PROMIX with HarfBuzz's native kerning plus
−0.02 em between glyphs, and converts the actual outlines with FontTools.
It outputs one currentColor SVG for the shared component, identical navy and
white SVG exports, and the existing favicon/Apple/manifest image family.
The ordinary P has 62.5% ink height, a 4/512 optical offset right/down, and
a 32/512 corner radius. Bitmap icons are antialiased from the same font.

To change the logo, regenerate these assets rather than editing outlines by hand.
