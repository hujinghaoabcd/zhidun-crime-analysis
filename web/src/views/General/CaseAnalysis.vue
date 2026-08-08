<template>
  <div class="case-analysis">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="时间">
        <a-select v-model:value="range" style="width: 140px" @change="onRangeChange">
          <a-select-option value="all">2000-2019 全部</a-select-option>
          <a-select-option value="1319">2013-2019</a-select-option>
          <a-select-option value="0012">2000-2012</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="类型">
        <a-select v-model:value="type" style="width: 130px" @change="onTypeChange" allowClear placeholder="全部">
          <a-select-option v-for="t in types" :key="t.type" :value="t.type">{{ t.type }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="省份">
        <a-select v-model:value="province" style="width: 130px" @change="onProvinceChange" allowClear placeholder="全国">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
    </a-form>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="地图当前显示全国犯罪热力分布，颜色越红表示发案越密集"
    />

    <a-row :gutter="12">
      <a-col :span="12">
        <a-card size="small" title="24 小时发案分布" :bordered="false">
          <Chart :option="hourOption" style="height: 180px" />
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" title="星期发案分布" :bordered="false">
          <Chart :option="weekOption" style="height: 180px" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="12" style="margin-top: 12px">
      <a-col :span="24">
        <a-card size="small" title="年 × 月 时空热力（2012-2019）" :bordered="false">
          <Chart :option="monthHeatOption" style="height: 230px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="hint">
      分析发案时段规律与空间热力分布，帮助快速识别高发时段与高发区域。
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { useAppStore } from "@/store";

const RANGES: Record<string, { start: string; end: string }> = {
  all: { start: "2000-01-01", end: "2019-12-31" },
  "1319": { start: "2013-01-01", end: "2019-12-31" },
  "0012": { start: "2000-01-01", end: "2012-12-31" }
};
const WEEK = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default defineComponent({
  name: "CaseAnalysis",
  data() {
    return {
      range: "all",
      type: undefined as string | undefined,
      province: undefined as number | undefined,
      types: [] as any[],
      provinces: [] as any[],
      hourOption: {} as any,
      weekOption: {} as any,
      monthHeatOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("警情信息分析（全国）");
    Promise.all([api.provinces(), api.types()]).then(([ps, ts]) => {
      this.provinces = ps;
      this.types = ts;
      this.load();
    });
  },
  methods: {
    onRangeChange(val: string) {
      this.range = val;
      this.load();
    },
    onTypeChange(val: string | undefined) {
      this.type = val;
      this.load();
    },
    onProvinceChange(val: number | undefined) {
      this.province = val;
      this.load();
    },
    async load() {
      const { start, end } = RANGES[this.range] || RANGES.all;
      this.store.setMapConfig({
        mode: "heat",
        province: this.province || null,
        city: null,
        start,
        end,
        type: this.type || null,
        grid: this.province ? 0.08 : 0.5
      });
      try {
        const [overview, monthRows] = await Promise.all([
          api.overview(),
          api.trend({
            dimension: "month",
            start: "2012-01-01",
            end: "2019-12-31",
            type: this.type || ""
          })
        ]);
        this.buildHour(overview.byHour || []);
        this.buildWeek(overview.byWeekday || []);
        this.buildMonthHeat(monthRows);
      } catch (e) {
        console.error(e);
      }
    },
    buildHour(rows: any[]) {
      this.hourOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 32, right: 8, top: 20, bottom: 22 },
        xAxis: { type: "category", data: rows.map((r) => r.hour + "时"), axisLabel: { interval: 3, fontSize: 9 } },
        yAxis: { type: "value" },
        series: [
          {
            type: "bar",
            data: rows.map((r) => r.total),
            itemStyle: { color: "#fa8c16" },
            barWidth: "55%"
          }
        ]
      };
    },
    buildWeek(rows: any[]) {
      this.weekOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 32, right: 8, top: 20, bottom: 22 },
        xAxis: { type: "category", data: rows.map((r) => WEEK[(r.weekday - 1) % 7]) },
        yAxis: { type: "value" },
        series: [
          {
            type: "line",
            smooth: true,
            data: rows.map((r) => r.total),
            itemStyle: { color: "#13c2c2" },
            areaStyle: { opacity: 0.2 }
          }
        ]
      };
    },
    buildMonthHeat(rows: any[]) {
      const years = [...new Set(rows.map((r) => r.year))];
      const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const data = rows.map((r) => [months.indexOf(r.month), years.indexOf(r.year), r.total]);
      const max = Math.max(...data.map((d: any) => d[2]));
      this.monthHeatOption = {
        tooltip: {
          formatter: (p: any) => {
            if (!p.data || p.data.length < 3) return "";
            return `${years[p.data[1]]}年${months[p.data[0]]}月：${p.data[2]} 起`;
          }
        },
        grid: { left: 40, right: 10, top: 10, bottom: 60 },
        xAxis: {
          type: "category",
          data: months.map((m) => m + "月"),
          splitArea: { show: true },
          axisLabel: { fontSize: 9 }
        },
        yAxis: {
          type: "category",
          data: years,
          splitArea: { show: true },
          axisLabel: { fontSize: 9 }
        },
        visualMap: {
          min: 0,
          max,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          inRange: { color: ["#e8f5e9", "#ffeb3b", "#ff9800", "#d32f2f"] },
          textStyle: { fontSize: 10 }
        },
        series: [
          {
            type: "heatmap",
            data,
            label: { show: false }
          }
        ]
      };
    },
  },
  components: { Chart }
});
</script>

<style scoped>
.filter-bar {
  margin-bottom: 10px;
}
.hint {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f7f9fc;
  color: #666;
  font-size: 12px;
  line-height: 1.7;
}
</style>
