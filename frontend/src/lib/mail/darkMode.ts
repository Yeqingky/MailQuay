type Rgba = { r: number; g: number; b: number; a: number };
type Hsv = { h: number; s: number; v: number };
type ColorRole = 'background' | 'text' | 'border';

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
};

const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|\b(?:black|silver|gray|grey|white|maroon|red|purple|fuchsia|green|lime|olive|yellow|navy|blue|teal|aqua)\b/gi;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return null;
  const named = NAMED_COLORS[value];
  if (named) return parseColor(named);

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const rgb = value.match(/^rgba?\((.*)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    return {
      r: clamp(Number.parseFloat(parts[0]), 0, 255),
      g: clamp(Number.parseFloat(parts[1]), 0, 255),
      b: clamp(Number.parseFloat(parts[2]), 0, 255),
      a: parts[3] === undefined ? 1 : clamp(Number.parseFloat(parts[3]), 0, 1),
    };
  }

  const hsl = value.match(/^hsla?\((.*)\)$/);
  if (hsl) {
    const parts = hsl[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = Number.parseFloat(parts[0]);
    const s = clamp(Number.parseFloat(parts[1]) / 100, 0, 1);
    const l = clamp(Number.parseFloat(parts[2]) / 100, 0, 1);
    const a = parts[3] === undefined ? 1 : clamp(Number.parseFloat(parts[3]), 0, 1);
    return { ...hslToRgb(h, s, l), a };
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number;
  let g: number;
  let b: number;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsv({ r, g, b }: Rgba): Hsv {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / delta + 2);
    else h = 60 * ((rr - gg) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): Rgba {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r: number;
  let g: number;
  let b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
}

function formatColor(color: Rgba): string {
  const round = (value: number) => Math.round(clamp(value, 0, 255));
  if (color.a < 1) {
    return `rgba(${round(color.r)}, ${round(color.g)}, ${round(color.b)}, ${Math.round(color.a * 1000) / 1000})`;
  }
  return `rgb(${round(color.r)}, ${round(color.g)}, ${round(color.b)})`;
}

function darkBackground(color: Rgba): { color: Rgba; keptLight: boolean } {
  if (color.a < 1) {
    return { color: { r: 255, g: 255, b: 255, a: color.a }, keptLight: false };
  }
  const { h, s, v } = rgbToHsv(color);
  // Saturated accents (badges, buttons, header bars) keep their colors.
  if (s > 0.1 && v > 0.35) return { color, keptLight: v > 0.5 };
  if (v < 0.35) return { color, keptLight: false };
  return { color: hsvToRgb(h, Math.min(s, 0.5), 0.16 + 0.06 * (1 - v)), keptLight: false };
}

function darkText(color: Rgba): Rgba {
  if (color.a < 1) return color;
  const { h, s, v } = rgbToHsv(color);
  if (v >= 0.6) return color;
  return hsvToRgb(h, Math.min(s, 0.35), 0.85);
}

function darkBorder(color: Rgba): Rgba {
  if (color.a < 1) {
    return { r: 255, g: 255, b: 255, a: Math.min(1, color.a * 0.7) };
  }
  const { h, s, v } = rgbToHsv(color);
  if (s > 0.1 && v > 0.35) return color;
  if (v < 0.3) return color;
  return hsvToRgb(h, Math.min(s, 0.2), 0.28);
}

function roleForProperty(name: string): ColorRole | null {
  if (name === 'color' || name === 'text-decoration-color') return 'text';
  if (name === 'background' || name === 'background-color') return 'background';
  if (name === 'border' || name.startsWith('border-') || name === 'outline' || name === 'outline-color') {
    return 'border';
  }
  return null;
}

function transformValue(
  value: string,
  role: ColorRole,
  transformText: boolean,
): { value: string; keptLight: boolean } {
  let keptLight = false;
  const next = value.replace(COLOR_TOKEN, (token) => {
    const color = parseColor(token);
    if (!color) return token;
    if (role === 'text') {
      return transformText ? formatColor(darkText(color)) : token;
    }
    if (role === 'background') {
      const result = darkBackground(color);
      if (result.keptLight) keptLight = true;
      return formatColor(result.color);
    }
    return formatColor(darkBorder(color));
  });
  return { value: next, keptLight };
}

// darkenMailCss rewrites colors inside a sanitized style block. Each rule is
// processed independently, keeping accent backgrounds and their text colors.
export function darkenMailCss(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_whole, selector: string, body: string) => {
    const declarations = body.split(';');
    const values = declarations.slice();
    const roles: Record<number, ColorRole> = {};
    let keptLightBackground = false;

    declarations.forEach((declaration, index) => {
      const colon = declaration.indexOf(':');
      if (colon < 0) return;
      const name = declaration.slice(0, colon).trim().toLowerCase();
      const role = roleForProperty(name);
      if (!role) return;
      roles[index] = role;
      if (role !== 'background') return;
      const result = transformValue(declaration.slice(colon + 1), role, false);
      if (result.keptLight) keptLightBackground = true;
      values[index] = declaration.slice(0, colon + 1) + result.value;
    });

    declarations.forEach((declaration, index) => {
      if (roles[index] !== 'text') return;
      const colon = declaration.indexOf(':');
      if (colon < 0) return;
      const result = transformValue(declaration.slice(colon + 1), 'text', !keptLightBackground);
      values[index] = declaration.slice(0, colon + 1) + result.value;
    });

    return `${selector}{${values.join(';')}}`;
  });
}

function isLightValue(value: string): boolean | null {
  const match = value.match(COLOR_TOKEN);
  if (!match) return null;
  const color = parseColor(match[0]);
  if (!color) return null;
  return rgbToHsv(color).v > 0.5;
}

// darkenMailStyles rewrites inline colors for dark mode. Neutral light
// backgrounds become dark, dark text becomes light, and saturated accents keep
// their colors so branded headers and badges still read as designed.
// Text colors are evaluated against the nearest background, including
// inherited backgrounds, so labels on light accent bars stay readable.
export function darkenMailStyles(root: ParentNode): void {
  const visit = (element: HTMLElement, inheritedLight: boolean): void => {
    const style = element.style;
    let light = inheritedLight;

    for (const name of Array.from(style)) {
      if (roleForProperty(name) !== 'background') continue;
      const current = style.getPropertyValue(name);
      if (current.trim() === '') continue;
      const result = transformValue(current, 'background', false);
      style.setProperty(name, result.value, style.getPropertyPriority(name));
      const state = result.keptLight ? true : isLightValue(result.value);
      if (state !== null) light = state;
    }

    const bgcolor = element.getAttribute('bgcolor');
    if (bgcolor) {
      const color = parseColor(bgcolor);
      if (color) {
        const result = darkBackground(color);
        element.setAttribute('bgcolor', formatColor(result.color));
        light = result.keptLight || rgbToHsv(result.color).v > 0.5;
      }
    }

    for (const name of Array.from(style)) {
      if (roleForProperty(name) !== 'border') continue;
      const current = style.getPropertyValue(name);
      if (current.trim() === '') continue;
      const result = transformValue(current, 'border', false);
      style.setProperty(name, result.value, style.getPropertyPriority(name));
    }

    for (const name of Array.from(style)) {
      if (roleForProperty(name) !== 'text') continue;
      const current = style.getPropertyValue(name);
      if (current.trim() === '') continue;
      const result = transformValue(current, 'text', !light);
      style.setProperty(name, result.value, style.getPropertyPriority(name));
    }

    for (const attribute of ['color', 'text']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const color = parseColor(value);
      if (!color) continue;
      element.setAttribute(attribute, formatColor(light ? color : darkText(color)));
    }

    for (const child of element.children) {
      if (child instanceof HTMLElement) visit(child, light);
    }
  };

  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement) visit(child, false);
  }
}
