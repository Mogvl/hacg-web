// Article parsing — mirrors Article.kt (jsoup selectors) and InfoActivity.kt query().
import * as cheerio from 'cheerio';

// ---------- helpers ----------

// jsoup Element.text(): normalized whitespace, trimmed
export function jtext($el) {
  return ($el.text() || '').replace(/\s+/g, ' ').trim();
}

// jsoup's "abs:href"/"abs:src" equivalent (cheerio dropped the abs: prefix support)
export function absAttr(value, baseUrl) {
  if (!value) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value; // already absolute (http, mailto, magnet...)
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function tagFromEl(el, baseUrl) {
  return { name: jtext(el), url: absAttr(el.attr('href'), baseUrl) || '' };
}

const POST_ID_RE = /post-(\d+)/;

// Article(e: Element) — Article.kt constructor, selector-for-selector.
export function parseArticleElement(el, $, baseUrl) {
  const idMatch = POST_ID_RE.exec(el.attr('id') || '');
  const title = jtext(el.find('header .entry-title'));
  // jsoup: select("header .entry-title,.entry-meta a").attr("abs:href") — first element's attr;
  // on the current theme .entry-title is a heading, so fall back to the anchor inside it.
  const linkSel = el.find('header .entry-title,.entry-meta a');
  const link =
    absAttr(linkSel.first().attr('href'), baseUrl) ||
    absAttr(el.find('header .entry-title a').first().attr('href'), baseUrl) ||
    null;
  const img = el.find('.entry-content img');
  const image =
    img.length && img.first().hasClass('avatar')
      ? ''
      : absAttr(img.first().attr('src'), baseUrl) || '';
  const content = jtext(el.find('.entry-content p,.entry-summary p').first()) || null;
  const time = el.find('time').attr('datetime') || null;
  const comments = parseInt(el.find('header .comments-link').text().trim(), 10) || 0;
  const authorEl = el.find('.author a').first();
  const author = authorEl.length ? tagFromEl(authorEl, baseUrl) : null;
  const catEl = el.find('footer .cat-links a').first();
  const category = catEl.length ? tagFromEl(catEl, baseUrl) : null;
  const tags = el.find('footer .tag-links a').map((_, a) => tagFromEl($(a), baseUrl)).get();
  return {
    id: idMatch ? parseInt(idMatch[1], 10) : 0,
    title,
    link,
    image,
    content,
    time,
    comments,
    author,
    category,
    tags,
  };
}

// ArticlePagingSource.load — page title + article list + next page url.
export function parseArticleList(html, baseUrl) {
  const $ = cheerio.load(html, { baseURI: baseUrl });
  const title =
    ['h1.page-title>span', 'h1#site-title', 'title']
      .map((sel) => jtext($(sel).first()))
      .find((t) => t.length > 0) || '';
  const articles = $('article').map((_, a) => parseArticleElement($(a), $, baseUrl)).get();
  const next =
    absAttr(
      $('a.nextpostslink').last().filter((_, a) => jtext($(a)) === '»').attr('href'),
      baseUrl
    ) ||
    absAttr(
      $('#wp_page_numbers a').last().filter((_, a) => jtext($(a)) === '>').attr('href'),
      baseUrl
    ) ||
    absAttr($('#nav-below .nav-previous a').first().attr('href'), baseUrl) ||
    null;
  return { title, articles, next };
}

// ---------- jsoup Safelist parity (Safelist.basicWithImages() + audio/video/source) ----------

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'cite', 'code', 'dd', 'dl', 'dt', 'em', 'i',
  'li', 'ol', 'p', 'pre', 'q', 'small', 'span', 'strike', 'strong', 'sub', 'sup',
  'u', 'ul', 'img', 'audio', 'video', 'source',
]);

const ALLOWED_ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'align', 'alt', 'height', 'width', 'title'],
  blockquote: ['cite'],
  q: ['cite'],
  audio: ['controls', 'src'],
  video: ['controls', 'src'],
  source: ['type', 'src', 'media'],
  ol: ['start'],
};

const PROTOCOLS = {
  'a.href': ['ftp', 'http', 'https', 'mailto'],
  'img.src': ['http', 'https'],
  'blockquote.cite': ['http', 'https'],
  'q.cite': ['http', 'https'],
};

