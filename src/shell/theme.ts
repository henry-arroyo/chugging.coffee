import type { CSSProperties } from 'react';
import type { Preferences } from '../core/contracts/types';
import { assetUrl } from './icons';

type Scheme = Preferences['desktop']['colorScheme'];
type Pattern = NonNullable<Preferences['desktop']['pattern']>;

export const SCHEMES: { id: Scheme; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'slate', label: 'Slate' },
  { id: 'spruce', label: 'Spruce' },
  { id: 'brick', label: 'Brick' },
  { id: 'high-contrast-black', label: 'High Contrast Black' },
  { id: 'high-contrast-white', label: 'High Contrast White' },
];

export const PATTERNS: { id: Pattern | null; label: string }[] = [
  { id: null, label: '(None)' },
  { id: 'bricks', label: 'Bricks' },
  { id: 'weave', label: 'Weave' },
  { id: 'diamonds', label: 'Diamonds' },
  { id: 'dots', label: 'Dots' },
  { id: 'scales', label: 'Scales' },
];

/** 8x8 one-bit patterns drawn in black over the desktop color, as Windows 95 did. */
const PATTERN_ROWS: Record<Pattern, string[]> = {
  bricks: ['11111111', '10000000', '10000000', '10000000', '11111111', '00001000', '00001000', '00001000'],
  weave: ['10001000', '01010100', '00100010', '01000101', '10001000', '00010101', '00100010', '01010001'],
  diamonds: ['00010000', '00101000', '01000100', '10000010', '01000100', '00101000', '00010000', '00000000'],
  dots: ['10000000', '00000000', '00001000', '00000000', '10000000', '00000000', '00001000', '00000000'],
  scales: ['00000000', '10000001', '01000010', '00111100', '00000000', '00011000', '00100100', '11000011'],
};

function patternUrl(p: Pattern): string {
  const rects = PATTERN_ROWS[p]
    .flatMap((row, y) => [...row].map((bit, x) => (bit === '1' ? `<rect x='${x}' y='${y}' width='1' height='1'/>` : '')))
    .join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' shape-rendering='crispEdges'>${rects}</svg>`)}")`;
}

/** Class names and inline style for the desktop root from the guest's preferences. */
export function desktopStyle(p: Preferences): { className: string; style: CSSProperties } {
  const scheme = p.accessibility.highContrast ? 'high-contrast-black' : p.desktop.colorScheme;
  const classes = [`w95-scheme-${scheme}`];
  if (p.accessibility.largerText) classes.push('w95-larger-text');
  if (p.accessibility.reducedMotion) classes.push('w95-reduced-motion');
  const style: CSSProperties = {};
  const wallpaper = p.desktop.wallpaper ? assetUrl(p.desktop.wallpaper) : null;
  if (wallpaper) style.backgroundImage = `url("${wallpaper}")`;
  else if (p.desktop.pattern) style.backgroundImage = patternUrl(p.desktop.pattern);
  return { className: classes.join(' '), style };
}
