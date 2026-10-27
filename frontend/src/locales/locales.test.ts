import { describe, expect, it } from 'vitest';
import en from './en';
import zhCN from './zh-CN';

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, entry]) =>
    collectKeys(entry, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translation resources', () => {
  it('keeps English and Simplified Chinese key sets in sync', () => {
    const english = collectKeys(en).sort();
    const chinese = collectKeys(zhCN).sort();
    expect(chinese).toEqual(english);
  });

  it('does not leave empty translated strings', () => {
    const values: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') {
        values.push(value);
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const entry of Object.values(value)) walk(entry);
      }
    };
    walk(en);
    walk(zhCN);
    expect(values.every((value) => value.trim() !== '')).toBe(true);
  });
});
