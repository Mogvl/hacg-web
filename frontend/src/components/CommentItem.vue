<script setup lang="ts">
// CommentHolder parity: avatar, user, time, content, vote up/down + score,
// nested children, click → review dialog (回复/复制/取消).
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Comment } from '../api';
import { voteComment } from '../api';
import { state } from '../store';
import { clipboard, toast } from '../utils';
import CommentPostDialog from './CommentPostDialog.vue';

const props = defineProps<{ comment: Comment; postId: number }>();
const router = useRouter();

const reviewing = ref(false);
const replying = ref(false);

const faceSrc = ref(props.comment.face || '');
const faceErr = ref(false);

const OWNER_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23e8e8e8'/><circle cx='32' cy='24' r='12' fill='%23999'/><path d='M12 58c0-11 9-18 20-18s20 7 20 18' fill='%23999'/></svg>`
  );

async function vote(dir: 1 | -1) {
  try {
    const r = await voteComment({
      commentId: props.comment.id,
      voteType: dir,
      postId: props.postId,
    });
    props.comment.moderation = r.votes;
  } catch (e: any) {
    toast(e.message || '投票失败');
  }
}

async function copyComment() {
  if (await clipboard(props.comment.content)) {
    toast(`已复制 ${props.comment.content.slice(0, 40)}${props.comment.content.length > 40 ? '…' : ''}`);
  }
}

function onReplied(c: Comment) {
  props.comment.children.push(c);
  replying.value = false;
}

function goLogin() {
  replying.value = false;
  router.push({ name: 'web', query: { login: '1' } });
}
</script>

<template>
  <div class="cmt-card">
    <div class="cmt-bar"></div>
    <div class="cmt-head">
      <img
        v-if="comment.face && !faceErr"
        class="cmt-avatar"
        :src="faceSrc"
        @error="faceErr = true"
        alt=""
      />
      <img v-else class="cmt-avatar" :src="OWNER_PLACEHOLDER" alt="" />
      <div style="flex: 1; min-width: 0">
        <div class="cmt-user">{{ comment.user }}</div>
        <div class="cmt-time">{{ comment.time }}</div>
      </div>
      <div class="cmt-vote">
        <button class="vbtn" title="踩" @click.stop="vote(-1)">
          <svg viewBox="0 0 24 24"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" /></svg>
        </button>
        <span class="cmt-score">{{ comment.moderation }}</span>
        <button class="vbtn" title="赞" @click.stop="vote(1)">
          <svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>
        </button>
      </div>
    </div>
    <div class="cmt-text">{{ comment.content }}</div>
    <div v-if="comment.children.length" class="cmt-children">
      <CommentItem v-for="c in comment.children" :key="c.id + '_' + c.parent" :comment="c" :post-id="postId" />
    </div>

    <!-- click comment → review dialog (回复/复制/取消) -->
    <div v-if="reviewing" class="dlg-backdrop" @click.self="reviewing = false">
      <div class="dlg">
        <div class="dlg-title">{{ comment.user }}</div>
        <div class="dlg-body" style="max-height: 40vh">{{ comment.content }}</div>
        <div class="dlg-actions">
          <button class="dbtn" @click="reviewing = false; replying = true">回复</button>
          <button class="dbtn" @click="copyComment">复制</button>
          <button class="dbtn muted" @click="reviewing = false">取消</button>
        </div>
      </div>
    </div>

    <CommentPostDialog
      :open="replying"
      :post-id="postId"
      :parent="comment"
      @close="replying = false"
      @succeed="onReplied"
      @login="goLogin"
    />
  </div>
</template>