const DROP_TAGS = new Set(['script', 'style', 'title']);

function hasBadProtocol(value, allowed) {
  if (!value) return false;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value.trim());
  if (!m) return false; // relative or scheme-less — fine
  return !allowed.includes(m[1].toLowerCase());
}

// Jsoup.clean(html, baseUri, safelist) equivalent: keeps only whitelisted tags/attrs,
// resolves relative URLs against baseUri, drops script/style entirely.
export function cleanHtml(html, baseUri) {
  const $ = cheerio.load(html, { baseURI: baseUri }, false);

  // 1. drop script/style/title completely (jsoup removes these with their content)
  $('script,style,title').remove();

  // 2. unwrap disallowed tags, keeping their children (jsoup behavior); loop until stable
  for (let i = 0; i < 16; i++) {
    let changed = false;
    $('*').each((_, el) => {
      const tag = (el.tagName || '').toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        const $el = $(el);
        $el.before(...$el.contents().toArray());
        $el.remove();
        changed = true;
      }
    });
    if (!changed) break;
  }

  // 3. whitelist attributes + protocol checks
  $('*').each((_, el) => {
    const $el = $(el);
    const tag = (el.tagName || '').toLowerCase();
    const allowed = ALLOWED_ATTRS[tag];
    for (const attr of Object.keys(el.attribs || {})) {
      if (!allowed || !allowed.includes(attr)) {
        $el.removeAttr(attr);
        continue;
      }
      const value = el.attribs[attr];
      const key = `${tag}.${attr}`;
      if (PROTOCOLS[key] && hasBadProtocol(value, PROTOCOLS[key])) {
        $el.removeAttr(attr);
      }
    }
  });

  // resolve relative urls (jsoup resolves against baseUri)
  $('[href]').each((_, el) => {
    const v = el.attribs.href;
    if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) {
      try {
        el.attribs.href = new URL(v, baseUri).toString();
      } catch { /* keep */ }
    }
  });
  $('[src]').each((_, el) => {
    const v = el.attribs.src;
    if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) {
      try {
        el.attribs.src = new URL(v, baseUri).toString();
      } catch { /* keep */ }
    }
  });

  return $.html();
}

// InfoActivity.kt query(): clean entry-content, then strip width/height,
// convert imgs to lazy with data-original + "下载此图" link.
export function transformEntryContent(cleanHtmlStr, baseUrl) {
  const $ = cheerio.load(cleanHtmlStr, { baseURI: baseUrl }, false);
  $('[width],[height]').each((_, el) => {
    const $el = $(el);
    $el.removeAttr('width');
    $el.removeAttr('height');
  });
  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = el.attribs.src;
    $el.attr('data-original', src);
    $el.addClass('lazy');
    $el.removeAttr('src');
    const safe = String(src).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    $el.after(`<a href="javascript:hacg.save('${safe}');">下载此图</a>`);
  });
  return $.html();
}

// Common.kt magnet(): rmagnet (40/32 hex) + rbaidu (8+4) — applied to entry text.
const RMAGNET = /(?<=[^\da-z])([a-z0-9]{40}|[a-z0-9]{32})(?=[^\da-z])/gi;
const RBAIDU = /\b([a-z0-9]{8})\b\s+\b([a-z0-9]{4})\b/gi;

export function extractMagnets(text) {
  const out = [];
  for (const m of text.matchAll(RMAGNET)) out.push(m[1]);
  for (const m of text.matchAll(RBAIDU)) out.push(`${m[1]},${m[2]}`);
  return out;
}

// InfoActivity.kt query(): full detail extraction.
export function parseArticleDetail(html, url) {
  const $ = cheerio.load(html, { baseURI: url });
  const articleEl = $('article').first();
  const article = articleEl.length ? parseArticleElement(articleEl, $, url) : null;
  const entryEl = $('.entry-content').first();
  let contentHtml = null;
  let magnets = [];
  if (entryEl.length) {
    const clean = cleanHtml(entryEl.html() || '', url);
    const body = transformEntryContent(clean, url);
    contentHtml = body;
    magnets = extractMagnets(entryEl.text());
  }
  return { article, contentHtml, magnets };
}