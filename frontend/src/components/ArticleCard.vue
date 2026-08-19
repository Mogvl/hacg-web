<script setup lang="ts">
// 卡片排版对齐 hacg.me 原站:
//   标题 → meta 行(发表于<时间链接>由<作者链接>, 均可点击跳转) → 图 → 摘要
//   → footer 行(发表在<分类>、标签为<标签> chips, 点击跳转分类/标签列表)
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IconPhoto } from '@tabler/icons-vue';
import type { Article } from '../api';
import { imageProxyUrl } from '../api';
import { formatCnDate } from '../utils';

const props = defineProps<{ article: Article }>();
const router = useRouter();

// 原版每卡一色的行为保留, 但校准为低饱和粉紫系
const color = `hsla(${330 + Math.floor(Math.random() * 40)}, 48%, 62%, 1)`;

interface TagLike {
  name: string;
  url: string;
}

const showTitle = computed(() => props.article.title.length > 0);
const showMeta = computed(() => true);
const showContent = computed(() => !!props.article.content);
const showCats = computed(() => !!props.article.category);
const showTags = computed(() => props.article.tags.length > 0);

const metaTime = computed(() => formatCnDate(props.article.time));

const imgState = ref<'loading' | 'loaded' | 'error'>('loading');
const imgSrc = ref(props.article.image);

function onImgLoad() {
  imgState.value = 'loaded';
}
function onImgError() {
  if (imgSrc.value !== imageProxyUrl(props.article.image)) {
    imgSrc.value = imageProxyUrl(props.article.image); // hotlink-protection fallback via proxy
  } else {
    imgState.value = 'error';
  }
}

// 入场动画
const shown = ref(false);
let io: IntersectionObserver | null = null;
let el: HTMLElement | null = null;

onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          shown.value = true;
          io?.unobserve(e.target);
        }
      }
    },
    { rootMargin: '200px' }
  );
  if (el) io.observe(el);
});
onBeforeUnmount(() => io?.disconnect());

function open() {
  const a = props.article;
  router.push({
    name: 'post',
    params: { id: String(a.id || 0) },
    query: { url: a.link || '' },
  });
}

function openTag(t: TagLike, e: Event) {
  e.stopPropagation();
  router.push({ name: 'list', query: { url: t.url, name: t.name } });
}
</script>

<template>
  <div ref="el" class="card" :class="{ new: shown }" @click="open">
    <div v-if="showTitle" class="title" :style="{ color }" @click.stop="open">{{ article.title }}</div>
    <div v-if="showMeta" class="meta">
      <span class="meta-pre" :style="{ color }">发表于</span>
      <a class="meta-link" @click.stop="open">{{ metaTime }}</a>
      <span class="meta-pre" :style="{ color }">由</span>
      <a
        v-if="article.author"
        class="meta-link"
        @click.stop="openTag(article.author, $event)"
      >{{ article.author.name }}</a>
    </div>
    <div class="thumb">
      <img
        v-if="article.image"
        :src="imgSrc"
        :class="{ loaded: imgState === 'loaded' }"
        loading="lazy"
        @load="onImgLoad"
        @error="onImgError"
        alt=""
      />
      <div v-else class="ph"><IconPhoto size="34" stroke="1.2" /></div>
    </div>
    <div v-if="showContent" class="excerpt">{{ article.content }}</div>
    <div v-if="showCats || showTags" class="tag-row">
      <span
        v-if="article.category"
        class="chip chip-cat"
        @click.stop="openTag(article.category, $event)"
      >发表在 {{ article.category.name }}</span>
      <span
        v-for="(t, i) in article.tags"
        :key="i"
        class="chip"
        @click.stop="openTag(t, $event)"
      >标签为 {{ t.name }}</span>
    </div>
  </div>
</template>
