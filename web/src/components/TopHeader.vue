<template>
  <a-layout-header class="top-header">
    <div class="brand" @click="goHome">
      <a-icon type="shenggonganting-copy" class="brand-icon" />
      <div class="brand-text">
        <div class="brand-name">智盾 · 全国犯罪时空分析预警系统</div>
      </div>
    </div>
    <a-menu theme="dark" mode="horizontal" class="top-menu" :selectedKeys="selectedKeys">
      <a-menu-item key="home" @click="go('/home/homeData')">
        <a-icon type="zhuye1" />首页
      </a-menu-item>
      <a-menu-item key="input" @click="go('/home/caseInput')">
        <a-icon type="luru" />案情录入
      </a-menu-item>
      <a-menu-item key="search" @click="go('/home/caseSearch')">
        <a-icon type="jiansuo1" />案情检索
      </a-menu-item>
      <a-menu-item key="map" @click="go('/general/DataStatistics')">
        <a-icon type="ditu" />全国地图
      </a-menu-item>
      <a-menu-item key="screen" @click="go('/screen')">
        <a-icon type="fund" />可视化大屏
      </a-menu-item>
    </a-menu>
    <div class="user-chip">
      <a-icon type="user" />
      <span>{{ store.user.name }}</span>
    </div>
  </a-layout-header>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppStore } from "@/store";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const selectedKeys = ref<string[]>([]);

watch(
  () => route.path,
  (p) => {
    if (p.startsWith("/home/caseInput")) selectedKeys.value = ["input"];
    else if (p.startsWith("/home/caseSearch")) selectedKeys.value = ["search"];
    else if (p.startsWith("/general")) selectedKeys.value = ["map"];
    else if (p.startsWith("/screen")) selectedKeys.value = ["screen"];
    else if (p.startsWith("/home")) selectedKeys.value = ["home"];
    else selectedKeys.value = [];
  },
  { immediate: true }
);

function goHome() {
  go("/home/homeData");
}

function go(path: string) {
  store.setShowSlide(false);
  router.push({ path });
}
</script>

<style scoped>
.top-header {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 64px;
  padding: 0 24px;
  background: linear-gradient(90deg, #0b2a5b 0%, #1450a8 100%);
  overflow: hidden;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
  flex-shrink: 0;
}
.brand-icon {
  font-size: 38px;
  color: #7fb2ff;
}
.brand-text {
  line-height: 1.2;
  white-space: nowrap;
}
.brand-name {
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1px;
}
.top-menu {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
  background: transparent;
  border-bottom: none;
}
.top-menu :deep(.ant-menu-item) {
  color: #cfe0ff;
}
.top-menu :deep(.ant-menu-item-selected) {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #cfe0ff;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
