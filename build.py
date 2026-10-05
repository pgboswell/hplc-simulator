"""Build the standalone application. Uses only the Python standard library."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parent
PUBLIC=ROOT/'public'
FOLDER='simulator'
TITLE='HPLC Simulator'
SCRIPTS=['compounds.js', 'model.js', 'app.js', 'help-data.js', 'help.js']
body=(ROOT/FOLDER/'workspace.html').read_text(encoding='utf-8')
scripts=''.join(f'<script src="assets/{FOLDER}/{name}" defer></script>' for name in SCRIPTS)
html=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{TITLE}</title><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/{FOLDER}/{FOLDER}.css">{scripts}</head>
<body><a class="skip" href="#main">Skip to content</a><header class="header"><div class="wrap"><div class="masthead"><a class="brand" href="index.html"><img src="assets/favicon.svg" width="44" height="44" alt=""><span><strong>{TITLE}</strong></span></a></div></div></header><main id="main" class="wrap">{body}</main><footer class="footer"><div class="wrap"><p><a href="https://github.com/pgboswell/hplc-simulator">Source code</a> · <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/us/">CC BY-NC-SA 3.0 US</a></p></div></footer></body></html>'''
for asset in (PUBLIC/'assets').rglob('*'):
 if asset.is_file() and asset.suffix in ['.css','.js','.svg']:
  relative=asset.relative_to(PUBLIC).as_posix();version=hashlib.sha256(asset.read_bytes()).hexdigest()[:10]
  html=html.replace(f'"{relative}"',f'"{relative}?v={version}"')
(PUBLIC/'index.html').write_text(html,encoding='utf-8')
print(f'Built {TITLE} in {PUBLIC}')
