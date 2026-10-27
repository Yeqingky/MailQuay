import { describe, expect, it } from 'vitest';
import {
  createMailFrameDocument,
  sanitizeDraftHtml,
  sanitizeMailHtml,
  sanitizeQuotedHtml,
  textToHtml,
  upgradeInsecureUrl,
} from './sanitize';

describe('mail HTML sanitizer', () => {
  it('removes scripts, forms and event handlers', () => {
    const result = sanitizeMailHtml(
      '<p onclick="steal()">Hello<script>alert(1)</script></p><form action="/x"><input></form>',
    );
    expect(result.html).toContain('Hello');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onclick');
    expect(result.html).not.toContain('<form');
    expect(result.html).not.toContain('<input');
  });

  it('removes javascript links and forces safe link attributes', () => {
    const result = sanitizeMailHtml(
      '<a href="javascript:alert(1)">bad</a><a href="https://example.com">good</a>',
    );
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain('rel="noopener noreferrer"');
  });

  it('blocks remote images by default and records the source', () => {
    const result = sanitizeMailHtml(
      '<img src="https://tracker.example/pixel.png" alt="pixel"><img src="data:image/png;base64,AAAA">',
    );
    expect(result.blockedRemoteImages).toBe(1);
    expect(result.html).not.toMatch(/\ssrc="https:/);
    expect(result.html).toContain('data-blocked-src="https://tracker.example/pixel.png"');
    expect(result.html).toContain('data:image/png;base64,AAAA');
  });

  it('hides small blocked icons but still counts them', () => {
    const result = sanitizeMailHtml(
      '<img src="https://img.example/icon.png" width="16" height="16">',
    );
    expect(result.blockedRemoteImages).toBe(1);
    expect(result.html).not.toContain('<img');
  });

  it('drops tracking pixels without counting them', () => {
    const result = sanitizeMailHtml(
      '<img src="https://mail.example/o/pixel.gif" width="1" height="1" alt="">' +
        '<img src="https://img.example/logo.png" width="40" height="40" alt="logo">',
    );
    expect(result.blockedRemoteImages).toBe(1);
    expect(result.html).not.toContain('pixel.gif');
    expect(result.html).toContain('data-blocked-src="https://img.example/logo.png"');
  });

  it('loads remote images only when explicitly allowed', () => {
    const result = sanitizeMailHtml('<img src="https://images.example/a.png">', {
      allowRemoteImages: true,
    });
    expect(result.blockedRemoteImages).toBe(0);
    expect(result.html).toContain('src="https://images.example/a.png"');
  });

  it('restores table background images only when allowed', () => {
    const html = '<table background="https://img.example/bg.png"><tr><td>x</td></tr></table>';
    const blocked = sanitizeMailHtml(html);
    expect(blocked.blockedRemoteImages).toBe(1);
    expect(blocked.html).not.toContain('background="https://img.example');

    const allowed = sanitizeMailHtml(html, { allowRemoteImages: true });
    expect(allowed.blockedRemoteImages).toBe(0);
    expect(allowed.html).toContain('background="https://img.example/bg.png"');
  });

  it('loads remote CSS background images only when explicitly allowed', () => {
    const html =
      '<style>.logo { background-image: url("https://images.example/logo.png") }</style>' +
      '<div style="background: url(https://images.example/banner.png)">mail</div>';

    const blocked = sanitizeMailHtml(html);
    expect(blocked.blockedRemoteImages).toBe(2);
    expect(blocked.html).not.toContain('images.example');

    const allowed = sanitizeMailHtml(html, { allowRemoteImages: true });
    expect(allowed.blockedRemoteImages).toBe(0);
    expect(allowed.html).toContain('url("https://images.example/logo.png")');
    expect(allowed.html).toContain('https://images.example/banner.png');
  });

  it('keeps remote CSS font URLs blocked even when images are allowed', () => {
    const result = sanitizeMailHtml(
      '<style>@font-face { font-family: remote; src: url(https://fonts.example/font.woff) }' +
        '.logo { background-image: url(https://images.example/logo.png) }</style>',
      { allowRemoteImages: true },
    );
    expect(result.blockedRemoteImages).toBe(0);
    expect(result.html).not.toContain('fonts.example');
    expect(result.html).toContain('url("https://images.example/logo.png")');
  });

  it('strips inline styles that fetch remote resources', () => {
    const result = sanitizeMailHtml(
      '<p style="background-image:url(https://tracker.example/a.png)">text</p>',
    );
    expect(result.html).not.toContain('url(');
    expect(result.blockedRemoteImages).toBe(1);
  });

  it('loads inline data images without treating them as remote', () => {
    const result = sanitizeMailHtml('<img data-src="data:image/png;base64,AAAA">');
    expect(result.blockedRemoteImages).toBe(0);
    expect(result.html).toContain('src="data:image/png;base64,AAAA"');
    expect(result.html).not.toContain('data-src');
  });

  it('uses a non-empty lazy image source when src is empty', () => {
    const html = '<img src="" data-src="https://images.example/logo.png">';
    const blocked = sanitizeMailHtml(html);
    expect(blocked.blockedRemoteImages).toBe(1);
    expect(blocked.html).toContain('data-blocked-src="https://images.example/logo.png"');

    const allowed = sanitizeMailHtml(html, { allowRemoteImages: true });
    expect(allowed.blockedRemoteImages).toBe(0);
    expect(allowed.html).toContain('src="https://images.example/logo.png"');
  });

  it('removes cid images that cannot be resolved', () => {
    const result = sanitizeMailHtml('<img src="cid:logo">');
    expect(result.html).not.toContain('cid:');
    expect(result.blockedRemoteImages).toBe(0);
  });

  it('resolves cid images to inline data URLs', () => {
    const result = sanitizeMailHtml('<img src="cid:Image001%40Example">', {
      cidImages: { 'image001@example': 'data:image/png;base64,AAAA' },
    });
    expect(result.blockedRemoteImages).toBe(0);
    expect(result.html).toContain('src="data:image/png;base64,AAAA"');
    expect(result.html).not.toContain('cid:');
  });

  it('keeps safe style blocks and removes remote CSS loads', () => {
    const result = sanitizeMailHtml(
      '<style>@media only screen { .container { width: 95% !important } }' +
        '.bg { background: url(https://tracker.example/a.png); color: #111111 }</style>' +
        '<p class="container">text</p>',
    );
    expect(result.html).toContain('@media only screen');
    expect(result.html).toContain('.container');
    expect(result.html).toContain('text');
    expect(result.html).not.toContain('tracker.example');
  });

  it('blocks CSS-escaped remote URLs', () => {
    const html =
      '<style>.a { background-image: u\\72l(https://tracker.example/a.png) }</style>' +
      '<div style="background: u\\72l(//tracker.example/b.png)">mail</div>';
    const blocked = sanitizeMailHtml(html);
    expect(blocked.blockedRemoteImages).toBe(2);
    expect(blocked.html).not.toContain('tracker.example');
    expect(blocked.html).not.toContain('u\\72l');
  });

  it('blocks escaped same-origin URLs in mail CSS', () => {
    const result = sanitizeMailHtml(
      '<div style="background-image: u\\72l(/api/v1/settings)">mail</div>',
    );
    expect(result.html).not.toContain('/api/v1/settings');
    expect(result.html).not.toContain('u\\72l');
  });

  it('applies the image policy to image-set and image functions', () => {
    const html =
      '<style>.a { background-image: image-set("https://tracker.example/a.png" 1x) }</style>' +
      "<div style=\"background: image('https://tracker.example/b.png')\">mail</div>";
    const blocked = sanitizeMailHtml(html);
    expect(blocked.blockedRemoteImages).toBe(2);
    expect(blocked.html).not.toContain('tracker.example');

    const allowed = sanitizeMailHtml(html, { allowRemoteImages: true });
    expect(allowed.blockedRemoteImages).toBe(0);
    expect(allowed.html).toContain('image-set("https://tracker.example/a.png" 1x)');
    expect(allowed.html).toContain("image('https://tracker.example/b.png')");
  });

  it('keeps data image-set entries and drops relative ones', () => {
    const kept = sanitizeMailHtml(
      '<div style="background-image: image-set(url(data:image/png;base64,AAAA) 1x)">x</div>',
    );
    expect(kept.html).toContain('image-set(url(data:image/png;base64,AAAA) 1x)');

    const relative = sanitizeMailHtml(
      '<div style="background-image: image-set("/api/v1/settings" 1x)">x</div>',
    );
    expect(relative.html).not.toContain('/api/v1/settings');
  });

  it('strips styling and images from quoted mail HTML', () => {
    const quoted = sanitizeQuotedHtml(
      '<style>body{position:fixed;inset:0}</style>' +
        '<div class="fixed inset-0" id="overlay" style="position:fixed" background="https://tracker.example/bg.png">x</div>' +
        '<img src="https://tracker.example/pixel.png"><b>keep</b>',
    );
    expect(quoted).not.toContain('<style');
    expect(quoted).not.toContain('class=');
    expect(quoted).not.toContain('id=');
    expect(quoted).not.toContain('style=');
    expect(quoted).not.toContain('<img');
    expect(quoted).not.toContain('tracker.example');
    expect(quoted).toContain('<b>keep</b>');
  });

  it('keeps formatting and data images when restoring a draft', () => {
    const draft = sanitizeDraftHtml(
      '<p style="color: #333; text-align: center">Hello <b>there</b></p>' +
        '<img src="data:image/png;base64,AAAA" alt="">' +
        '<a href="https://example.com/a">link</a>',
    );
    expect(draft).toContain('style="color: #333; text-align: center"');
    expect(draft).toContain('src="data:image/png;base64,AAAA"');
    expect(draft).toContain('<b>there</b>');
    expect(draft).toContain('href="https://example.com/a"');
  });

  it('removes escaping and fetching markup from drafts', () => {
    const draft = sanitizeDraftHtml(
      '<style>body{position:fixed;inset:0}</style>' +
        '<div class="overlay" id="cover" style="position: fixed; color: red" background="https://tracker.example/bg.png">x</div>' +
        '<span style="pos\\69 tion: fixed; font-weight: bold">y</span>' +
        '<img src="https://tracker.example/pixel.png">',
    );
    expect(draft).not.toContain('<style');
    expect(draft).not.toContain('class=');
    expect(draft).not.toContain('id=');
    expect(draft).not.toContain('background=');
    expect(draft).not.toContain('position');
    expect(draft).not.toContain('tracker.example');
    expect(draft).toContain('style="color: red"');
    expect(draft).toContain('font-weight: bold');
  });

  it('upgrades insecure image URLs on secure pages', () => {
    expect(upgradeInsecureUrl('http://example.com/a.png', true)).toBe(
      'https://example.com/a.png',
    );
    expect(upgradeInsecureUrl('http://example.com/a.png', false)).toBe(
      'http://example.com/a.png',
    );
    expect(upgradeInsecureUrl('https://example.com/a.png', true)).toBe(
      'https://example.com/a.png',
    );
  });

  it('escapes plain text fallbacks', () => {
    expect(textToHtml('<b>not html</b>')).toContain('&lt;b&gt;');
  });

  it('builds a sandbox-ready frame document', () => {
    const documentHtml = createMailFrameDocument('<p>Body</p>');
    expect(documentHtml).toContain('<!doctype html>');
    expect(documentHtml).toContain('<p>Body</p>');
    expect(documentHtml).toContain('CanvasText');
    expect(documentHtml).toContain('color-scheme: light');
  });

  it('uses the dark color scheme when requested', () => {
    const documentHtml = createMailFrameDocument('<p>Body</p>', true);
    expect(documentHtml).toContain('color-scheme: dark');
    expect(documentHtml).toContain('name="color-scheme" content="dark"');
  });
});
