#!/bin/bash
# Runs the browser tests in headless Chrome and prints the results, then the draw-time checks.
# usage: tests/run.sh [app dir]   (default: the repo this script is in)
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:-$HERE/..}"
D="$(mktemp -d)"
cp -r "$SRC/index.html" "$SRC/css" "$SRC/js" "$D/"
cp "$HERE/pre.js" "$HERE/more.js" "$HERE/test.js" "$HERE/perf.js" "$D/js/"
cp "$D/index.html" "$D/perf.html"
sed -i 's#<script src="js/i18n.js"></script>#<script src="js/pre.js"></script>\n  <script src="js/i18n.js"></script>#; s#<script src="js/app.js"></script>#<script src="js/app.js"></script>\n  <script src="js/more.js"></script>\n  <script src="js/test.js"></script>#' "$D/index.html"
sed -i 's#<script src="js/i18n.js"></script>#<script src="js/pre.js"></script>\n  <script src="js/i18n.js"></script>#; s#<script src="js/app.js"></script>#<script src="js/app.js"></script>\n  <script src="js/perf.js"></script>#' "$D/perf.html"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
WIN=$(cygpath -w "$D" 2>/dev/null || echo "$D")
URL="file:///${WIN//\//}"
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$WIN/profile" --window-size=1280,900 --virtual-time-budget=60000 --dump-dom "$URL/index.html" 2>/dev/null > "$D/dom.html"
# Real time: no virtual-time budget, so the clock runs while perf.js measures.
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$WIN/profile-perf" --window-size=1280,900 --dump-dom "$URL/perf.html" 2>/dev/null > "$D/perf-dom.html"
python - "$D/dom.html" "$D/perf-dom.html" <<'PY'
import sys, re, html
def block(path, id):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'<pre id="%s">(.*?)</pre>' % id, s, re.S)
    return html.unescape(m.group(1)) if m else None
out = block(sys.argv[1], 'OK') or 'NO RESULT'
perf = block(sys.argv[2], 'PERF')
sys.stdout.buffer.write((out + '\n\n' + (perf or 'FAIL draw times: NO RESULT') + '\n').encode('utf-8'))
ok = 'FAIL' not in out and out.rstrip().endswith('errors: none') and perf is not None and 'FAIL' not in perf
sys.exit(0 if ok else 1)
PY
