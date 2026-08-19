// HAcg config object — mirrors Article.kt `object HAcg`:
//   config.json (assets → data), hosts list, current host, categories, bbs, philosophy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testHost } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS_CONFIG = path.join(ROOT, 'assets', 'config.json');
export const DATA_DIR = process.env.HACG_DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export const APP_VERSION = '1.5.6'; // mirrors BuildConfig.VERSION_NAME of the reference app
export const GITHUB_CONFIG_URL =
  'https://raw.githubusercontent.com/yueeng/hacg/master/app/src/main/assets/config.json';
export const RELEASE_URL = 'https://github.com/yueeng/hacg/releases';

const IS_HTTP = /^https?:\/\//;

let state = {
  appVersion: null,
  host: '', // system.host (empty = use first default)
  saveHosts: [], // system.hosts (json array)
  config: null, // stored HacgConfig (configFile contents)
  versionCodeApplied: false,
};

function defaultConfig() {
  try {
    if (state.config) return state.config;
    return JSON.parse(fs.readFileSync(ASSETS_CONFIG, 'utf8'));
  } catch {
    return null;
  }
}

function defaultHosts(cfg = null) {
  try {
    return (cfg || defaultConfig()).host;
  } catch {
    return ['www.hacg.me'];
  }
}

function defaultCategory(cfg = null) {
  try {
    return (cfg || defaultConfig()).category.map((c) => ({ name: c.name, url: c.url }));
  } catch {
    return [];
  }
}

function defaultBbs(cfg = null) {
  try {
    return (cfg || defaultConfig()).bbs;
  } catch {
    return '/wp/bbs';
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch {
  /* first run */
}

// Mirror the app: on app version change (BuildConfig.VERSION_CODE bump) → reset host/saveHosts/config.
function migrateState() {
  if (state.appVersion === APP_VERSION) return;
  state.appVersion = APP_VERSION;
  state.host = '';
  state.saveHosts = [];
  state.config = null;
  try {
    fs.rmSync(CONFIG_FILE, { force: true });
  } catch {
    /* ignore */
  }
  saveState();
}
migrateState();

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function hosts() {
  return [...state.saveHosts, ...defaultHosts()].filter((v, i, a) => a.indexOf(v) === i);
}

export const host = {
  get() {
    const h = state.host;
    return h || hosts()[0] || 'www.hacg.me';
  },
  set(h) {
    if (!h) delete state.host;
    else state.host = h;
    saveState();
  },
};

export const saveHosts = {
  get() {
    return state.saveHosts;
  },
  set(list) {
    state.saveHosts = [...new Set(list.filter(Boolean))];
    saveState();
  },
};

export const bbs = () => defaultBbs();
export const categories = () => defaultCategory();

export const web = () => `https://${host.get()}`;
export const domain = () => {
  const i = host.get().indexOf('/');
  return i >= 0 ? host.get().substring(0, i) : host.get();
};
export const wordpress = () => `${web()}/wp`;
export const philosophy = () => {
  const b = bbs();
  if (IS_HTTP.test(b)) return b;
  return `${web()}${b}`;
};
export const wpdiscuz = () =>
  `${wordpress()}/wp-content/plugins/wpdiscuz/utils/ajax/wpdiscuz-ajax.php`;

// Mirrors HAcg.update(): fetch remote config; if newer → return it for the caller to
// snackbar-confirm; else null (and tip handled by caller).
export async function checkConfigUpdate() {
  try {
    const res = await fetch(GITHUB_CONFIG_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const latest = JSON.parse(await res.text());
    const current = defaultConfig()?.version || 0;
    if (latest.version <= current) return { latest, newer: false };
    return { latest, newer: true, currentVersion: current };
  } catch (e) {
    console.error('[checkConfigUpdate]', e.message);
    return null;
  }
}

// Mirrors the "Update" action of the snackbar: host = defaultHosts(latest).first(); configFile.writeText(html); updated()
export function applyConfigUpdate(latest) {
  state.config = latest;
  host.set(defaultHosts(latest)[0]);
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(latest, null, 2));
  } catch {
    /* ignore */
  }
  saveState();
}

// Mirrors menu "auto": pick fastest host among hosts() by latency.
export async function autoHost() {
  const list = hosts();
  const results = await Promise.all(list.map(async (u) => ({ u, ...(await testHost(u)) })));
  const good = results.filter((r) => r.ok);
  if (good.length === 0) return null;
  good.sort((a, b) => a.ms - b.ms);
  const best = good[0];
  host.set(best.u);
  return { host: best.u, ms: best.ms };
}

export function stateSnapshot() {
  return {
    version: APP_VERSION,
    host: host.get(),
    hosts: hosts(),
    bbs: bbs(),
    categories: categories(),
    configVersion: defaultConfig()?.version || 0,
  };
}