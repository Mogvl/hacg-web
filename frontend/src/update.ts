// Version check — mirrors MainActivity.checkVersion(): GitHub latest release vs local version.
import { reactive } from 'vue';
import { state } from './store';
import { toast } from './utils';

export const updateState = reactive<{
  open: boolean;
  local: string;
  latest: string;
  body: string;
  apk: string;
}>({
  open: false,
  local: '1.5.6',
  latest: '',
  body: '',
  apk: '',
});

function compareVersion(a: string, b: string): number {
  const va = a.split('.').map((x) => parseInt(x, 10) || 0);
  const vb = b.split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(va.length, vb.length);
  for (let i = 0; i < n; i++) {
    const x = va[i] || 0;
    const y = vb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

let checking = false;
let checkedOnce = false; // the app only checks on process start

export async function checkForUpdate(withToast: boolean): Promise<void> {
  if (checking) return;
  if (!withToast && checkedOnce) return;
  checkedOnce = true;
  checking = true;
  try {
    const res = await fetch('https://api.github.com/repos/yueeng/hacg/releases/latest');
    if (!res.ok) return;
    const release = await res.json();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    const apk = release.assets?.find((a: any) => a.name === 'app-release.apk')?.browser_download_url || '';
    const local = state.version;
    if (latest && compareVersion(local, latest) < 0) {
      Object.assign(updateState, {
        open: true,
        local,
        latest,
        body: release.body || '',
        apk,
      });
    } else if (withToast) {
      toast(`版本 ${local} 已经是最新版本。`);
    }
  } catch {
    /* network error — silent, like the app */
  } finally {
    checking = false;
  }
}