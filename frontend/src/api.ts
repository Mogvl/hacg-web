// API layer — talks to the backend (port 8201, proxied as /api in dev/preview).
const API = (import.meta.env.VITE_API_BASE as string) || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export interface Category {
  name: string;
  url: string;
}

export interface Tag {
  name: string;
  url: string;
}

export interface Article {
  id: number;
  title: string;
  link: string | null;
  image: string;
  content: string | null;
  time: string | null;
  comments: number;
  author: Tag | null;
  category: Tag | null;
  tags: Tag[];
}

export interface Comment {
  id: number;
  parent: number;
  content: string;
  user: string;
  face: string;
  moderation: number;
  time: string;
  children: Comment[];
  depth: number;
  uniqueId: string;
}

export interface AppState {
  version: string;
  host: string;
  hosts: string[];
  bbs: string;
  categories: Category[];
  configVersion: number;
  user: number;
  web: string;
  wordpress: string;
  philosophy: string;
}

export function getState() {
  return request<AppState>('/api/state');
}

export function checkConfig() {
  return request<{ currentVersion: number; latestVersion: number; newer: boolean }>('/api/config/check');
}

export function updateConfig() {
  return request<AppState>('/api/config/update', { method: 'POST' });
}

export function getHosts() {
  return request<{ hosts: string[]; current: string }>('/api/hosts');
}

export function setHost(host: string) {
  return request<{ hosts: string[]; current: string }>('/api/hosts', {
    method: 'POST',
    body: JSON.stringify({ host }),
  });
}

export function editHost(host: string) {
  return request<{ hosts: string[]; current: string }>('/api/hosts/edit', {
    method: 'POST',
    body: JSON.stringify({ host }),
  });
}

export function resetHosts() {
  return request<{ hosts: string[]; current: string }>('/api/hosts/reset', { method: 'POST' });
}

export function autoHost() {
  return request<{ host: string; ms: number }>('/api/hosts/auto', { method: 'POST' });
}

export interface ArticlePage {
  title: string;
  articles: Article[];
  next: string | null;
}

export function getArticles(url: string) {
  return request<ArticlePage>(`/api/articles?url=${encodeURIComponent(url)}`);
}

export interface ArticleDetail {
  article: Article | null;
  contentHtml: string;
  magnets: string[];
}

export function getArticle(url: string) {
  return request<ArticleDetail>(`/api/article?url=${encodeURIComponent(url)}`);
}

export type Sorting = 'by_vote' | 'newest' | 'oldest';

export interface CommentPage {
  list: Comment[];
  next: { lastParentId: number; offset: number } | null;
}

export function loadComments(payload: {
  postId: number;
  sorting: Sorting;
  offset: number;
  lastParentId: number;
}) {
  return request<CommentPage>('/api/comments/load', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function voteComment(payload: { commentId: number; voteType: number; postId: number }) {
  return request<{ votes: number }>('/api/comments/vote', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addComment(payload: {
  postId: number;
  author?: string;
  email?: string;
  content: string;
  wpdiscuzUniqueId?: string;
  depth?: number;
}) {
  return request<{ comment: Comment }>('/api/comments/add', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getUser() {
  return request<{ user: number }>('/api/user');
}

export function proxyUrl(url: string) {
  return `${API}/api/proxy?url=${encodeURIComponent(url)}`;
}

export function imageProxyUrl(url: string) {
  return `${API}/api/image?url=${encodeURIComponent(url)}`;
}