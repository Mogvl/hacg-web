<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Article } from '../api';
import { imageProxyUrl } from '../api';
import { formatListTime, randomColor } from '../utils';

const props = defineProps<{ article: Article }>();
const router = useRouter();

// ArticleHolder: text1/text4 get one random color per card; chips random translucent colors
const color = randomColor();

interface TagLike {
  name: string;
  url: string;
}
const expend = computed<TagLike[]>(() => {
  const { tags, category, author } = props.article;
  return [...tags, ...(category ? [category] : []), ...(author ? [author] : [])].filter(Boolean);
});
const chipColors = computed(() => expend.value.map(() => randomColor(0.75)));

const showTitle = computed(() => props.article.title.length > 0);
const showMeta = computed(() => true);
const showTags = computed(() => expend.value.length > 0);
const showContent = computed(() => !!props.article.content);

const metaText = computed(() => {
  const a = props.article;
  return `发表于${formatListTime(a.time)}由${a.author?.name || ''}|${a.comments}条回复`;
});

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

// glide-like fade-in
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
      <div v-else class="ph">🖼</div>
    </div>
    <div v-if="showTags" class="chips">
      <span
        v-for="(t, i) in expend"
        :key="i"
        class="chip"
        :style="{ background: chipColors[i], color: '#fff' }"
        @click="openTag(t, $event)"
      >
        {{ t.name }}
      </span>
    </div>
    <div v-if="showTitle" class="title" :style="{ color }">{{ article.title }}</div>
    <div v-if="showMeta" class="meta" :style="{ color }">{{ metaText }}</div>
    <div v-if="showContent" class="excerpt">{{ article.content }}</div>
  </div>
</template>