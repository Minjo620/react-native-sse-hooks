import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(repositoryRoot, 'tests', 'package-fixtures');
const temporaryPrefix = join(tmpdir(), 'react-native-sse-hooks-package-');

let temporaryRoot;
let tarballPath;

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function assertSafeGeneratedPath(path, parent, label) {
  const child = resolve(path);
  const root = resolve(parent);
  assert.equal(
    child.startsWith(`${root}${sep}`),
    true,
    `${label} escaped its expected parent: ${child}`,
  );
}

async function createPeerStubs(consumerRoot) {
  const reactRoot = join(consumerRoot, 'node_modules', 'react');
  const reactNativeRoot = join(consumerRoot, 'node_modules', 'react-native');
  await Promise.all([
    mkdir(reactRoot, { recursive: true }),
    mkdir(reactNativeRoot, { recursive: true }),
  ]);

  const dualPackage = name =>
    JSON.stringify(
      {
        name,
        version: '0.0.0-fixture',
        type: 'module',
        exports: { import: './index.mjs', require: './index.cjs' },
      },
      null,
      2,
    );

  await Promise.all([
    writeFile(join(reactRoot, 'package.json'), dualPackage('react')),
    writeFile(
      join(reactRoot, 'index.mjs'),
      'export const useCallback = () => {}; export const useEffect = () => {}; export const useLayoutEffect = () => {}; export const useRef = () => {}; export const useState = () => {};\n',
    ),
    writeFile(
      join(reactRoot, 'index.cjs'),
      'exports.useCallback = exports.useEffect = exports.useLayoutEffect = exports.useRef = exports.useState = () => {};\n',
    ),
    writeFile(join(reactNativeRoot, 'package.json'), dualPackage('react-native')),
    writeFile(
      join(reactNativeRoot, 'index.mjs'),
      'export const AppState = { addEventListener() { return { remove() {} }; } };\n',
    ),
    writeFile(
      join(reactNativeRoot, 'index.cjs'),
      'exports.AppState = { addEventListener() { return { remove() {} }; } };\n',
    ),
  ]);
}

async function installFixture(name) {
  const source = join(fixtureRoot, name);
  const destination = join(temporaryRoot, name);
  await cp(source, destination, { recursive: true });
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-package-lock', '--legacy-peer-deps', tarballPath],
    destination,
  );
  return destination;
}

try {
  temporaryRoot = await mkdtemp(temporaryPrefix);
  assertSafeGeneratedPath(temporaryRoot, tmpdir(), 'temporary directory');

  const packOutput = run('npm', ['pack', '--json', '--ignore-scripts'], repositoryRoot, true);
  const [packResult] = JSON.parse(packOutput);
  assert.ok(packResult, 'npm pack did not return package metadata');

  tarballPath = resolve(repositoryRoot, packResult.filename);
  assert.equal(dirname(tarballPath), repositoryRoot, 'npm pack wrote outside the repository root');

  const allowedRootFiles = new Set(['LICENSE', 'README.md', 'README.zh-CN.md', 'package.json']);
  const packedFiles = packResult.files.map(({ path }) => path).sort();
  const unexpectedFiles = packedFiles.filter(
    path => !path.startsWith('dist/') && !allowedRootFiles.has(path),
  );
  assert.deepEqual(unexpectedFiles, [], `unexpected tarball files: ${unexpectedFiles.join(', ')}`);

  const requiredFiles = [
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'dist/index.d.mts',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/index.mjs',
    'package.json',
  ];
  for (const path of requiredFiles) {
    assert.equal(packedFiles.includes(path), true, `required tarball file is missing: ${path}`);
  }

  const esmRoot = await installFixture('esm');
  await createPeerStubs(esmRoot);
  run(process.execPath, ['index.mjs'], esmRoot);

  const cjsRoot = await installFixture('cjs');
  await createPeerStubs(cjsRoot);
  run(process.execPath, ['index.cjs'], cjsRoot);

  const typesRoot = await installFixture('types');
  const typeScriptCli = join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [typeScriptCli, '--project', join(typesRoot, 'tsconfig.json')], typesRoot);

  const packedManifest = JSON.parse(
    await readFile(
      join(typesRoot, 'node_modules', 'react-native-sse-hooks', 'package.json'),
      'utf8',
    ),
  );
  assert.equal(packedManifest.version, '0.1.0');

  console.log(
    `Tarball verified: ${relative(repositoryRoot, tarballPath)} (${packedFiles.length} approved files)`,
  );
} finally {
  if (temporaryRoot) {
    assertSafeGeneratedPath(temporaryRoot, tmpdir(), 'temporary directory');
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (tarballPath) {
    assert.equal(
      dirname(tarballPath),
      repositoryRoot,
      'refusing to remove an unexpected tarball path',
    );
    await rm(tarballPath, { force: true });
  }
}
