<template>
  <a-layout class="basic-layout">
    <TopHeader />
    <a-layout>
      <a-layout-sider
        :theme="theme"
        :trigger="null"
        collapsible
        :collapsed="store.siderCollapsed"
        :collapsed-width="64"
        width="236px"
        class="sider"
      >
        <SiderMenu :theme="theme" :collapsed="store.siderCollapsed" />
        <div
          class="sider-collapse-btn"
          :class="{ collapsed: store.siderCollapsed }"
          @click="store.toggleSider()"
          :title="store.siderCollapsed ? '展开菜单' : '收起菜单'"
        >
          <a-icon :type="store.siderCollapsed ? 'menu-unfold' : 'menu-fold'" />
        </div>
      </a-layout-sider>
      <a-layout>
        <a-layout-content class="content">
          <MapView />
          <div class="panel-wrap" v-show="store.showSlide">
            <a-card class="panel-card" :title="store.cardTitle" :bordered="true">
              <div class="panel-collapse-btn" @click="togglePanel">
                <a-icon type="double-left" />
              </div>
              <router-view />
            </a-card>
          </div>
          <div class="panel-expand-btn" v-show="!store.showSlide" @click="togglePanel" :style="{ left: store.siderCollapsed ? '80px' : '252px' }">
            <a-icon type="double-right" />
          </div>
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import SiderMenu from "./SiderMenu.vue";
import MapView from "@/components/MapView.vue";
import TopHeader from "@/components/TopHeader.vue";
import { useAppStore } from "@/store";

const store = useAppStore();
const router = useRouter();
const theme = computed(() => (router.currentRoute.value.query.navTheme as string) || "light");

onMounted(() => {
  // 进入地图页面时确保功能面板显示（查看单案定位时保持全屏底图）
  if (!store.mapConfig.data || !store.mapConfig.data.focusCase) {
    store.setShowSlide(true);
  }
});

function togglePanel() {
  store.setShowSlide(!store.showSlide);
}

</script>

<style scoped>
.basic-layout {
  height: 100%;
}
.sider {
  box-shadow: 2px 0 6px rgba(0, 21, 41, 0.35);
  background: #fff;
  display: flex;
  flex-direction: column;
}
.sider-collapse-btn {
  position: relative;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1668dc;
  font-size: 18px;
  cursor: pointer;
  background: linear-gradient(180deg, #f8fafd, #edf1f8);
  border-top: 1px solid #e0e7f1;
  transition: all 0.2s;
  flex-shrink: 0;
}
.sider-collapse-btn::before,
.sider-collapse-btn::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 42px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(22, 104, 220, 0.4));
  pointer-events: none;
}
.sider-collapse-btn::before {
  left: 14px;
}
.sider-collapse-btn::after {
  right: 14px;
  transform: scaleX(-1);
}
.sider-collapse-btn.collapsed::before,
.sider-collapse-btn.collapsed::after {
  display: none;
}
.sider-collapse-btn:hover {
  background: rgba(22, 104, 220, 0.1);
}
.sider :deep(.sider-menu) {
  height: calc(100% - 48px);
}
.content {
  position: relative;
  margin: 0;
  min-height: 280px;
  background: #fff;
}
.panel-wrap {
  position: absolute;
  top: 12px;
  left: 12px;
  bottom: 12px;
  z-index: 950;
  pointer-events: none;
}
.panel-card {
  width: min(800px, calc(100vw - 260px));
  height: 100%;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  border-radius: 0;
  pointer-events: auto;
  overflow: auto;
  position: relative;
}
.panel-card :deep(.ant-card-body) {
  padding: 16px;
}
.panel-collapse-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  width: 28px;
  height: 28px;
  border-radius: 0;
  background: #1677ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  font-size: 13px;
  pointer-events: auto;
  transition: all 0.2s;
}
.panel-collapse-btn:hover {
  background: #0958d9;
  transform: scale(1.06);
}
.panel-expand-btn {
  position: fixed;
  top: 72px;
  z-index: 2000;
  width: 32px;
  height: 32px;
  border-radius: 0;
  background: #1677ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.panel-expand-btn:hover {
  background: #0958d9;
  transform: scale(1.06);
}
</style>
