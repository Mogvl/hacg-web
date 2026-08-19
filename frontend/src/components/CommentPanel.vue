<script setup lang="ts">
// InfoCommentFragment parity: sorting menu, paging footer, pull refresh,
// comment FAB, nested comments.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { Comment, Sorting } from '../api';
import { loadComments } from '../api';
import { state } from '../store';
import { randomColor, toast } from '../utils';
import CommentItem from './CommentItem.vue';
import CommentPostDialog from './CommentPostDialog.vue';

const props = defineProps<{ postId: number }>();
const router = useRouter();

const sorting = ref<Sorting>('by_vote');
const items = ref<Comment[]>([]);
const next = ref<{ lastParentId: number; offset: number } | null>(null);
const status = ref<'idle' | 'loading' | 'error' | 'complete'>('idle');
const sortOpen = ref(false);
const posting = ref(false);

const fabColor = randomColor();

const footer = computed(() => {
  if (status.value === 'error') return { text: '加载失败', clickable: true };
  if (status.value === 'loading' && items.value.length) return { text: '加载中…', clickable: false };
  if (status.value === 'complete')
    return { text: items.value.length === 0 ? '列表空' : '没有更多了', clickable: false };
  return { text: '加载更多', clickable: false };
});

let seq = 0;

async function query(refresh = false) {
  if (status.value === 'loading') return;
  if (refresh) {
    items.value = [];
    next.value = null;
  }
  status.value = 'loading';
  const s = ++seq;
  try {
    const page = await loadComments({
      postId: props.postId,
      sorting: sorting.value,
      offset: refresh ? 0 : (next.value?.offset || 0),
      lastParentId: refresh ? 0 : (next.value?.lastParentId || 0),
    });
    if (s !== seq) return;
    items.value = [...items.value, ...page.list];
    next.value = page.next;
    status.value = page.next ? 'idle' : 'complete';
  } catch (e: any) {
    if (s !== seq) return;
    status.value = 'error';
    if (items.value.length === 0) toast(e.message || '评论加载失败');
  }
}

function loadMore() {
  if (status.value === 'idle' && next.value) query(false);
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore();
}

function setSorting(v: Sorting) {
  if (sorting.value === v) return;
  sorting.value = v;
  sortOpen.value = false;
  query(true);
}

function onRootSucceed(c: Comment) {
  items.value.unshift(c);
  const el = listEl.value;
  el?.scrollTo({ top: 0, behavior: 'smooth' });
}

const listEl = ref<HTMLElement | null>(null);

watch(
  () => props.postId,
  () => query(true),
  { immediate: true }
);
</script>

<template>
  <div class="detail-host" style="min-height: 0">
    <div class="tabs" style="position: static">
      <button class="tab active" @click="sortOpen = !sortOpen">评论排序 ▾</button>
    </div>
    <div v-if="sortOpen" class="dlg-backdrop" style="z-index: 180" @click.self="sortOpen = false">
      <div class="dlg" style="min-width: 240px">
        <div class="dlg-title" style="font-size: 15px">评论排序</div>
        <div class="dlg-list">
          <label>
            <input type="radio" :checked="sorting === 'by_vote'" @change="setSorting('by_vote')" />
            <span>得票最多的评论</span>
          </label>
          <label>
            <input type="radio" :checked="sorting === 'newest'" @change="setSorting('newest')" />
            <span>最新的评论</span>
          </label>
          <label>
            <input type="radio" :checked="sorting === 'oldest'" @change="setSorting('oldest')" />
            <span>最旧的评论</span>
          </label>
        </div>
      </div>
    </div>

    <div
      ref="listEl"
      class="list-host"
      @scroll.passive="onScroll"
      @click.stop
    >
      <div v-if="status === 'loading' && items.length === 0" class="spin-wrap"><div class="spin"></div></div>
      <div v-else class="comment-list" @click.stop>
        <CommentItem v-for="c in items" :key="c.uniqueId || c.id" :comment="c" :post-id="postId" />
      </div>
      <div
        v-if="items.length > 0 || footer.clickable"
        class="list-footer"
        :class="{ err: footer.clickable }"
        @click="footer.clickable && query(true)"
      >
        <span v-if="status === 'loading' && items.length" class="spin"></span>
        {{ footer.text }}
      </div>
    </div>

    <div class="fab-host">
      <button
        class="fab"
        :style="{ background: fabColor }"
        title="发表评论"
        @click="posting = true"
      >
        ✎
      </button>
    </div>

    <CommentPostDialog
      :open="posting"
      :post-id="postId"
      :parent="null"
      @close="posting = false"
      @succeed="onRootSucceed"
      @login="router.push({ name: 'web', query: { login: '1' } })"
    />
  </div>
</template>