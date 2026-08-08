<template>
  <div class="sider-menu">
    <a-menu
      v-model:selectedKeys="selectedKeys"
      v-model:openKeys="openKeys"
      mode="inline"
      theme="light"
      :inline-collapsed="collapsed"
      :default-open-keys="['/predict']"
    >
      <template v-for="item in menuData">
        <a-menu-item v-if="!item.children" :key="item.path" @click="go(item)">
          <a-icon v-if="item.meta && item.meta.icon" :type="item.meta.icon" />
          <span>{{ item.meta && item.meta.title }}</span>
        </a-menu-item>
        <a-sub-menu v-else :key="item.path">
          <template #title>
            <a-icon v-if="item.meta && item.meta.icon" :type="item.meta.icon" />
            <span>{{ item.meta && item.meta.title }}</span>
          </template>
          <a-menu-item v-for="child in item.children" :key="child.path" @click="go(child)">
            <span>{{ child.meta && child.meta.title }}</span>
          </a-menu-item>
        </a-sub-menu>
      </template>
    </a-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter, type RouteRecordRaw } from "vue-router";
import { useAppStore } from "@/store";

const route = useRoute();
const router = useRouter();
const store = useAppStore();

defineProps<{ collapsed?: boolean }>();

interface MenuItem {
  path: string;
  name?: string;
  meta?: { title?: string; icon?: string };
  children?: MenuItem[];
}

function getMenuData(
  routes: readonly RouteRecordRaw[],
  parentKeys: string[] = [],
  selectedKey?: string
): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of routes) {
    const rec = item as RouteRecordRaw & { hideInMenu?: boolean; hideChildrenInMenu?: boolean };
    if (rec.name && !rec.hideInMenu) {
      const newItem: MenuItem = {
        path: rec.path,
        name: rec.name as string,
        meta: rec.meta as MenuItem["meta"]
      };
      if (rec.children && !rec.hideChildrenInMenu) {
        newItem.children = getMenuData(rec.children, [...parentKeys, rec.path]);
      }
      result.push(newItem);
    } else if (!rec.hideInMenu && !rec.hideChildrenInMenu && rec.children) {
      result.push(...getMenuData(rec.children, [...parentKeys, rec.path], selectedKey));
    }
  }
  return result;
}

const routes = router.options.routes;
const menuData = getMenuData(routes);
const selectedKeys = ref<string[]>([route.path]);
const openKeys = ref<string[]>([]);

watch(
  () => route.path,
  (p) => {
    selectedKeys.value = [p];
    const parent = menuData.find((m) => m.children?.some((c) => c.path === p));
    if (parent) openKeys.value = [parent.path];
  },
  { immediate: true }
);

function go(item: MenuItem) {
  store.setShowSlide(true);
  router.push({ path: item.path });
}
</script>

<style scoped>
.sider-menu {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: #fff;
}
.sider-menu :deep(.ant-menu) {
  background: transparent;
  border-right: none;
  font-size: 14px;
}
.sider-menu :deep(.ant-menu-item),
.sider-menu :deep(.ant-menu-submenu-title) {
  height: 44px;
  line-height: 44px;
  margin: 4px 8px;
  border-radius: 0;
  color: rgba(0, 0, 0, 0.75);
  font-size: 14px;
  letter-spacing: 0.5px;
}
.sider-menu :deep(.ant-menu-item .anticon),
.sider-menu :deep(.ant-menu-submenu-title .anticon) {
  color: #1668dc;
  font-size: 16px;
}
.sider-menu :deep(.ant-menu-item:hover),
.sider-menu :deep(.ant-menu-submenu-title:hover) {
  color: #1668dc;
  background: rgba(22, 104, 220, 0.06);
}
.sider-menu :deep(.ant-menu-item-selected) {
  color: #1668dc;
  font-weight: 600;
  background: rgba(22, 104, 220, 0.12);
  border-right: 3px solid #1668dc;
}
.sider-menu :deep(.ant-menu-item-selected .anticon) {
  color: #1668dc;
}
.sider-menu :deep(.ant-menu-sub) {
  background: #f7f9fc;
  border-radius: 0;
}
.sider-menu :deep(.ant-menu-sub .ant-menu-item) {
  padding-left: 48px !important;
  font-size: 13px;
}
.sider-menu::-webkit-scrollbar {
  width: 6px;
}
.sider-menu::-webkit-scrollbar-thumb {
  background: #d9dee5;
  border-radius: 0;
}
</style>
