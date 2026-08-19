<script setup lang="ts">
// FloatingActionMenu parity: chrysanthemum FAB with colored mini actions + labels.
import { ref } from 'vue';
import { randomColor } from '../utils';

export interface FabItem {
  id: string;
  icon: string;
  label: string;
  show?: boolean;
}

const props = defineProps<{ items: FabItem[] }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const open = ref(false);
const mainColor = randomColor();
const colors = new Map<string, string>();

function colorOf(id: string): string {
  if (!colors.has(id)) colors.set(id, randomColor());
  return colors.get(id)!;
}

function pick(id: string) {
  open.value = false;
  emit('select', id);
}
</script>

<template>
  <div class="fab-host" :class="{ open }">
    <button v-if="open" class="scrim" @click="open = false"></button>
    <div v-for="it in [...props.items].reverse()" :key="it.id" v-show="it.show !== false" class="fab-item">
      <span class="fab-label">{{ it.label }}</span>
      <button class="fab mini" :style="{ background: colorOf(it.id) }" @click="pick(it.id)">
        {{ it.icon }}
      </button>
    </div>
    <button class="fab" :style="{ background: mainColor }" @click="open = !open">
      <span v-if="open">✕</span>
      <span v-else>＋</span>
    </button>
  </div>
</template>