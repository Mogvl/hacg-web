// HTTP layer: mirrors Common.kt (okhttp client) — GET/POST with cookie session,
// manual redirects so Set-Cookie headers on every hop are captured,
// and "user_id" detection on wordpress pages (Common.kt httpGetAwait).
import { saveResponseCookies, cookieHeader } from './session.js';

export const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const READ_TIMEOUT = 30_000;
const MAX_REDIRECTS = 8;

const USER_ID_RE = /"user_id":"(\d+)"/;

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

// Manual redirect loop — captures Set-Cookie on each hop (fetch 'follow' loses them).
export async function fetchSession(session, url, { method = 'GET', body, headers = {}, redirects = MAX_REDIRECTS, timeout = READ_TIMEOUT } = {}) {
  let current = url;
  for (let hop = 0; hop <= redirects; hop++) {
    const u = new URL(current);
    const h = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...headers,
    };
    if (session) {
      const c = cookieHeader(session, u);
      if (c) h.Cookie = c;
    }
    const res = await fetch(current, {
      method,
      headers: h,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
    if (session) {
      saveResponseCookies(session, res.headers.getSetCookie?.() || [], new URL(current));
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      if (method === 'POST' && res.status === 302) method = 'GET'; // 302: browsers switch to GET
      continue;
    }
    return { response: res, url: current };
  }
  throw new HttpError('Too many redirects', 0);
}

export async function readText(response, fallbackUrl = '') {
  const buf = Buffer.from(await response.arrayBuffer());
  return { text: buf.toString('utf8'), url: response.url || fallbackUrl };
}

export function detectUserId(text) {
  const m = USER_ID_RE.exec(text);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

// Mirrors Common.kt String.httpGetAwait(): returns {html, url} or null on failure.
// Detects "user_id" on wordpress pages (when wordpressBase is provided).
export async function httpGetAwait(session, url, { wordpressBase = null, headers = {}, timeout } = {}) {
  try {
    const { response } = await fetchSession(session, url, { headers, timeout });
    if (!response.ok) return null;
    const { text, url: finalUrl } = await readText(response, url);
    if (session && wordpressBase && finalUrl.startsWith(wordpressBase)) {
      const id = detectUserId(text);
      if (id) session.user = id;
    }
    return { html: text, url: finalUrl };
  } catch (e) {
    console.error('[httpGetAwait]', url, e.message);
    return null;
  }
}

// Mirrors Common.kt String.httpPostAwait(): multipart/form-data POST, returns {html,url} or null.
export async function httpPostAwait(session, url, form = {}, { headers = {}, timeout } = {}) {
  try {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, String(v));
    const { response } = await fetchSession(session, url, {
      method: 'POST',
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest', ...headers },
      timeout,
    });
    // 4xx/5xx still returns a body we may want (wpdiscuz returns messages) — keep body regardless
    const { text } = await readText(response, url);
    return { html: text, url: response.url || url };
  } catch (e) {
    console.error('[httpPostAwait]', url, e.message);
    return null;
  }
}

// host test — mirrors String.test(): TCP-connect latency. Web analog: HTTPS GET latency.
export async function testHost(host, timeout = 4000) {
  const begin = Date.now();
  try {
    const res = await fetch(`https://${host}/wp/`, {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
    if (res.status >= 400) return { ok: false, ms: 0 };
    return { ok: true, ms: Date.now() - begin };
  } catch {
    return { ok: false, ms: 0 };
  }
}
