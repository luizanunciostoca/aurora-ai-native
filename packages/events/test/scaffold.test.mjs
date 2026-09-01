import assert from 'node:assert/strict';
import test from 'node:test';

test('W03 shared events package scaffold exposes no runtime behavior', async () => {
  const module = await import('../dist/index.js');
  const publicNamespaceKeys = Object.keys(module).filter(
    (key) => key !== '__esModule' && key !== 'default',
  );
  assert.deepEqual(publicNamespaceKeys, []);

  const defaultExport = module.default;
  if (defaultExport && typeof defaultExport === 'object') {
    const publicDefaultKeys = Object.keys(defaultExport).filter((key) => key !== '__esModule');
    assert.deepEqual(publicDefaultKeys, []);
  }
});
