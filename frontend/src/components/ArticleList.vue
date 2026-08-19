<script setup lang="ts">
// ArticleFragment parity: paging list, pull-to-refresh, infinite scroll,
// footer load states, black-cat error retry, per-item slide-in animation.
import { computed, onMounted, ref, watch } from 'vue';
import type { Article } from '../api';
import { getArticles } from '../api';
import { toast } from '../utils';
import ArticleCard from './ArticleCard.vue';

const props = defineProps<{ url: string }>();
const emit = defineEmits<{ (e: 'title', t: string): void }>();

const items = ref<Article[]>([]);
const next = ref<string | null>(null);
const status = ref<'idle' | 'loading' | 'error' | 'complete'>('idle');
const retryFlag = ref(false);
const toasting = ref(false);
const refreshing = ref(false);

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

async function query(refresh = false) {
  if (status.value === 'loading') return;
  if (refresh) {
    items.value = [];
    next.value = null;
    status.value = 'loading';
  } else {
    status.value = 'loading';
  }
  const seq = ++querySeq;
  try {
    const page = await getArticles(refresh ? props.url : (next.value || props.url));
    if (seq !== querySeq) return;
    if (page.title) emit('title', page.title);
    items.value = [...items.value, ...page.articles];
    next.value = page.next;
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

function retry() {
  retryFlag.value = true;
  query(true);
}

function loadMore() {
  if (status.value === 'idle' && next.value) query(false);
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
    <div v-if="loading && items.length === 0" class="spin-wrap"><div class="spin"></div></div>
    <div v-else-if="error && items.length === 0" class="error-cat" @click="retry">
      <svg viewBox="0 0 120 120">
        <ellipse cx="60" cy="96" rx="34" ry="10" fill="#e0e0e0" />
        <path
          d="M28 52c-6-8-4-18 2-22 6-4 12-2 16 2-10 2-14 8-18 14v30c0 12 14 20 32 20s32-8 32-20V46c-4-6-8-12-18-14 4-4 10-6 16-2 6 4 8 14 2 22"
          fill="#2e2e2e"
        />
        <path d="M24 40l-10-2c-4-1-4-7 0-8l10 2 6 5-6 3z" fill="#2e2e2e" />
        <path d="M96 40l10-2c4-1 4-7 0-8l-10 2-6 5 6 3z" fill="#2e2e2e" />
        <circle cx="48" cy="52" r="4" fill="#ffd54f" />
        <circle cx="72" cy="52" r="4" fill="#ffd54f" />
        <circle cx="49" cy="53" r="1.6" fill="#111" />
        <circle cx="73" cy="53" r="1.6" fill="#111" />
        <path d="M54 62h12v4H54z" fill="#ffd54f" />
        <path d="M52 84c6 4 10 4 16 0" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round" />
      </svg>
      <span>加载失败，点击重试</span>
    </div>
    <div v-else class="article-list">
      <ArticleCard v-for="a in items" :key="String(a.id) + (a.link || '')" :article="a" />
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
  </div>
</template>