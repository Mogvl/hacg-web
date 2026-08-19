<script setup lang="ts">
// HAcg.setHost flow parity: list dialog → (变更域名) edit dialog → dismiss reopens list.
import { computed, ref, watch } from 'vue';
import { editHost, resetHosts, setHost } from '../api';
import { state, refreshState } from '../store';
import { toast } from '../utils';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const stage = ref<'list' | 'edit'>('list');
const checked = ref(0);
const inputHost = ref('');

watch(
  () => props.open,
  (v) => {
    if (v) {
      stage.value = 'list';
      const i = state.hosts.indexOf(state.host);
      checked.value = i >= 0 ? i : 0;
    }
  }
);

const listTitle = computed(() => '神社备用域名');
const editTitle = computed(() => '神社备用域名');

async function okList() {
  const h = state.hosts[checked.value];
  if (!h) return;
  try {
    await setHost(h);
    await refreshState();
    emit('close');
  } catch (e: any) {
    toast(e.message || '设置失败');
  }
}

async function toEdit() {
  stage.value = 'edit';
}

async function okEdit() {
  const h = inputHost.value.trim();
  if (!h) return;
  try {
    await editHost(h); // adds to saved list; app then returns to the list dialog
    stage.value = 'list';
    inputHost.value = '';
    await refreshState();
    const i = state.hosts.indexOf(h);
    if (i >= 0) checked.value = i;
  } catch (e: any) {
    toast(e.message || '设置失败');
  }
}

async function resetAll() {
  try {
    await resetHosts();
    await refreshState();
    checked.value = 0;
  } catch (e: any) {
    toast(e.message || '重置失败');
  }
}

function onEditDismiss() {
  if (stage.value === 'edit') {
    stage.value = 'list'; // app reopens the list dialog after the edit dialog dismisses
  }
}

function close() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="dlg-backdrop" @click.self="close">
    <div class="dlg">
      <template v-if="stage === 'list'">
        <div class="dlg-title">{{ listTitle }}</div>
        <div class="dlg-list">
          <label v-for="(h, i) in state.hosts" :key="h">
            <input type="radio" :value="i" v-model="checked" />
            <span>{{ h }}</span>
          </label>
        </div>
        <div class="dlg-actions">
          <button class="dbtn" @click="toEdit">变更域名</button>
          <button class="dbtn" @click="okList">确定</button>
          <button class="dbtn muted" @click="close">取消</button>
        </div>
      </template>
      <template v-else>
        <div class="dlg-title">{{ editTitle }}</div>
        <div class="dlg-body">
          <p style="margin: 0 0 10px; color: #888; font-size: 13px">例 “www.hacg.me”</p>
          <input
            type="text"
            v-model="inputHost"
            placeholder="www.hacg.icu"
            @keydown.enter="okEdit"
          />
        </div>
        <div class="dlg-actions">
          <button class="dbtn neutral muted" @click="resetAll">重置所有</button>
          <button class="dbtn" @click="okEdit">确定</button>
          <button class="dbtn muted" @click="onEditDismiss">取消</button>
        </div>
      </template>
    </div>
  </div>
</template>