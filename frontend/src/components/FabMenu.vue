<script setup lang="ts">
// FloatingActionMenu parity: chrysanthemum FAB with mini actions + labels.
import { ref } from 'vue';
import { IconMagnet, IconPlus, IconShare, IconWorld, IconX } from '@tabler/icons-vue';

export interface FabItem {
  id: string;
  icon: string;
  label: string;
  show?: boolean;
}

const props = defineProps<{ items: FabItem[] }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const ICONS: Record<string, any> = {
  magnet: IconMagnet,
  world: IconWorld,
  share: IconShare,
};

function iconOf(id: string) {
  return ICONS[id] || IconPlus;
}

const open = ref(false);
// 统一粉紫渐变(克制): mini 动作按钮与主按钮同一材料
const miniGrad = 'linear-gradient(135deg, rgba(238, 215, 245, 0.95), rgba(207, 189, 242, 0.95))';

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
      <button class="fab mini" :style="{ background: miniGrad, color: '#4a3a63' }" @click="pick(it.id)">
        <component :is="iconOf(it.id)" size="19" stroke="1.6" />
      </button>
    </div>
    <button class="fab" @click="open = !open">
      <IconX v-if="open" size="24" stroke="1.6" />
      <IconPlus v-else size="24" stroke="1.6" />
    </button>
  </div>
</template>