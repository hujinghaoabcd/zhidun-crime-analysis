<template>
  <a-layout class="home-layout">
    <TopHeader />
    <a-layout>
      <a-layout-sider :theme="theme" :trigger="null" collapsible width="236px" class="sider">
        <SiderMenu :theme="theme" />
      </a-layout-sider>
      <a-layout>
        <a-layout-content class="content">
          <router-view />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import SiderMenu from "./SiderMenu.vue";
import TopHeader from "@/components/TopHeader.vue";
import { useAppStore } from "@/store";

const router = useRouter();
const store = useAppStore();
const theme = computed(() => (router.currentRoute.value.query.navTheme as string) || "light");

</script>

<style scoped>
.home-layout {
  height: 100%;
}
.sider {
  box-shadow: 2px 0 6px rgba(0, 21, 41, 0.35);
  background: #fff;
}
.content {
  background: #f5f7fa;
  min-height: calc(100vh - 64px);
  overflow: auto;
}
</style>
