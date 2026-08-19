<script setup lang="ts">
// ArticleFragment parity + 原站翻页: paging list, pull-to-refresh, infinite scroll,
// footer load states, black-cat error retry, per-item slide-in animation,
// 底部翻页条(« 上一页 / 下一页 » — 对齐 hacg.me previouspostslink/nextpostslink)。
import { computed, onMounted, ref, watch } from 'vue';
import { IconCat } from '@tabler/icons-vue';
import type { Article } from '../api';
import { getArticles, translateTags } from '../api';
import { toast } from '../utils';
import ArticleCard from './ArticleCard.vue';

const props = defineProps<{ url: string }>();
const emit = defineEmits<{ (e: 'title', t: string): void }>();

interface PageState {
  url: string;
  next: string | null;
  prev: string | null;
}

// 分页历史栈 (原站翻页语义: 上一页/下一页 替换列表)
const pages = ref<PageState[]>([{ url: props.url, next: null, prev: null }]);
const pageIdx = ref(0);

const items = ref<Article[]>([]);
const tagNames = ref<Record<string, string>>({});
const status = ref<'idle' | 'loading' | 'error' | 'complete'>('idle');
const retryFlag = ref(false);
const toasting = ref(false);
const refreshing = ref(false);

const current = computed(() => pages.value[pageIdx.value]);
const canPrev = computed(() => pageIdx.value > 0);
const canNext = computed(() => !!current.value?.next);

const loading = computed(() => status.value === 'loading');
const error = computed(() => status.value === 'error');
const complete = computed(() => status.value === 'complete');

// footer mirror of FooterAdapter.displayLoadStateAsItem + MsgHolder.bind
const footer = computed(() => {
  if (error.value) return { text: '加载失败', clickable: true };
  if (loading.value && items.value.length !== 0) return { text: '加载中…', clickable: false };
  if (complete.value) return { text: items.value.length === 0 ? '列表空' : '没有更多了', clickable: false };
  return { text: '加载更多', clickable: false };
});

let querySeq = 0;

// 加载 pages[pageIdx].url; refresh=true 清空列表(翻页/下拉刷新)
async function query(refresh = false) {
  if (status.value === 'loading') return;
  if (refresh) {
    items.value = [];
    status.value = 'loading';
  } else {
    status.value = 'loading';
  }
  const seq = ++querySeq;
  const target = current.value.url;
  try {
    const page = await getArticles(refresh ? target : (current.value.next || target));
    if (seq !== querySeq) return;
    if (page.title) emit('title', page.title);
    translatePageTags(page.articles);
    if (refresh) {
      items.value = page.articles;
      // 更新当前页的 next/prev (下一跳)
      const cur = current.value;
      cur.next = page.next;
      if (page.prev) cur.prev = page.prev;
    } else {
      items.value = [...items.value, ...page.articles];
      current.value.next = page.next; // 推进当前页的下一页
    }
    status.value = page.next ? 'idle' : 'complete';
    if (refresh && page.articles.length) listEl.value?.scrollTo({ top: 0 });
    return page.articles.length;
  } catch (e: any) {
    if (seq !== querySeq) return;
    status.value = 'error';
    if (items.value.length === 0) {
      // app_network_retry: toast once until the black cat is clicked
      if (!retryFlag.value && !toasting.value) {
        toasting.value = true;
        toast('请求失败，点击黑猫重试，或从菜单更换域名。');
        setTimeout(() => (toasting.value = false), 2800);
      }
    }
    return 0;
  }
}

let translating = false;
async function translatePageTags(articles: Article[]) {
  if (translating) return;
  const pending: string[] = [];
  for (const a of articles) {
    for (const t of a.tags) {
      if (t.name && !(t.name in tagNames.value)) pending.push(t.name);
    }
  }
  if (!pending.length) return;
  translating = true;
  try {
    const r = await translateTags(pending);
    tagNames.value = { ...tagNames.value, ...r.map };
  } catch {
    /* 翻译失败保留原文 */
  } finally {
    translating = false;
  }
}

