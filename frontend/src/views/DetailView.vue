<script setup lang="ts">
// InfoActivity parity: content webview page + comments page (swipeable pager),
// FAB actions (browser / comments / share / magnets), image save dialog.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Article } from '../api';
import { getArticle, imageProxyUrl } from '../api';
import { state } from '../store';
import {
  clipboard,
  isBaiduMagnet,
  isListUrl,
  magnetCopyLink,
  magnetDisplay,
  magnetOpenLink,
  toast,
} from '../utils';
import CommentPanel from '../components/CommentPanel.vue';
import FabMenu, { type FabItem } from '../components/FabMenu.vue';

const route = useRoute();
const router = useRouter();

const article = ref<Article | null>(null);
const contentHtml = ref('');
const magnets = ref<string[]>([]);
const progress = ref(false);
const error = ref(false);
const page = ref(0); // 0 = content, 1 = comments
const pagerEl = ref<HTMLElement | null>(null);

const articleUrl = computed(() => String(route.query.url || ''));
const articleId = computed(() => {
  const p = Number(route.params.id);
  if (p) return p;
  const m = /\/wp\/(\d+)\.html/.exec(articleUrl.value);
  return m ? Number(m[1]) : 0;
});

const titleText = computed(() => article.value?.title || '琉璃神社');

const fabItems = computed<FabItem[]>(() => [
  { id: 'magnet', icon: '🧲', label: '链接', show: magnets.value.length > 0 },
  { id: 'browser', icon: '🌐', label: '使用浏览器打开' },
  { id: 'share', icon: '📤', label: '分享' },
  { id: 'comments', icon: '💬', label: '评论' },
]);

// ---------- load ----------
async function query() {
  if (!articleUrl.value) return;
  progress.value = true;
  error.value = false;
  try {
    const d = await getArticle(articleUrl.value);
    if (d.article) article.value = d.article;
    contentHtml.value = d.contentHtml;
    magnets.value = d.magnets;
    progress.value = false;
    await nextTick();
    setupLazy();
  } catch (e: any) {
    progress.value = false;
    error.value = true;
  }
}

// ---------- lazy images (jquery.lazyload parity) ----------
let io: IntersectionObserver | null = null;
let contentEl: HTMLElement | null = null;

function setupLazy() {
  io?.disconnect();
  if (!contentEl) return;
  const imgs = contentEl.querySelectorAll('img.lazy[data-original]');
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target as HTMLImageElement;
        const src = img.getAttribute('data-original');
        if (src && !img.getAttribute('src')) {
          img.setAttribute('src', src);
          img.addEventListener('load', () => img.classList.add('loaded'));
          img.addEventListener('error', () => {
            if (!img.dataset.proxied) {
              img.dataset.proxied = '1';
              img.setAttribute('src', imageProxyUrl(src));
            }
          });
        }
        io?.unobserve(img);
      }
    },
    { rootMargin: '400px' }
  );
  imgs.forEach((img) => io?.observe(img));
}

// ---------- content link handling (WebView shouldOverrideUrlLoading parity) ----------
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const a = target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('javascript:hacg.save')) {
    e.preventDefault();
    const m = /hacg\.save\('([^']+)'\)/.exec(href);
    if (m) openSaveDialog(m[1]);
    return;
  }
  const url = a.href || href;
  if (!url || url.startsWith('javascript:')) return;
  e.preventDefault();
  navigateUrl(url);
}

function navigateUrl(url: string) {
  const id = /\/wp\/(\d+)\.html/.exec(url);
  if (id) {
    router.push({ name: 'post', params: { id: id[1] }, query: { url } });
    return;
  }
  if (isListUrl(url, state.categories)) {
    const name = decodeURIComponent(new URL(url, state.web).pathname.split('/').filter(Boolean).pop() || '列表');
    router.push({ name: 'list', query: { url, name } });
    return;
  }
  const u = new URL(url, state.web);
  if (u.hostname === new URL(state.web).hostname) {
    router.push({ name: 'web', query: { url } });
    return;
  }
  window.open(url, '_blank');
}

// ---------- FAB actions ----------
function onFab(id: string) {
  switch (id) {
    case 'browser':
      window.open(articleUrl.value, '_blank');
      break;
    case 'comments':
      setPage(1);
      break;
    case 'share':
      share(articleUrl.value);
      break;
    case 'magnet':
      magnetClicks.value++;
      if (magnetClicks.value >= 3) {
        magnetDialog.value = true;
        magnetIndex.value = 0;
      } else {
        toast('...'.repeat(magnetClicks.value));
      }
      break;
  }
}

const magnetClicks = ref(0);
const magnetDialog = ref(false);
const magnetIndex = ref(0);

function magnetLabel(m: string): string {
  return magnetDisplay(m);
}

function openMagnet() {
  const m = magnets.value[magnetIndex.value];
  if (!m) return;
  if (isBaiduMagnet(m)) {
    const code = m.split(',')[1];
    clipboard(code).then(() => toast(`已复制 ${code}`));
    window.open(magnetOpenLink(m), '_blank');
  } else {
    const link = magnetOpenLink(m);
    clipboard(link).then(() => toast(`已复制 ${link}`));
    try {
      window.open(link, '_blank');
    } catch {
      /* ignored */
    }
  }
  magnetDialog.value = false;
}

