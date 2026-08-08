<template>
  <component :is="iconComp" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import * as Icons from "@ant-design/icons-vue";

const props = defineProps<{ type: string }>();

const ICON_MAP: Record<string, string> = {
  "zhuye1": "HomeOutlined",
  "luru": "FormOutlined",
  "jiansuo1": "SearchOutlined",
  "yonghuguanli": "UserOutlined",
  "shenggonganting-copy": "SafetyCertificateOutlined",
  "ditu": "EnvironmentOutlined"
};

const iconComp = computed(() => {
  const t = props.type || "";
  const mapped = ICON_MAP[t];
  if (mapped) return (Icons as Record<string, any>)[mapped] || Icons.QuestionCircleOutlined;
  const parts = t
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const name = parts.join("") + "Outlined";
  return (Icons as Record<string, any>)[name] || Icons.QuestionCircleOutlined;
});
</script>
