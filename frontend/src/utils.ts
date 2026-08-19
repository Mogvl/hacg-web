import { reactive } from 'vue';

// ---------- toast / snackbar (Toast/Snackbar parity) ----------

interface ToastItem {
  id: number;
  text: string;
  action?: string;
  onAction?: () => void;
}

let toastSeq = 1;
export const toasts = reactive<ToastItem[]>([]);

export function toast(text: string, action?: string, onAction?: () => void) {
  const id = toastSeq++;
  toasts.push({ id, text, action, onAction });
  if (!action) {
    setTimeout(() => dismissToast(id), 2600);
  }
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

// ---------- random colors (Common.kt randomColor: HSV(hue random, S=1, V=0.5)) ----------

const random = (() => {
  let seed = Date.now();
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
})();

export function randomHue(): number {
  return Math.floor(random() * 360);
}

export function randomColor(alpha = 1): string {
  return `hsla(${randomHue()}, 100%, 50%, ${alpha})`;
}

// ---------- time formatting ----------
// ArticleHolder: SimpleDateFormat("yyyy-MM-dd hh:ss") — 12-hour hour + seconds, faithfully.

export function formatListTime(datetime: string | null): string {
  const d = datetime ? new Date(datetime) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${String(h).padStart(2, '0')}:${ss}`;
}

// 原站式中文日期: 2026年8月18日
export function formatCnDate(datetime: string | null): string {
  const d = datetime ? new Date(datetime) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ---------- clipboard ----------

export async function clipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------- magnets (InfoActivity 磁力链接 dialog) ----------

export function isBaiduMagnet(m: string): boolean {
  return m.includes(',');
}

export function magnetOpenLink(m: string): string {
  return isBaiduMagnet(m) ? `https://yun.baidu.com/s/${m.split(',')[0]}` : `magnet:?xt=urn:btih:${m}`;
}

export function magnetCopyLink(m: string): string {
  return magnetOpenLink(m);
}

export function magnetDisplay(m: string): string {
  return isBaiduMagnet(m) ? `baidu:${m}` : `magnet:${m}`;
}

// ---------- storage (SharedPreferences parity) ----------

const SEARCH_HISTORY_KEY = 'hacg.search.history';

export function searchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveSearchHistory(q: string) {
  const h = searchHistory();
  const next = [q, ...h.filter((x) => x !== q)].slice(0, 20);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
}

export function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

// ---------- url classification (Common.kt isWordpress / getIdFromUrl / isList) ----------

const ARTICLE_URL_RE = /\/wp\/(\d+)\.html/;
const LIST_PREFIXES = ['/wp/tag/', '/wp/author/', '/wp/?s='];

export function articleIdFromUrl(url: string): number | null {
  const m = ARTICLE_URL_RE.exec(url);
  return m ? parseInt(m[1], 10) : null;
}

export function isArticleUrl(url: string): boolean {
  return articleIdFromUrl(url) !== null;
}

export function isListUrl(url: string, categories: { url: string }[]): boolean {
  try {
    const path = new URL(url, 'https://x').pathname;
    return categories.some((c) => path === c.url) || LIST_PREFIXES.some((p) => path.startsWith(p));
  } catch {
    return false;
  }
}