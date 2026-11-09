import type { YarnColor } from '../types';

/**
 * Built-in yarn lines. The real colour cards have not been provided yet, so
 * every colour here is an approximation with an empty `code`; the UI labels
 * them 「色號待補」 until the owner sends the cards (see the stage plan).
 */
export interface YarnLine {
  brand: string;
  colors: { name: string; hex: string }[];
}

export const YARN_LINES: YarnLine[] = [
  {
    brand: 'HAPPY 牛奶棉',
    colors: [
      { name: '奶油白', hex: '#F4EEDF' }, { name: '南瓜橘', hex: '#E8833A' }, { name: '淺橘', hex: '#F2A766' },
      { name: '檸檬黃', hex: '#F5D36B' }, { name: '櫻花粉', hex: '#F2B8C6' }, { name: '天空藍', hex: '#8FB6D8' },
      { name: '草綠', hex: '#7DB46C' }, { name: '咖啡', hex: '#7A5238' }, { name: '黑', hex: '#2B2B2B' },
    ],
  },
  {
    brand: '唯棉',
    colors: [
      { name: '米白', hex: '#EFE6D6' }, { name: '巫師紫', hex: '#6B4E9B' }, { name: '葉綠', hex: '#3E6B48' },
      { name: '酒紅', hex: '#8E2F45' }, { name: '海軍藍', hex: '#2F3F66' }, { name: '灰', hex: '#9A9A9A' },
    ],
  },
  {
    brand: 'EX991 多股紗',
    colors: [
      { name: '芥末黃', hex: '#D9A520' }, { name: '薄荷綠', hex: '#9ED2C0' }, { name: '玫瑰', hex: '#C9577B' },
      { name: '深藍', hex: '#3E6B8C' }, { name: '燕麥', hex: '#D8C8AE' }, { name: '炭黑', hex: '#3A3A3A' },
    ],
  },
];

let seq = 0;
export function newId(prefix = 'id'): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

export function yarnColor(brand: string, name: string, hex: string): YarnColor {
  return { id: newId('c'), brand, name, hex, code: '' };
}
