// HACG web backend — Express API on port 8201.
// Feature parity with yueeng/hacg Android app:
//   /api/state, /api/config(+/check/update), /api/hosts(+edit/reset/auto),
//   /api/articles, /api/article, /api/comments(load/vote/add), /api/user,
//   /api/proxy (in-app browser), /api/image (image proxy)
import express from 'express';
import { Readable } from 'node:stream';
import { createSession, getSession } from './session.js';
import {
  stateSnapshot, hosts, host, saveHosts, checkConfigUpdate, applyConfigUpdate,
  autoHost, wordpress, philosophy, web, APP_VERSION,
} from './config.js';
import { httpGetAwait, httpPostAwait } from './http.js';
import { parseArticleList, parseArticleDetail } from './article.js';
import { loadComments, voteComment, postComment } from './comment.js';
import { proxyFetch, proxyImage } from './proxy.js';
import { translateBatch, tagCandidatesFor, translateToJapanese } from './translate.js';

const PORT = process.env.BACKEND_PORT || 8201;
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// session: mirrors the app's SharedPreferences (user id, cookies)
app.use((req, res, next) => {
  let id = req.cookies?.hacg_session;
  if (!id || !req.headers.cookie) {
    const m = /(?:^|;\s*)hacg_session=([^;]+)/.exec(req.headers.cookie || '');
    id = m ? m[1] : null;
  }
  let session = id ? getSession(id) : null;
  if (!session) {
    session = getSession(createSession());
    res.setHeader('Set-Cookie', `hacg_session=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  }
  req.session = session;
  next();
});

app.use(express.json());

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[api]', req.method, req.originalUrl, e.message);
    res.status(e.status || 500).json({ error: e.message || '服务器错误' });
  });
};

// ---------- config / hosts (HAcg object) ----------

app.get('/api/state', wrap(async (req, res) => {
  res.json({ ...stateSnapshot(), user: req.session.user, web: web(), wordpress: wordpress(), philosophy: philosophy() });
}));

app.get('/api/config/check', wrap(async (req, res) => {
  const result = await checkConfigUpdate();
  if (!result) return res.json({ error: '配置检查失败' });
  res.json({ currentVersion: result.currentVersion || 0, latestVersion: result.latest.version, newer: result.newer });
}));

app.post('/api/config/update', wrap(async (req, res) => {
  const result = await checkConfigUpdate();
  if (!result) return res.status(502).json({ error: '配置获取失败' });
  if (result.newer) applyConfigUpdate(result.latest);
  res.json(stateSnapshot());
}));

app.get('/api/hosts', wrap((req, res) => {
  res.json({ hosts: hosts(), current: host.get() });
}));

// list dialog OK: selects the host (and stores it in saved list, like the app's set+ok chain)
app.post('/api/hosts', wrap((req, res) => {
  const h = String(req.body.host || '').trim();
  if (!h) return res.status(400).json({ error: '域名不能为空' });
  saveHosts.set([...saveHosts.get(), h]);
  host.set(h);
  res.json({ hosts: hosts(), current: host.get() });
}));

// edit dialog OK: only adds to the saved list (app returns to the list dialog afterwards)
app.post('/api/hosts/edit', wrap((req, res) => {
  const h = String(req.body.host || '').trim();
  if (!h) return res.status(400).json({ error: '域名不能为空' });
  saveHosts.set([...saveHosts.get(), h]);
  res.json({ hosts: hosts(), current: host.get() });
}));

// 重置所有
app.post('/api/hosts/reset', wrap((req, res) => {
  saveHosts.set([]);
  res.json({ hosts: hosts(), current: host.get() });
}));

// 自动选择可用域名
app.post('/api/hosts/auto', wrap(async (req, res) => {
  const best = await autoHost();
  if (!best) return res.status(502).json({ error: '自动选择失败' });
  res.json({ host: best.host, ms: best.ms, hosts: hosts(), current: host.get() });
}));

// ---------- articles ----------

function normalizeUrl(url) {
  if (!url) return null;
  return url.startsWith('/') ? `${web()}${url}` : url;
}

// 标签页嗅探: 候选词命中真实标签则返回该标签的文章(第一页)
async function searchTagPage(session, tag) {
  const url = `${wordpress()}/tag/${encodeURIComponent(tag)}`;
  const p = await httpGetAwait(session, url, { wordpressBase: wordpress() });
  if (!p) return { articles: [], next: null };
  const parsed = parseArticleList(p.html, p.url);
  return parsed;
}

// 中文搜索: 翻译成日文后多路合并 —
//   WP 搜索(译文+原文) ∪ 标签页嗅探(原文/译文/词典反查), 按文章 id 去重
async function searchArticles(session, q) {
  const jp = await translateToJapanese(q);
  const searchUrl = (kw) =>
    `${wordpress()}/?s=${encodeURIComponent(kw)}&submit=${encodeURIComponent('搜索')}`;
  const sources = [];
  const seenKw = new Set();
  for (const kw of [jp, q]) {
    if (kw && !seenKw.has(kw)) {
      seenKw.add(kw);
      sources.push(httpGetAwait(session, searchUrl(kw), { wordpressBase: wordpress() }).then(
        (p) => (p ? parseArticleList(p.html, p.url) : { articles: [], next: null })
      ));
      // 标签页嗅探(含词典反查的日文标签)
      for (const cand of tagCandidatesFor(kw)) {
        if (seenKw.has(`tag:${cand}`)) continue;
        seenKw.add(`tag:${cand}`);
        sources.push(searchTagPage(session, cand));
      }
    }
  }
  const pages = await Promise.all(sources);
  const seen = new Set();
  const articles = [];
  for (const pg of pages) {
    for (const a of pg.articles) {
      const k = a.id || a.link;
      if (k && !seen.has(k)) {
        seen.add(k);
        articles.push(a);
      }
    }
  }
  return { title: q, articles, next: pages[0]?.next || null };
}

// ArticlePagingSource.load — list page (category / tag / author / search)
app.get('/api/articles', wrap(async (req, res) => {
  const raw = String(req.query.url || '');
  if (raw.startsWith('search:')) {
    const q = decodeURIComponent(raw.slice(7));
    if (!q) return res.status(400).json({ error: '缺少搜索词' });
    const r = await searchArticles(req.session, q);
    return res.json(r);
  }
  const url = normalizeUrl(raw);
  if (!url) return res.status(400).json({ error: '缺少 url' });
  const page = await httpGetAwait(req.session, url, { wordpressBase: wordpress() });
  if (!page) return res.status(502).json({ error: '请求失败' });
  const { title, articles, next } = parseArticleList(page.html, page.url);
  res.json({ title, articles, next });
}));

// InfoWebFragment.query — article detail (cleaned html + magnets)
app.get('/api/article', wrap(async (req, res) => {
  const url = normalizeUrl(req.query.url);
  if (!url) return res.status(400).json({ error: '缺少 url' });
  const page = await httpGetAwait(req.session, url, { wordpressBase: wordpress() });
  if (!page) return res.status(502).json({ error: '请求失败' });
  const { article, contentHtml, magnets } = parseArticleDetail(page.html, page.url);
  if (!contentHtml) return res.status(502).json({ error: '请求失败' });
  res.json({ article, contentHtml, magnets });
}));

// ---------- comments ----------

app.post('/api/comments/load', wrap(async (req, res) => {
  const postId = parseInt(req.body.postId, 10);
  if (!postId) return res.status(400).json({ error: '缺少 postId' });
  const result = await loadComments(req.session, {
    postId,
    sorting: req.body.sorting || 'by_vote',
    offset: parseInt(req.body.offset, 10) || 0,
    lastParentId: req.body.lastParentId != null ? parseInt(req.body.lastParentId, 10) : 0,
  });
  res.json(result);
}));

app.post('/api/comments/vote', wrap(async (req, res) => {
  const { commentId, voteType, postId } = req.body;
  const result = await voteComment(req.session, { commentId, voteType, postId });
  if (result.error) return res.status(502).json(result);
  res.json(result);
}));

app.post('/api/comments/add', wrap(async (req, res) => {
  const { postId, author, email, content, wpdiscuzUniqueId, depth } = req.body;
  if (!postId || !content) return res.status(400).json({ error: '部分字段为空。' });
  if (req.session.user === 0 && (!author || !email)) {
    return res.status(400).json({ error: '部分字段为空。' });
  }
  const result = await postComment(req.session, {
    postId,
    author: req.session.user === 0 ? author : null,
    email: req.session.user === 0 ? email : null,
    content,
    wpdiscuzUniqueId,
    depth,
  });
  if (result.error) return res.status(502).json(result);
  res.json(result);
}));

// 标签日文→中文翻译(词典优先, 在线兜底)
app.post('/api/translate', wrap(async (req, res) => {
  const texts = Array.isArray(req.body?.texts) ? req.body.texts.slice(0, 100) : [];
  const map = await translateBatch(texts);
  res.json({ map });
}));

app.get('/api/user', wrap((req, res) => {
  res.json({ user: req.session.user });
}));

// ---------- proxy (in-app browser + image fallback) ----------

app.use('/api/proxy', express.raw({ type: '*/*', limit: '20mb' }), (req, res, next) => {
  if (req.method === 'GET') {
    const target = req.query.url;
    if (!target) return res.status(400).json({ error: '缺少 url' });
    // GET form submissions: extra query params belong to the target
    let finalTarget = String(target);
    const extra = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'url' && typeof v === 'string') extra.append(k, v);
    }
    const qs = extra.toString();
    if (qs) finalTarget += (finalTarget.includes('?') ? '&' : '?') + qs;
proxyFetch(req.session, finalTarget, { method: 'GET' }, appOrigin(req))
      .then(({ status, headers, body }) => {
        res.status(status);
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        if (body instanceof Buffer) res.send(body);
        else Readable.fromWeb(body).pipe(res);
      })
      .catch((e) => {
        res.status(502).json({ error: e.message || '代理失败' });
      });
    return;
  }
  if (req.method === 'POST') {
    const target = req.query.url;
    if (!target) return res.status(400).json({ error: '缺少 url' });
    const contentType = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    proxyFetch(req.session, String(target), {
      method: 'POST',
      body: req.body && req.body.length ? req.body : undefined,
      headers: { 'Content-Type': contentType },
    }, appOrigin(req))
      .then(({ status, headers, body }) => {
        res.status(status);
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        if (body instanceof Buffer) res.send(body);
        else Readable.fromWeb(body).pipe(res);
      })
      .catch((e) => res.status(502).json({ error: e.message || '代理失败' }));
    return;
  }
  next();
});

app.get('/api/image', wrap(async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: '缺少 url' });
  const { status, headers, body } = await proxyImage(String(url));
  res.status(status);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  Readable.fromWeb(body).pipe(res);
}));

/** origin of the web app (iframe host) — used to build absolute proxy urls */
function appOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || 'localhost:8200';
  return `${proto}://${host}`;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'hacg-web-backend', version: APP_VERSION });
});

app.listen(PORT, () => {
  console.log(`[hacg-web] backend listening on http://127.0.0.1:${PORT}  (version ${APP_VERSION})`);
});