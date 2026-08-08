<template>
  <div ref="el" class="chart"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";

const props = defineProps<{ option: echarts.EChartsOption }>();

const el = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (!el.value) return;
  chart = echarts.init(el.value);
  chart.setOption(props.option);
  ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el.value);
});

watch(
  () => props.option,
  (val) => {
    chart?.setOption(val);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  ro?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
  min-height: 120px;
}
</style>
