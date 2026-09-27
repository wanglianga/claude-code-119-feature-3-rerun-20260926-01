<template>
  <div class="layout">
    <aside>
      <div class="logo">🎬 露天电影平台</div>
      <nav>
        <router-link to="/screenings">📋 放映场次</router-link>
        <router-link v-if="canApply" to="/screenings/new">➕ 提交放映申请</router-link>
        <router-link v-if="roles.includes('warehouse')" to="/equipment">📦 设备库存/成套</router-link>
        <router-link v-if="roles.includes('security') || roles.includes('site_manager')" to="/incidents">🚨 异常协同</router-link>
        <router-link v-if="roles.includes('street') || roles.includes('reviewer')" to="/incidents">🚨 异常工单</router-link>
        <router-link v-if="roles.includes('street')" to="/noise-reviews">🔇 噪声投诉复盘</router-link>
        <router-link v-if="roles.includes('street')" to="/venues">📍 场地与黑名单</router-link>
        <router-link v-if="roles.includes('street') || roles.includes('finance')" to="/organizers">⭐ 主办方信用/押金</router-link>
        <router-link v-if="roles.includes('street')" to="/dashboard">📊 街道看板</router-link>
      </nav>
    </aside>
    <main>
      <header>
        <div>
          <b>{{ user?.name }}</b>
          <span class="role-tag">{{ roleName(user?.role) }}</span>
          <span class="muted">{{ user?.organization }}</span>
        </div>
        <button @click="logout">退出登录</button>
      </header>
      <div class="content"><router-view /></div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { currentUser, clearSession, ROLE_NAME } from '../api';

const router = useRouter();
const user = computed(() => currentUser());
const roles = computed(() => [user.value?.role]);
const canApply = computed(() => ['applicant', 'street'].includes(user.value?.role || ''));
function roleName(r?: string) { return ROLE_NAME[r || ''] || r; }
function logout() { clearSession(); router.push('/login'); }
</script>

<style scoped>
.layout { display: flex; min-height: 100vh; }
aside {
  width: 220px; background: #13294b; color: #cbd5e1;
  display: flex; flex-direction: column; flex-shrink: 0;
}
.logo { color: #fff; font-size: 17px; font-weight: 700; padding: 20px 18px; border-bottom: 1px solid #243c63; }
nav { display: flex; flex-direction: column; padding: 10px 0; }
nav a {
  color: #cbd5e1; padding: 11px 20px; font-size: 14px;
  border-left: 3px solid transparent;
}
nav a:hover { background: #1b3760; color: #fff; }
nav a.router-link-active { background: #1f5fbf; color: #fff; border-left-color: #7db4ff; }
main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
header {
  background: #fff; border-bottom: 1px solid var(--border);
  padding: 12px 22px; display: flex; justify-content: space-between; align-items: center;
}
.role-tag {
  background: #eaf1fc; color: #1f5fbf; border-radius: 6px;
  font-size: 12px; padding: 2px 9px; margin: 0 10px;
}
.content { padding: 20px 22px; max-width: 1280px; width: 100%; }
</style>
