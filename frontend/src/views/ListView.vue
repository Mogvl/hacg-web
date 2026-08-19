<script setup lang="ts">
// ListActivity parity: back arrow + title + article list for search/tag/author/category URLs.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ArticleList from '../components/ArticleList.vue';

const route = useRoute();
const router = useRouter();

const url = computed(() => String(route.query.url || ''));
const name = computed(() => String(route.query.name || '搜索'));

function back() {
  if (window.history.length > 1) router.back();
  else router.push('/');
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column; min-height: 0">
    <header class="toolbar">
      <button class="btn" @click="back">‹</button>
      <h1>{{ name }}</h1>
    </header>
    <ArticleList :key="url" :url="url" />
  </div>
</template>