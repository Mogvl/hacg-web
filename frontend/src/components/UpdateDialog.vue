<script setup lang="ts">
// checkVersion dialog: 更新 / 发布页 / 取消
import { updateState } from '../update';

const RELEASE = 'https://github.com/yueeng/hacg/releases';

function open(url: string) {
  window.open(url, '_blank');
}
</script>

<template>
  <div v-if="updateState.open" class="dlg-backdrop" @click.self="updateState.open = false">
    <div class="dlg">
      <div class="dlg-title">从 {{ updateState.local }} 升级到 {{ updateState.latest }}。</div>
      <div class="dlg-body">{{ updateState.body || '点击更新下载新版本。' }}</div>
      <div class="dlg-actions">
        <button class="dbtn" @click="updateState.apk && open(updateState.apk)">更新</button>
        <button class="dbtn" @click="open(RELEASE)">发布页</button>
        <button class="dbtn muted" @click="updateState.open = false">取消</button>
      </div>
    </div>
  </div>
</template>