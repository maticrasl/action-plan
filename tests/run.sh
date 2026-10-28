#!/bin/bash
# Runs the browser tests in headless Chrome and prints the results.
# usage: tests/run.sh [app dir]   (default: the repo this script is in)
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:-$HERE/..}"
D="$(mktemp -d)"
cp -r "$SRC/index.html" "$SRC/css" "$SRC/js" "$D/"
cp "$HERE/pre.js" "$HERE/more.js" "$HERE/test.js" "$D/js/"
sed -i 's#<script src="js/i18n.js"></script>#<script src="js/pre.js"></script>\n  <script src="js/i18n.js"></script>#; s#<script src="js/app.js"></script>#<script src="js/app.js"></script>\n  <script src="js/more.js"></script>\n  <script src="js/test.js"></script>#' "$D/index.html"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
WIN=$(cygpath -w "$D" 2>/dev/null || echo "$D")
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$WIN/profile" --window-size=1280,900 --virtual-time-budget=60000 --dump-dom "file:///${WIN//\//}/index.html" 2>/dev/null > "$D/dom.html"
python - "$D/dom.html" <<'PY'
import sys, re, html
s = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'<pre id="OK">(.*?)</pre>', s, re.S)
out = html.unescape(m.group(1)) if m else 'NO RESULT'
sys.stdout.buffer.write((out + '\n').encode('utf-8'))
sys.exit(0 if m and 'FAIL' not in out and out.rstrip().endswith('errors: none') else 1)
PY
