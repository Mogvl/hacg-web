// 标签翻译: 种子词典(人工) → 运行期缓存 → 在线翻译兜底(Google → MyMemory 降级)。
// 只翻译含假名(平假名/片假名)的文本; 失败时返回原文, 绝不阻塞列表加载。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'assets', 'tag-translations.json');
const CACHE_FILE = path.join(DATA_DIR, 'translations.json');

const KANA_RE = /[\u3040-\u30ff]/; // 平假名 + 片假名

let seed = {};
try {
  seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
} catch {
  /* keep empty */
}

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  /* first run */
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch {
      /* ignore */
    }
  }, 2000);
}

export function needsTranslation(text) {
  return typeof text === 'string' && KANA_RE.test(text);
}

export function lookupTranslation(text) {
  if (!needsTranslation(text)) return text;
  return seed[text] || cache[text] || null;
}

// Google 免费接口 → MyMemory 兜底
async function onlineTranslate(text) {
  const gurl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(gurl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      const seg = data?.[0]?.map((s) => s?.[0] || '').join('');
      if (seg && seg.trim()) return seg.trim();
    }
  } catch {
    /* fall through */
  }
  const murl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ja|zh-CN`;
  try {
    const res = await fetch(murl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const seg = data?.responseData?.translatedText;
      if (seg && typeof seg === 'string' && seg.trim()) return seg.trim();
    }
  } catch {
    /* fall through */
  }
  return null;
}

// 批量翻译: 词典/缓存优先, miss 的并发请求在线翻译(限 4 并发)
export async function translateBatch(texts) {
  const map = {};
  const pending = [];
  for (const t of texts) {
    if (typeof t !== 'string' || !t) continue;
    if (!needsTranslation(t)) {
      map[t] = t;
      continue;
    }
    const hit = lookupTranslation(t);
    if (hit) {
      map[t] = hit;
      continue;
    }
    pending.push(t);
  }
  if (pending.length) {
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const t = pending[i++];
        const out = await onlineTranslate(t);
        const final = out && out !== t ? out : t;
        map[t] = final;
        if (out && out !== t) {
          cache[t] = final;
          scheduleSave();
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  return map;
}