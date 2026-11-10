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
  /** A flat strip that is rolled up after crocheting (rose, cream ruffle). */
  roll?: boolean;
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

export type V3 = [number, number, number];

/** One copy of a part placed in a work's 3D scene. */
export interface WorkItem {
  id: string;
  partId: string;
  pos: V3;
  /** Euler angles in degrees (XYZ). */
  rot: V3;
  scale: number;
  /** Left–right mirror image. */
  mirror?: boolean;
}

export type AccessoryKind = 'eye' | 'nose' | 'mouth' | 'blush' | 'bow' | 'button';

/** A safety eye, nose, embroidered mouth… placed on the work. */
export interface Accessory {
  id: string;
  kind: AccessoryKind;
  pos: V3;
  /** Direction the accessory faces (the surface normal where it was placed). */
  normal: V3;
  /** Spin around the normal, degrees. */
  spin: number;
  /** Size in stitch units (about 1 = one single crochet). */
  size: number;
  color: string;
}

export interface Work {
  id: string;
  name: string;
  partIds: string[];
  /** 3D placement of each part copy; missing on works made before assembly existed. */
  items?: WorkItem[];
  accessories?: Accessory[];
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
  /** Which batch of example parts this account has been given. */
  sampleVersion?: number;
}