function retry() {
  retryFlag.value = true;
  query(true);
}

function loadMore() {
  if (status.value === 'idle' && current.value.next) query(false);
}

// 原站翻页: 下一页 = 前进一页并替换列表; 上一页 = 回到历史页
function goNext() {
  if (!canNext.value || status.value === 'loading') return;
  const cur = current.value;
  if (!cur.next) return;
  if (pageIdx.value + 1 >= pages.value.length) {
    pages.value.push({ url: cur.next, next: null, prev: cur.url });
  }
  pageIdx.value++;
  retryFlag.value = false;
  query(true);
}

function goPrev() {
  if (!canPrev.value || status.value === 'loading') return;
  pageIdx.value--;
  retryFlag.value = false;
  query(true);
}

const listEl = ref<HTMLElement | null>(null);

function onScroll() {
  const el = listEl.value;
  if (!el) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore();
}

// pull-to-refresh (SwipeRefreshLayout parity; pointer events cover touch + mouse)
let pullStart = 0;
let pulling = false;
const pull = ref(0);

function onPointerDown(e: PointerEvent) {
  if (listEl.value && listEl.value.scrollTop <= 0 && e.pointerType !== '') {
    pullStart = e.clientY;
    pulling = true;
  }
}
function onPointerMove(e: PointerEvent) {
  if (!pulling || !listEl.value) return;
  const dy = e.clientY - pullStart;
  if (listEl.value.scrollTop > 0 || dy <= 0) {
    pull.value = 0;
    return;
  }
  pull.value = Math.min(dy * 0.45, 90);
}
function onPointerUp() {
  if (pulling && pull.value >= 55) {
    refreshing.value = true;
    query(true).finally(() => {
      refreshing.value = false;
      pull.value = 0;
    });
  } else {
    pull.value = 0;
  }
  pulling = false;
}

watch(
  () => props.url,
  () => {
    retryFlag.value = false;
    pages.value = [{ url: props.url, next: null, prev: null }];
    pageIdx.value = 0;
    query(true);
  },
  { immediate: true }
);

onMounted(() => {
  const el = listEl.value;
  if (el) {
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }
});
</script>

<template>
  <div
    ref="listEl"
    class="list-host"
    :style="refreshing ? { pointerEvents: 'none' } : undefined"
  >
    <div class="ptr" :class="{ show: pull > 0 || refreshing }" :style="{ height: pull + 'px' }">
      {{ refreshing ? '加载中…' : '下拉刷新' }}
    </div>
    <div v-if="loading && items.length === 0" class="skeleton-list">
      <div v-for="i in 3" :key="i" class="skeleton-card">
        <div class="sk-block sk-shimmer"></div>
        <div class="sk-line sk-shimmer"></div>
        <div class="sk-line short sk-shimmer"></div>
      </div>
    </div>
    <div v-else-if="error && items.length === 0" class="error-cat" @click="retry">
      <IconCat size="34" stroke="1.2" />
      <span>加载失败，点击重试</span>
    </div>
    <div v-else class="article-list">
      <ArticleCard
        v-for="a in items"
        :key="String(a.id) + (a.link || '')"
        :article="a"
        :tag-names="tagNames"
      />
    </div>
    <div
      v-if="(footer.clickable || items.length > 0) && !(error && items.length === 0)"
      class="list-footer"
      :class="{ err: footer.clickable }"
      @click="footer.clickable && retry()"
    >
      <span v-if="loading && items.length" class="spin"></span>
      {{ footer.text }}
    </div>

    <!-- 原站翻页: « 上一页 / 下一页 » -->
    <div v-if="items.length > 0" class="page-nav">
      <button class="pg-btn" :disabled="!canPrev" @click="goPrev">« 上一页</button>
      <button class="pg-btn" :disabled="!canNext || loading" @click="goNext">下一页 »</button>
    </div>
  </div>
</template>