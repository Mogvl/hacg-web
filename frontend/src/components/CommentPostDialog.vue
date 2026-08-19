<script setup lang="ts">
// commenting() dialog parity: author/email (hidden when logged in), content,
// submit → wpdAddComment; 登录 button when not logged in.
import { ref, watch } from 'vue';
import type { Comment } from '../api';
import { addComment } from '../api';
import { state } from '../store';
import { commentPrefs, saveCommentPrefs, toast } from '../utils';

const props = defineProps<{
  open: boolean;
  postId: number;
  parent: Comment | null;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'succeed', c: Comment): void; (e: 'login'): void }>();

const author = ref('');
const email = ref('');
const content = ref('');
const busy = ref(false);

watch(
  () => props.open,
  (v) => {
    if (v) {
      const prefs = commentPrefs();
      author.value = prefs.author;
      email.value = prefs.email;
      content.value = prefs.comment;
    }
  }
);

const titleText = () =>
  props.parent ? `回复: ${props.parent.user}` : '评论';

async function submit() {
  const c = content.value.trim();
  const a = author.value.trim();
  const e = email.value.trim();
  if (!c || (state.user === 0 && (!a || !e))) {
    toast('部分字段为空。');
    return;
  }
  busy.value = true;
  try {
    const r = await addComment({
      postId: props.postId,
      author: state.user === 0 ? a : undefined,
      email: state.user === 0 ? e : undefined,
      content: c,
      wpdiscuzUniqueId: props.parent ? props.parent.uniqueId : '0_0',
      depth: props.parent ? props.parent.depth : 1,
    });
    saveCommentPrefs({ author: a, email: e, comment: '' });
    content.value = '';
    emit('succeed', r.comment);
    emit('close');
  } catch (err: any) {
    toast(err.message || '提交失败');
  } finally {
    busy.value = false;
  }
}

function goLogin() {
  saveCommentPrefs({ author: author.value, email: email.value, comment: content.value });
  emit('login');
}
</script>

<template>
  <div v-if="open" class="dlg-backdrop" @click.self="emit('close')">
    <div class="dlg">
      <div class="dlg-title">{{ titleText() }}</div>
      <div class="dlg-body">
        <div v-if="state.user === 0" class="field">
          <label>姓名</label>
          <input type="text" v-model="author" />
        </div>
        <div v-if="state.user === 0" class="field">
          <label>电子邮件</label>
          <input type="email" v-model="email" />
        </div>
        <div class="field">
          <label>评论内容</label>
          <textarea v-model="content" rows="4"></textarea>
        </div>
      </div>
      <div class="dlg-actions">
        <button v-if="state.user === 0" class="dbtn neutral muted" @click="goLogin">登录</button>
        <button class="dbtn" :disabled="busy" @click="submit">{{ busy ? '提交中…' : '提交' }}</button>
        <button class="dbtn muted" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>