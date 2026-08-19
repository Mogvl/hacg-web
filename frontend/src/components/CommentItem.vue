<script setup lang="ts">
// CommentHolder parity: avatar, user, time, content, vote up/down + score,
// nested children, click → review dialog (回复/复制/取消).
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IconThumbDown, IconThumbUp } from '@tabler/icons-vue';
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
          <IconThumbDown size="17" stroke="1.6" />
        </button>
        <span class="cmt-score">{{ comment.moderation }}</span>
        <button class="vbtn" title="赞" @click.stop="vote(1)">
          <IconThumbUp size="17" stroke="1.6" />
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