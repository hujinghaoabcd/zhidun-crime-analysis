<template>
  <a-config-provider :theme="themeConfig" :locale="zhCN">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from "ant-design-vue/es/locale/zh_CN";

const themeConfig = {
  token: {
    colorPrimary: "#1668dc",
    colorLink: "#1668dc",
    colorBgBase: "#ffffff",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#d9d9d9",
    colorBorderSecondary: "#f0f0f0",
    colorText: "rgba(0, 0, 0, 0.88)",
    colorTextSecondary: "rgba(0, 0, 0, 0.65)",
    borderRadius: 0
  }
};
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
.empty-tip {
  padding: 24px 0;
  text-align: center;
  color: #999;
  font-size: 13px;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: #c1c9d2;
  border-radius: 0;
}
::-webkit-scrollbar-track {
  background: #f0f2f5;
}
</style>
