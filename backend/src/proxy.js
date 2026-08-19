// Page proxy for the in-app browser (WebView equivalent: philosophy bbs / login / user profile).
// Fetches pages through the backend session cookie jar, injects <base> + a navigation
// interceptor so that:
//   - same-site link clicks are reported to the parent app (which routes article/list URLs
//     in-app like the Android openUri(), and keeps other same-site pages in the webview)
//   - cross-site links open in a new tab (like Android's ACTION_VIEW chooser)
//   - form submits go through the proxy so login cookies always land in our session
//   - page XHR/fetch calls are routed through the proxy too (like WebView cookies)
import { fetchSession, detectUserId, readText } from './http.js';
import { wordpress } from './config.js';

function isHttpUrl(u) {
  return /^https?:\/\//i.test(u);
}

const INTERCEPT = `(function () {
  var SITE = %SITE%;
  var PROXY = %PROXY%;
  function abs(h) { try { return new URL(h, document.baseURI).href; } catch (e) { return null; } }
  function origin(u) { try { return new URL(u).origin; } catch (e) { return null; } }
  function sameSite(u) { return origin(u) === SITE; }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || /^javascript:/i.test(href)) return;
    href = abs(href);
    if (!href) return;
    if (sameSite(href)) {
      e.preventDefault();
      parent.postMessage({ type: 'hacg-nav', url: href }, '*');
      return;
    }
    if (origin(href) === location.origin) return; // already ours (a proxy url), let it go
    if (a.target === '_self') {
      e.preventDefault();
      parent.postMessage({ type: 'hacg-nav', url: href }, '*');
      return;
    }
    e.preventDefault();
    window.open(href, '_blank');
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    e.preventDefault();
    var action = abs(f.getAttribute('action') || document.baseURI);
    if (!action) return;
    f.setAttribute('action', PROXY + encodeURIComponent(action));
    f.submit();
  }, true);
  try {
    var ORIG = window.fetch;
    if (ORIG) window.fetch = function (input, init) {
      try {
        var u = typeof input === 'string' ? abs(input) : (input && input.url ? abs(input.url) : null);
        if (u && sameSite(u)) {
          init = init || {};
          init.redirect = 'follow';
          input = PROXY + encodeURIComponent(u);
        }
      } catch (e) {}
      return ORIG.call(this, input, init);
    };
  } catch (e) {}
  try {
    var OXHR = window.XMLHttpRequest;
    if (OXHR) window.XMLHttpRequest = function () {
      var xhr = new OXHR();
      var oOpen = xhr.open.bind(xhr);
      xhr.open = function (method, url) {
        try {
          var u = abs(url);
          if (u && sameSite(u)) url = PROXY + encodeURIComponent(u);
        } catch (e) {}
        return oOpen(method, url);
      };
      return xhr;
    };
  } catch (e) {}
})();`;

function rewriteHtml(html, finalUrl) {
  const site = new URL(finalUrl).origin;
  const script = `<script>${INTERCEPT.replace('%SITE%', JSON.stringify(site)).replace('%PROXY%', JSON.stringify('/api/proxy?url='))}</script>`;
  const base = `<base href="${finalUrl.split('#')[0]}">`;
  const headMatch = /<head([^>]*)>/i.exec(html);
  if (headMatch) {
    const idx = headMatch.index + headMatch[0].length;
    return html.slice(0, idx) + base + script + html.slice(idx);
  }
  const htmlIdx = /<html([^>]*)>/i.exec(html);
  if (htmlIdx) {
    const idx = htmlIdx.index + htmlIdx[0].length;
    return html.slice(0, idx) + base + script + html.slice(idx);
  }
  return base + script + html;
}

/**
 * Fetch a page through the session and return { status, headers, body (Buffer|ReadableStream) }.
 * HTML pages get rewritten; other content is passed through.
 */
export async function proxyFetch(session, url, { method = 'GET', body = null, headers = {} } = {}) {
  if (!isHttpUrl(url)) {
    const e = new Error('仅支持 http/https 地址');
    e.status = 400;
    throw e;
  }
  // SSRF guard: block obvious local targets
  const u = new URL(url);
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(u.hostname)) {
    const e = new Error('地址不允许访问');
    e.status = 400;
    throw e;
  }
  const { response } = await fetchSession(session, url, { method, body, headers });
  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || url;

  // user id detection on wordpress pages (Common.kt httpGetAwait behavior)
  if (session && contentType.includes('text/html') && finalUrl.startsWith(wordpress())) {
    const { text } = await readText(response, finalUrl);
    if (text) {
      const id = detectUserId(text);
      if (id) session.user = id;
      return {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': String(Buffer.byteLength(rewriteHtml(text, finalUrl))),
        },
        body: Buffer.from(rewriteHtml(text, finalUrl), 'utf8'),
        finalUrl,
      };
    }
  }
  if (contentType.includes('text/html')) {
    const { text } = await readText(response, finalUrl);
    const out = rewriteHtml(text || '', finalUrl);
    return {
      status: response.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(out, 'utf8')),
      },
      body: Buffer.from(out, 'utf8'),
      finalUrl,
    };
  }
  // passthrough (json/css/js/images...)
  const outHeaders = {
    'Content-Type': contentType || 'application/octet-stream',
  };
  const cd = response.headers.get('content-disposition');
  if (cd) outHeaders['Content-Disposition'] = cd;
  return { status: response.status, headers: outHeaders, body: response.body, finalUrl };
}

// Lightweight image proxy (fallback for hotlink-protected images).
export async function proxyImage(url) {
  if (!isHttpUrl(url)) {
    const e = new Error('仅支持 http/https 地址');
    e.status = 400;
    throw e;
  }
  const { response } = await fetchSession(null, url, {});
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  return { status: response.status, headers: { 'Content-Type': contentType }, body: response.body };
}