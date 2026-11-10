import type { Method, PatternRow, StartKind } from './pattern/analyze';

export interface YarnColor {
  id: string;
  name: string;
  hex: string;
  /** Yarn line, e.g. HAPPY 牛奶棉. Empty for a custom colour. */
  brand: string;
  /** Colour number on the brand's card. Empty when unknown. */
  code: string;
}

export interface PartSettings {
  method: Method;
  start: StartKind;
  yarn: string;
  /** Hook size in mm. */
  hook: number;
  /** Show the part upside down (a hat starts at its tip). */
  flip?: boolean;
}

export interface Part {
  id: string;
  name: string;
  settings: PartSettings;
  rows: PatternRow[];
  palette: YarnColor[];
  /** Colour of one stitch: key `${rowId}#${inRow}#${stitchIndex}` → colour id. */
  stitchColors: Record<string, string>;
  /** Colour of a whole round: key `${rowId}#${inRow}` → colour id. */
  roundColors: Record<string, string>;
  tags: string[];
  updatedAt: number;
  sample?: boolean;
}

export interface Work {
  id: string;
  name: string;
  partIds: string[];
  tags: string[];
  updatedAt: number;
  sample?: boolean;
}

export type ThemeId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Prefs {
  theme: ThemeId;
  /** Stitch button order, by code. */
  stitchOrder: string[];
  display: 'code' | 'chinese';
  /** Draw stitches as real yarn in 3D (a new key, so older saved settings don't switch it off). */
  yarn: boolean;
  stuffed: boolean;
  background: 'white' | 'transparent';
  symbolColor: 'symbol' | 'cell';
  /** Width of the 3D panel on wide screens, in px. */
  panelWidth: number;
}
