import type { ThemeId } from './types';

export interface Theme {
  id: ThemeId;
  name: string;
  dark: boolean;
  bg: string; surface: string; ink: string; muted: string; line: string;
  accent: string; accentInk: string; soft: string; active: string; divider: string;
  viewport: string; dashed: string; warn: string; warnSoft: string; on: string;
}

/** The six interface themes chosen on the design canvas. They never change yarn colours. */
export const THEMES: Theme[] = [
  { id: 'A', name: '薄荷線團', dark: false, bg: '#F2F5F4', surface: '#FFFFFF', ink: '#1D2928', muted: '#5E6E6C', line: '#D6E0DE', accent: '#1F7A70', accentInk: '#155C54', soft: '#DDEFEC', active: '#F4FAF9', divider: '#EDF2F1', viewport: '#FBFCFC', dashed: '#9AABA8', warn: '#B2423A', warnSoft: '#FBEDEC', on: '#FFFFFF' },
  { id: 'B', name: '燕麥奶茶', dark: false, bg: '#F4EFE7', surface: '#FFFDF9', ink: '#2E2620', muted: '#6B5F55', line: '#E3D9CC', accent: '#7C4F33', accentInk: '#5E3A24', soft: '#F1E4D8', active: '#FAF3EC', divider: '#EFE7DD', viewport: '#FBF8F3', dashed: '#B5A796', warn: '#B0372E', warnSoft: '#FAEAE7', on: '#FFFFFF' },
  { id: 'C', name: '薰衣草霧', dark: false, bg: '#F4F2F9', surface: '#FFFFFF', ink: '#25213A', muted: '#615B77', line: '#DEDAEB', accent: '#6447B0', accentInk: '#4B3390', soft: '#ECE6F9', active: '#F7F4FD', divider: '#EEEBF5', viewport: '#FBFAFE', dashed: '#A9A3BF', warn: '#B23A4E', warnSoft: '#FBEBEE', on: '#FFFFFF' },
  { id: 'D', name: '莓果針織', dark: false, bg: '#FAF4F5', surface: '#FFFFFF', ink: '#2D1F24', muted: '#6E5C64', line: '#EDDDE2', accent: '#A8325A', accentInk: '#862445', soft: '#F8E1E8', active: '#FDF5F8', divider: '#F5EAEE', viewport: '#FEFAFB', dashed: '#BFA6AF', warn: '#9C3B12', warnSoft: '#FBEDE5', on: '#FFFFFF' },
  { id: 'E', name: '晴空丹寧', dark: false, bg: '#F1F4F8', surface: '#FFFFFF', ink: '#1B2433', muted: '#556175', line: '#D8DFE9', accent: '#2D5A9C', accentInk: '#20457D', soft: '#DFE8F5', active: '#F3F7FC', divider: '#EAEFF5', viewport: '#FAFBFD', dashed: '#9FAABB', warn: '#B2423A', warnSoft: '#FBEDEC', on: '#FFFFFF' },
  { id: 'F', name: '午夜毛線', dark: true, bg: '#15181E', surface: '#1F232B', ink: '#E9EBF0', muted: '#A3A9B6', line: '#313744', accent: '#F2A65A', accentInk: '#F7BF85', soft: '#3A2D20', active: '#2A2620', divider: '#282D36', viewport: '#191C22', dashed: '#5A6272', warn: '#FF8A7A', warnSoft: '#3A2224', on: '#15181E' },
];

export function applyTheme(id: ThemeId) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const root = document.documentElement;
  const map: Record<string, string> = {
    bg: t.bg, surface: t.surface, ink: t.ink, muted: t.muted, line: t.line, accent: t.accent,
    'accent-ink': t.accentInk, soft: t.soft, active: t.active, divider: t.divider, viewport: t.viewport,
    dashed: t.dashed, warn: t.warn, 'warn-soft': t.warnSoft, on: t.on,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  root.dataset.theme = t.id;
}
