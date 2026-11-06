export const CORTEX_TOKENS = {
  color: {
    canvas: '#0B0F14',
    surface: '#121821',
    surfaceRaised: '#18212C',
    textPrimary: '#F5F7FA',
    textSecondary: '#C5D0DC',
    accent: '#7DD3FC',
    focus: '#FDE68A',
    positive: '#86EFAC',
    warning: '#FDE68A',
    critical: '#FCA5A5',
    border: '#3A4756',
  },
  space: { x1: 4, x2: 8, x3: 12, x4: 16, x6: 24, x8: 32, x12: 48 },
  radius: { small: 8, medium: 12, large: 18, pill: 999 },
  typography: {
    body: { size: 16, lineHeight: 24 },
    label: { size: 14, lineHeight: 20 },
    title: { size: 24, lineHeight: 32 },
    display: { size: 36, lineHeight: 44 },
  },
  motion: {
    instantMs: 0,
    fastMs: 120,
    standardMs: 180,
    reducedMotionMs: 0,
  },
  layout: {
    compactMaxPx: 719,
    mediumMaxPx: 1119,
    tabletMinTouchTargetPx: 48,
    inspectorPreferredPx: 384,
    contentMaxPx: 1600,
  },
} as const;

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function cortexCssVariables(): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(CORTEX_TOKENS.color)) {
    lines.push(`--cortex-color-${kebab(name)}: ${value};`);
  }
  for (const [name, value] of Object.entries(CORTEX_TOKENS.space)) {
    lines.push(`--cortex-space-${kebab(name)}: ${value}px;`);
  }
  for (const [name, value] of Object.entries(CORTEX_TOKENS.radius)) {
    lines.push(`--cortex-radius-${kebab(name)}: ${value}px;`);
  }
  return `:root {\n  ${lines.join('\n  ')}\n}`;
}
