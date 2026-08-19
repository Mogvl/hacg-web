import { reactive } from 'vue';
import * as api from './api';

// Global state — mirrors the app's SharedPreferences + HAcg object.
export const state = reactive<{
  ready: boolean;
  version: string;
  host: string;
  hosts: string[];
  bbs: string;
  categories: api.Category[];
  configVersion: number;
  user: number;
  web: string;
  wordpress: string;
  philosophy: string;
}>({
  ready: false,
  version: '1.5.6',
  host: '',
  hosts: [],
  bbs: '/wp/bbs',
  categories: [],
  configVersion: 0,
  user: 0,
  web: '',
  wordpress: '',
  philosophy: '',
});

export async function refreshState() {
  const s = await api.getState();
  Object.assign(state, s, { ready: true });
}

export async function applyHostChange() {
  await refreshState();
}

const pending: Promise<void>[] = [];

export async function initState() {
  if (pending.length) return pending[pending.length - 1];
  const p = refreshState().finally(() => {
    pending.length = 0;
  });
  pending.push(p);
  return p;
}