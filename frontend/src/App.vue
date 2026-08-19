<script setup lang="ts">
import { toasts, dismissToast } from './utils';
import UpdateDialog from './components/UpdateDialog.vue';
</script>

<template>
  <router-view />
  <UpdateDialog />
  <div class="toast-host">
    <div v-for="t in toasts" :key="t.id" class="toast">
      <span>{{ t.text }}</span>
      <button v-if="t.action" class="t-act" @click="t.onAction?.(); dismissToast(t.id)">
        {{ t.action }}
      </button>
    </div>
  </div>
</template>