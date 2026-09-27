import { createRouter, createWebHistory } from 'vue-router';
import { currentUser } from './api';

const routes = [
  { path: '/login', component: () => import('./views/Login.vue') },
  { path: '/', component: () => import('./views/Layout.vue'), children: [
    { path: '', redirect: '/screenings' },
    { path: 'screenings', component: () => import('./views/ScreeningList.vue') },
    { path: 'screenings/new', component: () => import('./views/ScreeningForm.vue') },
    { path: 'screenings/:id', component: () => import('./views/ScreeningDetail.vue') },
    { path: 'equipment', component: () => import('./views/Equipment.vue') },
    { path: 'venues', component: () => import('./views/Venues.vue') },
    { path: 'organizers', component: () => import('./views/Organizers.vue') },
    { path: 'incidents', component: () => import('./views/IncidentList.vue') },
    { path: 'noise-reviews', component: () => import('./views/NoiseReviews.vue') },
    { path: 'dashboard', component: () => import('./views/Dashboard.vue') },
  ] },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !currentUser()) return '/login';
  return true;
});
