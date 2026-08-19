// Proxy rewrite unit tests (webview CSS/HTML injection).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyFetch, rewriteHtml, rewriteCss } from '../src/proxy.js';
import { createSession, getSession } from '../src/session.js';

const ORIGIN = 'http://localhost:8200';

test('proxyFetch: non-http scheme rejected', async () => {
  await assert.rejects(() => proxyFetch(null, 'file:///etc/passwd', {}, ORIGIN), /仅支持 https?/);
});

test('proxyFetch: localhost SSRF guard', async () => {
  await assert.rejects(() => proxyFetch(null, 'http://127.0.0.1:8201/api/health', {}, ORIGIN), /不允许/);
});

test('proxyFetch: real page gets base + interceptor injected (live site)', async () => {
  const session = getSession(createSession());
  const r = await proxyFetch(session, 'https://www.hacg.icu/wp/bbs', {}, ORIGIN);
  assert.equal(r.status, 200);
  const html = r.body.toString('utf8');
  assert.ok(html.includes('<base href="https://www.hacg.icu/wp/bbs"'), 'base injected');
  assert.ok(html.includes('hacg-nav'), 'interceptor injected');
  assert.ok(html.includes(`http://localhost:8200/api/proxy?url=`), 'absolute proxy base');
});

test('proxyFetch: stylesheet links routed through absolute proxy', async () => {
  const session = getSession(createSession());
  const r = await proxyFetch(session, 'https://www.hacg.icu/wp/bbs', {}, ORIGIN);
  const html = r.body.toString('utf8');
  // find a stylesheet link and check its href carries our origin
  const hrefs = [...html.matchAll(/rel=["']?stylesheet[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, 'page has stylesheets');
  assert.ok(hrefs.every((h) => h.startsWith(`${ORIGIN}/api/proxy?url=`)), 'stylesheets proxied absolutely');
});

test('rewriteCss: url() references rewritten and absolute', () => {
  const css = `body { background: url('images/bg.png'); } @font-face { src: url(https://x.com/f.woff2) format('woff2'); } .a { background: url(data:image/png;base64,AAAA) }`;
  const out = rewriteCss(css, 'https://www.hacg.icu/wp/wp-content/themes/t/style.css', ORIGIN);
  assert.ok(out.includes(`url('${ORIGIN}/api/proxy?url=${encodeURIComponent('https://www.hacg.icu/wp/wp-content/themes/t/images/bg.png')}')`), 'relative resolved + proxied');
  assert.ok(out.includes(`url(${ORIGIN}/api/proxy?url=${encodeURIComponent('https://x.com/f.woff2')})`), 'absolute proxied');
  assert.ok(out.includes('url(data:image/png;base64,AAAA)'), 'data uris untouched');
});

test('rewriteHtml: base + script injection with fallback when no head', () => {
  const html = '<html><body>x</body></html>';
  const out = rewriteHtml(html, 'https://www.hacg.icu/wp/', ORIGIN);
  assert.ok(out.startsWith('<html><base href="https://www.hacg.icu/wp/"><script>'), 'injected after <html>');
  assert.ok(out.includes('var PROXY = "http://localhost:8200/api/proxy?url=";'), 'absolute PROXY constant');
});