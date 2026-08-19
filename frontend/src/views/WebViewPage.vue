<script setup lang="ts">
// WebFragment parity: in-app browser for philosophy bbs / login / user profile.
// Navigation: article/list URLs route in-app; same-site pages stay in the webview
// (through the backend proxy); external hosts open in a new tab.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconRefresh,
} from '@tabler/icons-vue';
import { getUser, proxyUrl } from '../api';
import { state, refreshState } from '../store';
import { isListUrl } from '../utils';

const route = useRoute();
const router = useRouter();

const defuri = computed(() => {
  const url = String(route.query.url || '');
  if (url) return url;
  return route.query.login === '1' ? `${state.philosophy}?foro=signin` : state.philosophy;
});
const isLogin = computed(() => route.query.login === '1');

const stack = ref<{ url: string; label: string }[]>([]);
const index = ref(-1);
const busy = ref(false);
const progress = ref(0);
const showUrl = ref('');
const timer = ref<number | null>(null);
const menuOpen = ref(false);

const frameSrc = computed(() => (index.value >= 0 ? proxyUrl(stack.value[index.value].url) : ''));

const canBack = computed(() => index.value > 0 || route.query.url || isLogin.value);
const canForward = computed(() => index.value < stack.value.length - 1);
const hostLabel = computed(() => {
  try {
    return new URL(showUrl.value, state.web).host;
  } catch {
    return '琉璃神社';
  }
});

function push(url: string) {
  stack.value = stack.value.slice(0, index.value + 1);
  stack.value.push({ url, label: url });
  index.value = stack.value.length - 1;
  showUrl.value = url;
}

function load(url: string) {
  if (index.value >= 0 && stack.value[index.value].url === url) {
    refreshFrame();
    return;
  }
  push(url);
}

function refreshFrame() {
  // force iframe reload by re-render
  if (index.value >= 0) {
    const u = stack.value[index.value].url;
    stack.value[index.value] = { ...stack.value[index.value] };
    frameReloadKey.value++;
  }
}

const frameReloadKey = ref(0);

function goHome() {
  menuOpen.value = false;
  load(defuri.value);
}
function goBack() {
  menuOpen.value = false;
  if (index.value > 0) {
    index.value--;
    showUrl.value = stack.value[index.value].url;
  } else {
    router.back();
  }
}
function goForward() {
  menuOpen.value = false;
  if (index.value < stack.value.length - 1) {
    index.value++;
    showUrl.value = stack.value[index.value].url;
  }
}
function goRefresh() {
  menuOpen.value = false;
  refreshFrame();
}

function onFrameLoad() {
  busy.value = false;
  progress.value = 100;
}

function onFrameStart() {
  busy.value = true;
  progress.value = 0;
  if (timer.value) window.clearInterval(timer.value);
  timer.value = window.setInterval(() => {
    if (!busy.value) {
      if (timer.value) window.clearInterval(timer.value);
      return;
    }
    progress.value = Math.min(progress.value + Math.random() * 22, 92);
  }, 250);
}

// parent receives same-site link clicks from the proxied page
function onMessage(ev: MessageEvent) {
  if (ev.data?.type !== 'hacg-nav') return;
  const url = ev.data.url as string;
  if (!url) return;
  const id = /\/wp\/(\d+)\.html/.exec(url);
  if (id) {
    router.push({ name: 'post', params: { id: id[1] }, query: { url } });
    return;
  }
  if (isListUrl(url, state.categories)) {
    const path = new URL(url, state.web).pathname;
    const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || '搜索');
    router.push({ name: 'list', query: { url, name } });
    return;
  }
  const u = new URL(url, state.web);
  if (u.hostname === new URL(state.web).hostname) {
    push(url);
  } else {
    window.open(url, '_blank');
  }
}

// keep global state.user in sync
let loginTimer: number | null = null;

async function pollUser() {
  try {
    const r = await getUser();
    if (r.user !== state.user) {
      state.user = r.user;
      refreshState().catch(() => {});
    }
    if (isLogin.value && r.user !== 0) {
      // app: activity.finish() after reading favorites_data["user_id"]
      toastLogin();
      router.back();
      return;
    }
  } catch {
    /* ignore */
  }
  loginTimer = window.setTimeout(pollUser, 1500);
}

function toastLogin() {
  // keep it quiet — the app just finishes the activity
}

function openInBrowser() {
  menuOpen.value = false;
  if (showUrl.value) window.open(showUrl.value, '_blank');
}

function back() {
  goBack();
}

onMounted(() => {
  load(defuri.value);
  window.addEventListener('message', onMessage);
  loginTimer = window.setTimeout(pollUser, 500);
});
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  if (timer.value) window.clearInterval(timer.value);
  if (loginTimer) window.clearTimeout(loginTimer);
});
</script>

<template>
  <div class="web-host">
    <header class="toolbar">
      <button class="btn" @click="back"><IconChevronLeft size="22" stroke="1.5" /></button>
      <h1 style="font-size: 15px">{{ hostLabel }}</h1>
      <div class="menu-wrap">
        <button class="btn" @click="menuOpen = !menuOpen"><IconMenu2 size="20" stroke="1.5" /></button>
        <div v-if="menuOpen" class="menu-drop">
          <button class="mi" @click="openInBrowser"><span class="mi-ic"><IconExternalLink size="17" stroke="1.6" /></span>浏览器打开</button>
        </div>
      </div>
    </header>
    <div class="web-progress">
      <div class="bar" :style="{ width: progress + '%' }"></div>
    </div>
    <iframe
      v-if="frameSrc"
      :key="frameSrc + '|' + frameReloadKey"
      class="web-frame"
      :src="frameSrc"
      @load="onFrameLoad"
      @loadstart="onFrameStart"
      allow="forms; scripts; popups"
    ></iframe>
    <div v-else class="spin-wrap"><div class="spin"></div></div>
    <div class="web-bar">
      <button class="btn" title="首页" @click="goHome"><IconHome size="19" stroke="1.6" /></button>
      <button class="btn" title="后退" :disabled="!canBack" @click="goBack"><IconChevronLeft size="20" stroke="1.6" /></button>
      <button class="btn" title="前进" :disabled="!canForward" @click="goForward"><IconChevronRight size="20" stroke="1.6" /></button>
      <button class="btn" title="刷新" @click="goRefresh"><IconRefresh size="19" stroke="1.6" /></button>
      <span class="url">{{ showUrl }}</span>
    </div>
  </div>
</template>