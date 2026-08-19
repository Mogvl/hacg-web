<script setup lang="ts">
// InfoActivity parity (无评论/点赞): 单页文章内容 + FAB(浏览器/分享/磁力) + 存图对话框。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IconCat, IconChevronLeft, IconMagnet } from '@tabler/icons-vue';
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
import FabMenu, { type FabItem } from '../components/FabMenu.vue';

const route = useRoute();
const router = useRouter();

const article = ref<Article | null>(null);
const contentHtml = ref('');
const magnets = ref<string[]>([]);
const progress = ref(false);
const error = ref(false);
const contentEl = ref<HTMLElement | null>(null);

const articleUrl = computed(() => String(route.query.url || ''));

const titleText = computed(() => article.value?.title || '琉璃神社');

const fabItems = computed<FabItem[]>(() => [
  { id: 'magnet', icon: 'magnet', label: '链接', show: magnets.value.length > 0 },
  { id: 'browser', icon: 'world', label: '使用浏览器打开' },
  { id: 'share', icon: 'share', label: '分享' },
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
    setupMagnetLinks();
  } catch {
    progress.value = false;
    error.value = true;
  }
}

// ---------- lazy images (jquery.lazyload parity) ----------
let io: IntersectionObserver | null = null;

function setupLazy() {
  io?.disconnect();
  if (!contentEl.value) return;
  const imgs = contentEl.value.querySelectorAll('img.lazy[data-original]');
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

// ---------- 磁力链接助手 (油猴脚本 hacg.icu磁力链接助手 移植) ----------
// 内容文本中的 40位hex / 32位base32 hash 自动转为可点击磁力链接
const MAG_PATTERN = /\b([0-9a-fA-F]{40}|[A-Z2-7]{32})\b/g;

function setupMagnetLinks() {
  if (!contentEl.value) return;
  const walker = document.createTreeWalker(contentEl.value, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    const p = n.parentElement;
    if (!p || /^(A|SCRIPT|STYLE|TITLE|PRE)$/i.test(p.tagName)) continue;
    if (n.nodeValue && MAG_PATTERN.test(n.nodeValue)) targets.push(n);
  }
  for (const n of targets) {
    const text = n.nodeValue || '';
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    MAG_PATTERN.lastIndex = 0;
    while ((m = MAG_PATTERN.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.className = 'magnet-auto';
      a.href = `magnet:?xt=urn:btih:${m[1]}`;
      a.textContent = m[1];
      frag.appendChild(a);
      last = MAG_PATTERN.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    n.parentNode?.replaceChild(frag, n);
  }
  magnetDomCount.value = contentEl.value.querySelectorAll('a[href^="magnet:?xt=urn:btih:"]').length;
}

const magnetTip = ref(false);
const magnetDomCount = ref(0);
const magnetCount = computed(
  () => magnetDomCount.value + magnets.value.filter((m) => isBaiduMagnet(m)).length
);

// 一键复制页面上所有磁力链接 (+ 百度云项), 与脚本语义一致
async function copyAllMagnets() {
  const lines: string[] = [];
  contentEl.value
    ?.querySelectorAll('a[href^="magnet:?xt=urn:btih:"]')
    .forEach((a) => lines.push(a.getAttribute('href') || ''));
  for (const m of magnets.value) {
    if (isBaiduMagnet(m)) {
      const [id, code] = m.split(',');
      lines.push(`https://yun.baidu.com/s/${id} 提取码: ${code}`);
    } else {
      const link = magnetOpenLink(m);
      if (!lines.includes(link)) lines.push(link);
    }
  }
  const uniq = [...new Set(lines)];
  if (!uniq.length) {
    toast('未找到磁力链接');
    return;
  }
  if (await clipboard(uniq.join('\n'))) {
    toast(`已复制 ${uniq.length} 个磁力链接`);
  } else {
    toast('复制失败，请长按文本手动复制');
  }
}

// ---------- content link handling (WebView shouldOverrideUrlLoading parity) ----------
async function onContentClick(e: MouseEvent) {
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
  if (url.startsWith('magnet:')) {
    // 点击磁力链接 → 复制该链接 (失败也要有反馈)
    e.preventDefault();
    const ok = await clipboard(url);
    toast(ok ? `已复制 ${url}` : '复制失败，请长按文本手动复制');
    return;
  }
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
    case 'share':
      share(articleUrl.value);
      break;
    case 'magnet':
      // 点击一次直接弹出磁力列表
      magnetDialog.value = true;
      magnetIndex.value = 0;
      break;
  }
}

const magnetDialog = ref(false);
const magnetIndex = ref(0);

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

function back() {
  router.back();
}

onMounted(() => {
  query();
});
onBeforeUnmount(() => {
  io?.disconnect();
});
</script>

<template>
  <div class="detail-host">
    <header class="toolbar">
      <button class="btn" @click="back"><IconChevronLeft size="22" stroke="1.5" /></button>
      <h1>{{ titleText }}</h1>
    </header>

    <div ref="contentEl" class="detail-scroll">
      <div v-if="progress" class="article-content" style="padding-top: 24px">
        <div class="skeleton-card" style="padding-top: 4px">
          <div class="sk-line" style="height: 22px; width: 74%"></div>
          <div class="sk-block sk-shimmer" style="min-height: 140px; margin: 16px 16px 0"></div>
          <div class="sk-line sk-shimmer"></div>
          <div class="sk-line short sk-shimmer"></div>
          <div class="sk-line sk-shimmer"></div>
          <div class="sk-line short sk-shimmer"></div>
        </div>
      </div>
      <div v-else-if="error" class="error-cat" @click="query()">
        <IconCat size="34" stroke="1.2" />
        <span>加载失败，点击重试</span>
      </div>
      <div v-else class="article-content" @click="onContentClick">
        <h1>{{ article?.title }}</h1>
        <div v-html="contentHtml"></div>
      </div>
    </div>

    <FabMenu :items="fabItems" @select="onFab" />

    <!-- 磁力链接助手: 加号下方的一键复制磁力按钮 (油猴脚本移植) -->
    <button
      v-if="magnetCount > 0"
      class="magnet-fab"
      @click="copyAllMagnets"
      @mouseenter="magnetTip = true"
      @mouseleave="magnetTip = false"
    >
      <IconMagnet size="21" stroke="1.8" />
      <span class="magnet-badge">{{ magnetCount }}</span>
      <span class="magnet-tip" :class="{ show: magnetTip }">一键复制磁力链接</span>
    </button>

    <!-- magnet dialog -->
    <div v-if="magnetDialog" class="dlg-backdrop" @click.self="magnetDialog = false">
      <div class="dlg">
        <div class="dlg-title">链接</div>
        <div class="dlg-list">
          <label v-for="(m, i) in magnets" :key="i">
            <input type="radio" :checked="i === magnetIndex" @change="magnetIndex = i" />
            <span style="word-break: break-all">{{ magnetDisplay(m) }}</span>
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
