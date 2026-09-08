import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/setup-debian.sh'), 'utf8');

test('Debian setup reuses an existing numeric Termux GID instead of failing group creation', () => {
  assert.match(source, /getent group \$TERMUX_GID/);
  assert.match(source, /groupadd -g \$TERMUX_GID aurora/);
  assert.doesNotMatch(source, /getent group aurora[\s\S]*groupadd -g \$TERMUX_GID aurora/);
});

test('Debian setup creates aurora even when the numeric Termux UID already exists', () => {
  assert.match(source, /getent passwd \$TERMUX_UID/);
  assert.match(source, /useradd -o -m -u \$TERMUX_UID -g \$TERMUX_GID/);
  assert.match(source, /id -u aurora/);
  assert.match(source, /id -g aurora/);
  assert.match(source, /aurora UID does not match Termux UID/);
  assert.match(source, /aurora GID does not match Termux GID/);
});
