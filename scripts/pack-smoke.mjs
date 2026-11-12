// Consumer-level package check: packs the built package, installs the tarball into a throwaway
// project and proves the published files, imports and types work as a consumer sees them. No
// browser: rendering is verified by the demo checks.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Outside the package root, so a running dev server does not see the consumer project's files.
// A passing run removes the folder; a failure keeps it for inspection.
const work = mkdtempSync(join(tmpdir(), 'devkit-pack-smoke-'));
process.on('exit', (code) => {
  if (code !== 0) console.error(`pack-smoke: the work folder is kept for inspection: ${work}`);
});
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const fail = (message) => {
  console.error(`pack-smoke: ${message}`);
  process.exit(1);
};
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// 1. The tarball holds the build, the documentation pages, the readme, the license and the
// manifest, and nothing else.
const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work]));
const files = new Set(pack.files.map((file) => file.path));
const unexpected = [...files].filter(
  (path) =>
    !/^dist\//u.test(path) &&
    !/^docs\/[^/]+\/[^/]+\.mdx$/u.test(path) &&
    !['package.json', 'README.md', 'LICENSE'].includes(path),
);
if (unexpected.length) fail(`unexpected files: ${unexpected.slice(0, 10).join(', ')}`);
const tests = [...files].filter((path) => /\.test\.(js|d\.ts)$/u.test(path));
if (tests.length) fail(`test files are packed: ${tests.slice(0, 5).join(', ')}`);
for (const required of ['LICENSE', 'README.md', 'dist/docs.json'])
  if (!files.has(required)) fail(`${required} is not packed`);
// The documentation pages the website reads, as @tweakpad/ui ships its own.
const pages = JSON.parse(readFileSync(join(root, 'dist/docs.json'), 'utf8')).pages;
for (const page of pages) if (!files.has(page.file)) fail(`${page.file} is not packed`);
for (const [subpath, target] of Object.entries(manifest.exports)) {
  for (const path of typeof target === 'string' ? [target] : Object.values(target))
    if (!files.has(path.replace(/^\.\//u, ''))) fail(`export ${subpath} -> ${path} is not packed`);
}

// 2. Every module's relative imports are packed, and its bare imports are declared dependencies.
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]);
const packageOf = (specifier) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
const specifiers = (code) =>
  [
    ...code.matchAll(
      /^(?:import|export)\s+[^'"]*?from\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]|(?<![\w$.])import\s*\(\s*['"]([^'"]+)['"]/gmu,
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3]);
for (const file of files) {
  if (!/\.(js|d\.ts)$/u.test(file)) continue;
  for (const specifier of specifiers(readFileSync(join(root, file), 'utf8'))) {
    if (/^\.\.?\//u.test(specifier)) {
      let target = posix.join(posix.dirname(file), specifier);
      if (file.endsWith('.d.ts')) target = target.replace(/\.js$/u, '.d.ts');
      if (!files.has(target)) fail(`${file} imports ${specifier}, which is not packed`);
    } else if (!specifier.startsWith('node:') && !declared.has(packageOf(specifier)))
      fail(`${file} imports ${specifier}, which is not a dependency`);
  }
}

// 3. A consumer project installs the tarball and type-checks against the published types.
const consumer = join(work, 'consumer');
run('mkdir', ['-p', consumer]);
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
);
run(
  'npm',
  ['install', '--no-audit', '--no-fund', '--ignore-scripts', join(work, pack.filename), 'lit'],
  consumer,
);
writeFileSync(
  join(consumer, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    },
    include: ['index.ts'],
  }),
);
writeFileSync(
  join(consumer, 'index.ts'),
  `import {
  Pane,
  type BindingApi,
  type GraphApi,
  type HistoryApi,
  type HistoryVersion,
  type PerformanceMonitorApi,
} from '@tweakpad/devkit';

const params = { speed: 1, color: '#ff0000', enabled: true };
const pane = new Pane({ title: 'Consumer', history: { mode: 'auto', storage: 'memory' } });
const speed: BindingApi<number> = pane.addBinding(params, 'speed', { min: 0, max: 10, id: 'speed' });
speed.on('finish', ({ value }) => value.toFixed(1));
const graph: GraphApi = pane.addGraph({ label: 'Wave', series: [{ id: 'wave', label: 'Wave' }] });
graph.push({ wave: 0.5 });
const monitor: PerformanceMonitorApi = pane.addPerformanceMonitor({ metrics: ['fps'] });
monitor.begin();
const history: HistoryApi | null = pane.history;
const latest: HistoryVersion | undefined = history?.advance('first');
export { latest };
`,
);
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', consumer], consumer);

rmSync(work, { recursive: true, force: true });
console.log(`pack-smoke: ${pack.filename} (${files.size} files) installs and type-checks`);
