import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/list', name: 'list', component: () => import('./views/ListView.vue') },
  { path: '/post/:id?', name: 'post', component: () => import('./views/DetailView.vue') },
  { path: '/web', name: 'web', component: () => import('./views/WebViewPage.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});