function copyMagnet() {
  const m = magnets.value[magnetIndex.value];
  if (!m) return;
  const link = magnetCopyLink(m);
  clipboard(link).then(() => toast(`已复制 ${link}`));
  magnetDialog.value = false;
}

// ---------- share (InfoWebFragment.share) ----------
async function share(url: string) {
  const title = article.value?.title || '';
  const intro = article.value?.content || '';
  const text = `${title}\n${intro} ${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch {
      /* user cancelled */
    }
  }
  if (await clipboard(text)) toast(`已复制 ${text.slice(0, 60)}…`);
}

// share with the image attached (the app downloads then ACTION_SEND the file)
async function shareImage(url: string) {
  try {
    const resp = await fetch(imageProxyUrl(url));
    const blob = await resp.blob();
    const file = new File([blob], url.split('/').pop() || 'image', { type: blob.type });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: article.value?.title || '' });
      return;
    }
  } catch {
    /* fall back to text share */
  }
  share(url);
}

// ---------- image save dialog (JsFace.save parity) ----------
const saveDialog = ref(false);
const saveUrl = ref('');

function openSaveDialog(url: string) {
  saveUrl.value = url;
  saveDialog.value = true;
}

async function saveImage() {
  const url = saveUrl.value;
  const a = document.createElement('a');
  a.href = imageProxyUrl(url);
  a.download = url.split('/').pop() || 'image';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  saveDialog.value = false;
}

// ---------- pager ----------
function setPage(p: number) {
  page.value = p;
  const el = pagerEl.value;
  if (el) el.scrollTo({ left: p * el.clientWidth, behavior: 'smooth' });
}

function onPagerScroll() {
  const el = pagerEl.value;
  if (!el) return;
  const p = Math.round(el.scrollLeft / el.clientWidth);
  if (p !== page.value) page.value = p;
}

function back() {
  if (page.value > 0) {
    setPage(0);
  } else {
    router.back();
  }
}

// Android back parity: comments tab → content tab on back gesture
function onPopState() {
  if (page.value > 0) {
    setPage(0);
    history.pushState({ hacgTab: 1 }, '');
  }
}

onMounted(() => {
  query();
  window.addEventListener('popstate', onPopState);
});

onBeforeUnmount(() => {
  io?.disconnect();
  window.removeEventListener('popstate', onPopState);
});
</script>

<template>
  <div class="detail-host">
    <header class="toolbar">
      <button class="btn" @click="back">‹</button>
      <h1>{{ titleText }}</h1>
    </header>

    <div ref="pagerEl" class="pager" @scroll.passive="onPagerScroll">
      <!-- page 0: article content (fragment_info_web) -->
      <div class="page" style="position: relative">
        <div v-if="progress" class="spin-wrap" style="position: sticky; top: 40%">
          <div class="spin"></div>
        </div>
        <div v-else-if="error" class="error-cat" @click="query()">
          <svg viewBox="0 0 120 120">
            <ellipse cx="60" cy="96" rx="34" ry="10" fill="#e0e0e0" />
            <path
              d="M28 52c-6-8-4-18 2-22 6-4 12-2 16 2-10 2-14 8-18 14v30c0 12 14 20 32 20s32-8 32-20V46c-4-6-8-12-18-14 4-4 10-6 16-2 6 4 8 14 2 22"
              fill="#2e2e2e"
            />
            <circle cx="48" cy="52" r="4" fill="#ffd54f" />
            <circle cx="72" cy="52" r="4" fill="#ffd54f" />
            <path d="M54 62h12v4H54z" fill="#ffd54f" />
          </svg>
          <span>加载失败，点击重试</span>
        </div>
        <div
          v-else
          ref="contentEl"
          class="article-content"
          @click="onContentClick"
        >
          <h1>{{ article?.title }}</h1>
          <div v-html="contentHtml"></div>
        </div>
        <FabMenu :items="fabItems" @select="onFab" />
      </div>

      <!-- page 1: comments (InfoCommentFragment) -->
      <div class="page">
        <CommentPanel v-if="articleId" :post-id="articleId" />
      </div>
    </div>

    <!-- magnet dialog -->
    <div v-if="magnetDialog" class="dlg-backdrop" @click.self="magnetDialog = false">
      <div class="dlg">
        <div class="dlg-title">链接</div>
        <div class="dlg-list">
          <label v-for="(m, i) in magnets" :key="i">
            <input type="radio" :checked="i === magnetIndex" @change="magnetIndex = i" />
            <span style="word-break: break-all">{{ magnetLabel(m) }}</span>
          </label>
        </div>
        <div class="dlg-actions">
          <button class="dbtn" @click="openMagnet">打开</button>
          <button class="dbtn" @click="copyMagnet">复制</button>
          <button class="dbtn muted" @click="magnetDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- image save dialog (JsFace.save) -->
    <div v-if="saveDialog" class="dlg-backdrop" @click.self="saveDialog = false">
      <div class="dlg" style="max-width: 92vw">
        <img
          class="img-preview"
          :src="imageProxyUrl(saveUrl)"
          @click="saveDialog = false"
          alt=""
        />
        <div class="dlg-actions">
          <button class="dbtn" @click="shareImage(saveUrl)">分享</button>
          <button class="dbtn" @click="saveImage">保存</button>
          <button class="dbtn muted" @click="saveDialog = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>