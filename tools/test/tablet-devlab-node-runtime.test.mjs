import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

test('tablet Debian setup pins the exact CI-compatible Node and npm runtime', () => {
  const source = read('setup-debian.sh');
  assert.match(source, /NODE_VERSION="22\.16\.0"/);
  assert.match(source, /NPM_VERSION="10\.9\.2"/);
  assert.match(source, /nvm install 22\.16\.0/);
  assert.match(source, /nvm alias default \$NODE_VERSION/);
  assert.match(source, /npm install --global npm@\$NPM_VERSION/);
  assert.match(source, /node_version=\$NODE_VERSION/);
  assert.match(source, /npm_version=\$NPM_VERSION/);
});

test('provider doctor and host launcher refuse runtime drift from the exact pinned pair', () => {
  for (const name of ['provider-doctor.sh', 'run-host.sh']) {
    const source = read(name);
    assert.match(source, /NODE_VERSION="22\.16\.0"/);
    assert.match(source, /NPM_VERSION="10\.9\.2"/);
    assert.match(source, /nvm use \$NODE_VERSION/);
    assert.match(source, /node --version/);
    assert.match(source, /npm --version/);
    assert.doesNotMatch(source, /nvm use 22(?:\s|$)/m);
  }
});
