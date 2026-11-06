import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/run-host.sh'), 'utf8');

test('tablet host uses synthetic PRoot root only to preserve trusted-Git ownership invariant', () => {
  assert.match(source, /proot-distro login debian/);
  assert.doesNotMatch(source, /--user aurora/);
  assert.match(source, /export HOME=\/home\/aurora/);
  assert.match(source, /export NVM_DIR=\/home\/aurora\/\.nvm/);
  assert.match(source, /id -u/);
  assert.match(source, /stat -c '%u' \/usr\/bin\/git/);
  assert.match(source, /GIT_CONFIG_KEY_0=safe\.directory/);
  assert.match(source, /GIT_CONFIG_VALUE_0=\/aurora-devlab\/worktrees\/host/);
  assert.doesNotMatch(source, /GIT_CONFIG_VALUE_0=\*/);
  assert.match(source, /no Android root or/);
  assert.match(source, /kernel privilege escalation/);
});
