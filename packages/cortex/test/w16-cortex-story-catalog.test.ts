// @ts-expect-error -- repository test harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- repository test harness intentionally has no @types/node.
import test from 'node:test';

import {
  CORTEX_STORY_VIEWPORTS,
  CORTEX_VIEW_STATES,
  createCortexStoryCatalog,
  validateCortexStoryCatalog,
} from '../src/index.js';

test('W16 story catalog covers every common state at compact, tablet and expanded widths', () => {
  const stories = createCortexStoryCatalog();
  assert.equal(stories.length, CORTEX_VIEW_STATES.length * CORTEX_STORY_VIEWPORTS.length);
  validateCortexStoryCatalog(stories);

  for (const state of CORTEX_VIEW_STATES) {
    const stateStories = stories.filter((story) => story.state === state);
    assert.equal(stateStories.length, 3);
    assert.deepEqual(
      new Set(stateStories.map((story) => story.viewport.expectedLayout)),
      new Set(['COMPACT', 'MEDIUM', 'EXPANDED']),
    );
  }
});

test('story catalog cannot be interpreted as physical evidence or execution authority', () => {
  for (const story of createCortexStoryCatalog()) {
    assert.equal(story.usesMockData, true);
    assert.equal(story.physicalEvidence, false);
    assert.equal(story.authorizesExecution, false);
  }
});
