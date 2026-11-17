/** Vite build: the app into dist/ (with the service worker), and the test pages into dist-test/ (--mode test). */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;

// Files under a folder, as paths relative to it with forward slashes.
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(dir, join(e.parentPath, e.name)).replaceAll('\\', '/'));

// src/sw.js, served as sw.js at the site root. Its SHELL lists the built files (their names hold a
// hash) and its CACHE name is derived from their content, so a new build drops the old cache.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(f => !f.endsWith('.map')).sort();
      const shell = ['./', ...built, ...filesIn(join(root, 'public'))];
      const hash = createHash('sha256');
      for (const f of built) {
        const out = bundle[f];
        hash.update(f).update(out.type === 'chunk' ? out.code : out.source);
      }
      const code = readFileSync(join(root, 'src', 'sw.js'), 'utf8')
        .replace('__SW_CACHE__', JSON.stringify('actionplan-' + hash.digest('hex').slice(0, 12)))
        .replace('__SW_SHELL__', JSON.stringify(shell));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

// The test pages: copies of the built index.html with classic scripts in <head> that run before the
// app, and a list of classic scripts the test bridge appends once the app has booted.
const TEST_PAGES: Record<string, { before: string[]; after: string[] }> = {
  'test.html': { before: ['tests/pre.js'], after: ['tests/more.js', 'tests/test.js'] },
  'perf.html': { before: ['tests/pre.js'], after: ['tests/perf.js'] },
  // fixture-config.js is written by scripts/fixtures.mjs before each page load.
  'fx.html': { before: ['fixture-config.js', 'tests/fixture-pre.js'], after: ['tests/fixture-page.js'] },
};
const TEST_FILES: Record<string, string> = {
  'tests/pre.js': 'tests/pre.js',
  'tests/more.js': 'tests/more.js',
  'tests/test.js': 'tests/test.js',
  'tests/perf.js': 'tests/perf.js',
  'tests/fixture-pre.js': 'tests/fixtures/fixture-pre.js',
  'tests/fixture-page.js': 'tests/fixtures/fixture-page.js',
  // Tests render parts of the app in an iframe that links this path.
  'css/styles.css': 'src/styles/styles.css',
};

function testPages(): Plugin {
  return {
    name: 'test-pages',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replace('/src/main.ts', '/src/test-bridge.ts'),
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') throw new Error('test-pages: index.html not built');
      const html = String(index.source);
      if (!html.includes('</head>')) throw new Error('test-pages: no </head>');
      for (const [fileName, { before, after }] of Object.entries(TEST_PAGES)) {
        const head =
          before.map(src => `  <script src="${src}"></script>\n`).join('') +
          `  <meta name="test-after" content="${after.join(' ')}">\n`;
        this.emitFile({ type: 'asset', fileName, source: html.replace('</head>', head + '</head>') });
      }
      for (const [fileName, from] of Object.entries(TEST_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(root, from)) });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const test = mode === 'test';
  return {
    base: './',
    // The test pages get no manifest or icons, as when they ran from file://: with a manifest,
    // Chrome offers to install the app and the install tests see a prompt they do not expect.
    publicDir: test ? false : 'public',
    build: {
      outDir: test ? 'dist-test' : 'dist',
      sourcemap: true,
      minify: !test,
    },
    plugins: test ? [testPages()] : [serviceWorker()],
  };
});
