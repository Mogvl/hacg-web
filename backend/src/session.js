// Per-client session: cookie jar (for hacg site logins) + detected user id.
// Mirrors the Android app's WebkitCookieJar + the "user" shared preference.
import crypto from 'node:crypto';

const sessions = new Map();
const TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

function now() {
  return Date.now();
}

export function createSession() {
  const id = crypto.randomUUID();
  const s = {
    id,
    cookies: [], // {name, value, domain, path, expires, secure, raw}
    user: 0,
    updated: now(),
  };
  sessions.set(id, s);
  return id;
}

export function getSession(id) {
  const s = id ? sessions.get(id) : null;
  if (!s) return null;
  s.updated = now();
  return s;
}

// Periodic cleanup of stale sessions
setInterval(() => {
  const cutoff = now() - TTL;
  for (const [id, s] of sessions) {
    if (s.updated < cutoff) sessions.delete(id);
  }
}, 1000 * 60 * 60).unref();

// ---------- cookie jar (subset of RFC6265, enough for wp/wpForo) ----------

function defaultPath(pathname) {
  if (!pathname || !pathname.startsWith('/')) return '/';
  const i = pathname.lastIndexOf('/');
  return i <= 0 ? '/' : pathname.slice(0, i);
}

function parseSetCookie(raw, requestUrl) {
  const parts = raw.split(';');
  const [name, ...rest] = parts[0].split('=');
  if (!name) return null;
  const cookie = {
    name: name.trim(),
    value: rest.join('=').trim(),
    domain: requestUrl.hostname,
    path: '/',
    expires: null,
    secure: false,
    raw,
  };
  for (let i = 1; i < parts.length; i++) {
    const [k, ...v] = parts[i].trim().split('=');
    const key = k.toLowerCase();
    const val = v.join('=').trim();
    if (key === 'domain') {
      let d = val.replace(/^\./, '');
      if (d) cookie.domain = d.toLowerCase();
    } else if (key === 'path') {
      if (val) cookie.path = val;
    } else if (key === 'expires') {
      const t = Date.parse(val);
      if (!Number.isNaN(t)) cookie.expires = t;
    } else if (key === 'max-age') {
      const n = parseInt(val, 10);
      if (!Number.isNaN(n)) cookie.expires = n <= 0 ? 0 : now() + n * 1000;
    } else if (key === 'secure') {
      cookie.secure = true;
    }
  }
  return cookie;
}

function domainMatches(cookieDomain, hostname) {
  const h = hostname.toLowerCase();
  const d = cookieDomain.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

function cookieMatches(cookie, url) {
  if (cookie.expires !== null && cookie.expires !== undefined && cookie.expires < now()) return false;
  if (cookie.secure && url.protocol !== 'https:') return false;
  if (!domainMatches(cookie.domain, url.hostname)) return false;
  const path = url.pathname || '/';
  if (!path.startsWith(cookie.path)) return false;
  return true;
}

export function saveResponseCookies(session, setCookieHeaders, url) {
  for (const raw of setCookieHeaders || []) {
    const cookie = parseSetCookie(raw, url);
    if (!cookie) continue;
    // expire cookie -> remove
    if (cookie.expires !== null && cookie.expires <= now()) {
      session.cookies = session.cookies.filter(
        (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
      );
      continue;
    }
    // replace by (name, domain, path)
    session.cookies = session.cookies.filter(
      (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );
    session.cookies.push(cookie);
  }
}

export function cookieHeader(session, url) {
  return session.cookies
    .filter((c) => cookieMatches(c, url))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}
