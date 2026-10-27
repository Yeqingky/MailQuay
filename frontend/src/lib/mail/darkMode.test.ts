import { describe, expect, it } from 'vitest';
import { darkenMailStyles } from './darkMode';

function render(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  darkenMailStyles(host);
  return host;
}

function rgb(value: string): { r: number; g: number; b: number; a: number } {
  const match = value.match(/rgba?\(([^)]+)\)/);
  expect(match).not.toBeNull();
  const parts = (match?.[1] ?? '').split(',').map((part) => Number.parseFloat(part.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

describe('dark mail styles', () => {
  it('turns neutral light backgrounds dark', () => {
    const host = render('<div style="background-color:#ffffff"></div>');
    const color = rgb((host.firstElementChild as HTMLElement).style.backgroundColor);
    expect(Math.max(color.r, color.g, color.b)).toBeLessThan(90);
  });

  it('keeps tinted pastel backgrounds', () => {
    const host = render('<div style="background-color:#d7e6fe"></div>');
    const color = rgb((host.firstElementChild as HTMLElement).style.backgroundColor);
    expect(color).toEqual({ r: 215, g: 230, b: 254, a: 1 });
  });

  it('keeps text readable on inherited light accents', () => {
    const host = render(
      '<div style="background-color:#d7e6fe"><a style="color:#808189">Cloud</a></div>',
    );
    const link = host.querySelector('a') as HTMLElement;
    expect(rgb(link.style.color)).toEqual({ r: 128, g: 129, b: 137, a: 1 });
  });

  it('turns dark text light', () => {
    const host = render('<p style="color:#111827">text</p>');
    const color = rgb((host.firstElementChild as HTMLElement).style.color);
    expect(Math.min(color.r, color.g, color.b)).toBeGreaterThan(120);
  });

  it('keeps saturated accents and their text colors', () => {
    const host = render(
      '<div style="background-color:#064e3b;color:#ffffff">header</div>' +
        '<span style="background-color:#fef3c7;color:#92400e">badge</span>',
    );
    const [header, badge] = Array.from(host.children) as HTMLElement[];
    expect(rgb(header.style.backgroundColor)).toEqual({ r: 6, g: 78, b: 59, a: 1 });
    expect(rgb(header.style.color)).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(rgb(badge.style.backgroundColor)).toEqual({ r: 254, g: 243, b: 199, a: 1 });
    expect(rgb(badge.style.color)).toEqual({ r: 146, g: 64, b: 14, a: 1 });
  });

  it('darkens light borders and keeps accent borders', () => {
    const host = render(
      '<div style="border:1px solid #e5e7eb;border-bottom:2px solid #10b981"></div>',
    );
    const style = (host.firstElementChild as HTMLElement).style;
    const light = rgb(style.borderTopColor);
    expect(Math.max(light.r, light.g, light.b)).toBeLessThan(120);
    expect(rgb(style.borderBottomColor)).toEqual({ r: 16, g: 185, b: 129, a: 1 });
  });

  it('flips translucent dark overlays to light overlays', () => {
    const host = render('<div style="background-color:rgba(0,0,0,0.05)"></div>');
    const color = rgb((host.firstElementChild as HTMLElement).style.backgroundColor);
    expect(color.r).toBe(255);
    expect(color.a).toBeCloseTo(0.05, 3);
  });

  it('transforms legacy bgcolor and color attributes', () => {
    const host = render('<table bgcolor="#ffffff"><tr><td><font color="#000000">x</font></td></tr></table>');
    const table = host.querySelector('table')!;
    expect(Math.max(...Object.values(rgb(table.getAttribute('bgcolor')!)).slice(0, 3))).toBeLessThan(90);
    const font = host.querySelector('font')!;
    expect(Math.min(...Object.values(rgb(font.getAttribute('color')!)).slice(0, 3))).toBeGreaterThan(120);
  });
});
