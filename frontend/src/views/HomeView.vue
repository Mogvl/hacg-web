<script setup lang="ts">
// MainActivity parity: category tabs, search, menus (user/philosophy/config/auto/about/update).
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IconArrowRight,
  IconBolt,
  IconClock,
  IconGlobe,
  IconInfoCircle,
  IconMenu2,
  IconMessages,
  IconRefresh,
  IconSearch,
  IconUserCircle,
  IconX,
} from '@tabler/icons-vue';
import ArticleList from '../components/ArticleList.vue';
import HostDialog from '../components/HostDialog.vue';
import { autoHost, checkConfig, updateConfig } from '../api';
import { state, initState, refreshState } from '../store';
import { toast, clearSearchHistory, saveSearchHistory, searchHistory } from '../utils';
import { checkForUpdate } from '../update';

const router = useRouter();
const tab = ref(0);
const title = ref('琉璃神社');

const categories = computed(() => state.categories);
const activeUrl = computed(() => categories.value[tab.value]?.url || '/wp/');

// search (SearchView parity with history)
const searchOpen = ref(false);
const searchText = ref('');
const history = ref<string[]>([]);

function openSearch() {
  searchOpen.value = true;
  history.value = searchHistory();
  setTimeout(() => searchInput.value?.focus(), 50);
}
const searchInput = ref<HTMLInputElement | null>(null);

function submitSearch() {
  const key = searchText.value.trim();
  if (!key) return;
  saveSearchHistory(key);
  // ListActivity: wordpress/?s=<key>&submit=搜索
  const url = `${state.wordpress}/?s=${encodeURIComponent(key)}&submit=${encodeURIComponent('搜索')}`;
  router.push({ name: 'list', query: { url, name: key } });
  searchOpen.value = false;
  searchText.value = '';
}

function useHistory(q: string) {
  searchText.value = q;
  submitSearch();
}

function clearHistory() {
  clearSearchHistory();
  history.value = [];
  toast('搜索记录已清除');
}

// menus
const menuOpen = ref(false);
const hostDialogOpen = ref(false);
const aboutOpen = ref(false);

const user = computed(() => state.user);
const wordpress = computed(() => state.wordpress);
const philosophy = computed(() => state.philosophy);

function openMenu() {
  menuOpen.value = !menuOpen.value;
}

function goUser() {
  // MainActivity: user != 0 → profile page, else login page
  if (user.value !== 0) {
    router.push({ name: 'web', query: { url: `${philosophy.value}/profile/${user.value}` } });
  } else {
    router.push({ name: 'web', query: { login: '1' } });
  }
}

function goPhilosophy() {
  router.push({ name: 'web', query: { url: philosophy.value } });
}

function openExternal(url: string) {
  window.open(url, '_blank');
}

// 检测域名配置
async function doCheckConfig() {
  try {
    const r = await checkConfig();
    if (r.newer) {
      toast('有新的域名配置文件', '更新', async () => {
        try {
          await updateConfig();
          await refreshState();
          if (title.value) title.value = '琉璃神社';
          toast('配置已更新');
        } catch (e: any) {
          toast(e.message || '更新失败');
        }
      });
    } else {
      toast('配置文件已经是最新了');
    }
  } catch (e: any) {
    toast(e.message || '配置检查失败');
  }
}

// 自动选择可用域名
async function doAuto() {
  try {
    const r = await autoHost();
    await refreshState();
    toast(`选择 ${r.host}.`);
  } catch (e: any) {
    toast(e.message || '自动选择失败');
  }
}

const APP_VERSION = '1.5.6';

onMounted(async () => {
  await initState();
  checkForUpdate(false); // startup version check (silent when current)
});
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column; min-height: 0">
    <header class="toolbar">
      <h1>{{ title }}</h1>
      <button v-if="searchOpen" class="btn" title="关闭搜索" @click="searchOpen = false">
        <IconX size="19" stroke="1.5" />
      </button>
      <button v-else class="btn" title="搜索" @click="openSearch">
        <IconSearch size="20" stroke="1.5" />
      </button>
      <button class="btn" title="哲学" @click="goPhilosophy">
        <IconMessages size="20" stroke="1.5" />
      </button>
      <button class="btn" title="用户信息" @click="goUser">
        <IconUserCircle size="20" stroke="1.5" />
      </button>
      <div class="menu-wrap">
        <button class="btn" title="菜单" @click="openMenu">
          <IconMenu2 size="20" stroke="1.5" />
        </button>
        <div v-if="menuOpen" class="menu-drop" @click.self="menuOpen = false">
          <button class="mi" @click="menuOpen = false; clearHistory()"><span class="mi-ic"><IconClock size="17" stroke="1.6" /></span>清除搜索记录</button>
          <button class="mi" @click="menuOpen = false; hostDialogOpen = true"><span class="mi-ic"><IconGlobe size="17" stroke="1.6" /></span>神社备用域名</button>
          <button class="mi" @click="menuOpen = false; doCheckConfig()"><span class="mi-ic"><IconRefresh size="17" stroke="1.6" /></span>检测域名配置</button>
          <button class="mi" @click="menuOpen = false; doAuto()"><span class="mi-ic"><IconBolt size="17" stroke="1.6" /></span>自动选择可用域名</button>
          <button class="mi" @click="menuOpen = false; aboutOpen = true"><span class="mi-ic"><IconInfoCircle size="17" stroke="1.6" /></span>关于</button>
        </div>
      </div>
    </header>

    <div v-if="searchOpen" class="toolbar" style="position: static; min-height: 48px">
      <div class="search-box">
        <input
          ref="searchInput"
          v-model="searchText"
          placeholder="搜索"
          @keydown.enter="submitSearch"
        />
        <button class="btn" @click="submitSearch"><IconArrowRight size="18" stroke="1.6" /></button>
      </div>
    </div>

    <nav class="tabs">
      <button
        v-for="(c, i) in categories"
        :key="c.url + i"
        class="tab"
        :class="{ active: i === tab }"
        @click="tab = i"
      >
        {{ c.name }}
      </button>
    </nav>

    <ArticleList :key="activeUrl" :url="activeUrl" />

    <!-- search history dropdown -->
    <div v-if="searchOpen && history.length" class="dlg-backdrop" style="z-index: 150" @click.self="searchOpen = false">
      <div class="dlg" style="position: fixed; top: 110px; left: 50%; transform: translateX(-50%); min-width: min(92vw, 420px)">
        <div class="dlg-title" style="font-size: 14px; color: #888">搜索历史</div>
        <div class="dlg-list">
          <label v-for="q in history" :key="q" @click="useHistory(q)">
            <span class="mi-ic" style="color: var(--ink-3)"><IconClock size="16" stroke="1.6" /></span><span>{{ q }}</span>
          </label>
        </div>
      </div>
    </div>

    <HostDialog :open="hostDialogOpen" @close="hostDialogOpen = false" />

    <!-- About (MainActivity about dialog) -->
    <div v-if="aboutOpen" class="dlg-backdrop" @click.self="aboutOpen = false">
      <div class="dlg">
        <div class="dlg-title">琉璃神社 {{ APP_VERSION }}</div>
        <div class="dlg-list">
          <label @click="openExternal(wordpress)">
            <span>琉璃神社</span>
          </label>
        </div>
        <div class="dlg-actions">
          <button class="dbtn" @click="openExternal('https://github.com/yueeng/hacg/releases')">
            发布页
          </button>
          <button class="dbtn" @click="aboutOpen = false; checkForUpdate(true)">检查更新</button>
          <button class="dbtn muted" @click="aboutOpen = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>