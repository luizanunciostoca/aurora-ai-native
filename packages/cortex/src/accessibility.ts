import type { CortexViewState } from './contracts.js';

export const CORTEX_LANDMARKS = [
  { id: 'cortex-primary-nav', role: 'navigation', labelRef: 'cortex.a11y.primaryNavigation' },
  { id: 'cortex-main', role: 'main', labelRef: 'cortex.a11y.mainContent' },
  { id: 'cortex-inspector', role: 'complementary', labelRef: 'cortex.a11y.inspector' },
] as const;

export const CORTEX_NAVIGATION_KEYS = [
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
] as const;
export type CortexNavigationKey = (typeof CORTEX_NAVIGATION_KEYS)[number];

export function nextRovingIndex(
  currentIndex: number,
  itemCount: number,
  key: CortexNavigationKey,
  orientation: 'VERTICAL' | 'HORIZONTAL',
): number {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  const current = Math.min(Math.max(currentIndex, 0), itemCount - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  const previousKey = orientation === 'VERTICAL' ? 'ArrowUp' : 'ArrowLeft';
  const nextKey = orientation === 'VERTICAL' ? 'ArrowDown' : 'ArrowRight';
  if (key === previousKey) return (current - 1 + itemCount) % itemCount;
  if (key === nextKey) return (current + 1) % itemCount;
  return current;
}

export function liveRegionForState(state: CortexViewState): 'off' | 'polite' | 'assertive' {
  if (state === 'ERROR' || state === 'OFFLINE') return 'assertive';
  if (state === 'LOADING' || state === 'DEGRADED' || state === 'EMPTY') return 'polite';
  return 'off';
}

function replaceControlCharacters(value: string): string {
  let sanitized = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitized += codePoint <= 31 || codePoint === 127 ? ' ' : character;
  }
  return sanitized;
}

export function sanitizeAccessibleText(value: string, maxLength = 512): string {
  const withoutControls = replaceControlCharacters(value);
  const collapsedWhitespace = withoutControls.replace(/\s+/g, ' ');
  return collapsedWhitespace.trim().slice(0, maxLength);
}
