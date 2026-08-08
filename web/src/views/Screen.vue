<template>
  <div class="screen">
    <header class="screen-header">
      <div class="screen-title">智盾 · 全国犯罪时空分析预警大屏</div>
      <div class="screen-datetime">{{ now }}</div>
      <button class="fs-btn" @click="toggleFullscreen">
        <a-icon :type="isFullscreen ? 'fullscreen-exit' : 'fullscreen'" />
      </button>
    </header>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-num">{{ overview.total || 0 }}</div>
        <div class="kpi-label">案件总量</div>
      </div>
      <div class="kpi">
        <div class="kpi-num">{{ overview.provinces || 0 }}</div>
        <div class="kpi-label">覆盖省份</div>
      </div>
      <div class="kpi">
        <div class="kpi-num">{{ overview.cities || 0 }}</div>
        <div class="kpi-label">覆盖地市</div>
      </div>
      <div class="kpi">
        <div class="kpi-num" style="color: #ffe066">{{ summary.totalForecast || 0 }}</div>
        <div class="kpi-label">下月预测</div>
      </div>
      <div class="kpi">
        <div class="kpi-num">
          <span style="color: #ff3b5c">{{ summary.redCount || 0 }}</span>
          <span style="color: #ff9f43; margin-left: 6px">{{ summary.orangeCount || 0 }}</span>
          <span style="color: #ffe066; margin-left: 6px">{{ summary.yellowCount || 0 }}</span>
        </div>
        <div class="kpi-label">红 / 橙 / 黄</div>
      </div>
    </div>

    <div class="screen-main">
      <div class="col left">
        <div class="panel p-tall">
          <div class="panel-title">高发省份 TOP 8</div>
          <Chart :option="provinceOption" style="height: 100%" />
        </div>
        <div class="panel p-tall">
          <div class="panel-title">案件类型分布</div>
          <Chart :option="typeOption" style="height: 100%" />
        </div>
        <div class="panel p-short">
          <div class="panel-title">24 小时发案分布</div>
          <Chart :option="hourOption" style="height: 100%" />
        </div>
      </div>

      <div class="col center">
        <div class="panel map-panel">
          <div class="panel-title">全国预警地图（四色）</div>
          <div class="map-body">
            <Chart :option="mapOption" style="height: 100%" />
          </div>
          <div class="map-legend-bar">
            <span v-for="l in mapLevels" :key="l.label" class="map-legend-item">
              <i :style="{ background: l.color }"></i>{{ l.label }} {{ l.count }}
            </span>
          </div>
        </div>
        <div class="panel p-year">
          <div class="panel-title">年度案件趋势</div>
          <Chart :option="yearOption" style="height: 100%" />
        </div>
      </div>

      <div class="col right">
        <div class="panel p-tall">
          <div class="panel-title">下月预警 TOP 8</div>
          <div class="scroll-body">
            <div v-for="(w, i) in warnings" :key="i" class="warn-row">
              <span class="warn-dot" :style="{ background: w.color }"></span>
              <span class="warn-name">{{ i + 1 }}. {{ w.name }}</span>
              <span class="warn-value">{{ w.value }}</span>
              <span class="warn-label">{{ w.label }}</span>
            </div>
          </div>
        </div>
        <div class="panel p-tall">
          <div class="panel-title">星期发案分布</div>
          <Chart :option="weekOption" style="height: 100%" />
        </div>
        <div class="panel p-short">
          <div class="panel-title">最新案件</div>
          <div class="case-marquee">
            <div class="case-track">
              <div v-for="(c, i) in marqueeCases" :key="i" class="case-row">
                <span class="case-date">{{ c.date }}</span>
                <span class="case-info">{{ c.city }} · {{ c.type }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="screen-footer">
      数据来源：中国裁判文书网公开判决文书（2000–2019）· 本系统为测试演示用途 · 不代表真实犯罪情况
    </footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import * as echarts from "echarts";
import api from "@/api";
import Chart from "@/components/Chart.vue";

const LEVEL_COLORS: Record<string, string> = {
  red: "rgba(255, 71, 87, 0.94)",
  orange: "rgba(255, 165, 80, 0.93)",
  yellow: "rgba(255, 226, 110, 0.93)",
  green: "rgba(0, 235, 140, 0.93)"
};

const LEVEL_GLOW: Record<string, string> = {
  red: "rgba(255, 59, 92, 0.55)",
  orange: "rgba(255, 159, 67, 0.5)",
  yellow: "rgba(255, 224, 102, 0.5)",
  green: "rgba(0, 255, 148, 0.55)"
};

const AXIS = {
  axisLine: { lineStyle: { color: "#2a4a73" } },
  axisLabel: { color: "#9cc0f5", fontSize: 10 },
  splitLine: { lineStyle: { color: "rgba(42,74,115,.35)" } }
};

export default defineComponent({
  name: "Screen",
  data() {
    return {
      now: "",
      timer: null as ReturnType<typeof setInterval> | null,
      refreshTimer: null as ReturnType<typeof setInterval> | null,
      isFullscreen: false,
      overview: {} as any,
      summary: {} as any,
      warnings: [] as any[],
      latestCases: [] as any[],
      provinceOption: {} as any,
      typeOption: {} as any,
      hourOption: {} as any,
      weekOption: {} as any,
      yearOption: {} as any,
      mapOption: {} as any,
      mapLevels: [] as any[]
    };
  },
  computed: {
    marqueeCases() {
      return [...this.latestCases, ...this.latestCases];
    }
  },
  mounted() {
    this.updateClock();
    this.timer = setInterval(this.updateClock, 1000);
    this.refreshTimer = setInterval(this.load, 30000);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    this.load();
  },
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  },
  methods: {
    onFullscreenChange() {
      this.isFullscreen = !!document.fullscreenElement;
    },
    toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    },
    updateClock() {
      const d = new Date();
      this.now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    },
    async load() {
      try {
        const [overview, pred, rankP, cases] = await Promise.all([
          api.overview(),
          api.predict({ level: "province", months: 1 }),
          api.rank({ by: "province", limit: 8 }),
          api.cases({ size: 6 })
        ]);
        this.overview = overview;
        this.summary = pred.summary || {};
        this.mapLevels = [
          { label: "红色", color: LEVEL_COLORS.red, count: this.summary.redCount || 0 },
          { label: "橙色", color: LEVEL_COLORS.orange, count: this.summary.orangeCount || 0 },
          { label: "黄色", color: LEVEL_COLORS.yellow, count: this.summary.yellowCount || 0 },
          { label: "正常", color: LEVEL_COLORS.green, count: this.summary.normalCount || 0 }
        ];
        this.warnings = (pred.items || [])
          .filter((x) => x.forecast[0].level !== "green")
          .sort((a, b) => b.forecast[0].value - a.forecast[0].value)
          .slice(0, 8)
          .map((x) => ({
            name: x.name,
            value: x.forecast[0].value,
            label: x.forecast[0].label,
            color: x.forecast[0].color
          }));
        this.latestCases = (cases.rows || []).slice(0, 6);
        this.buildProvince(rankP);
        this.buildType(overview.byType || []);
        this.buildHour(overview.byHour || []);
        this.buildWeek(overview.byWeekday || []);
        this.buildYear(overview.byYear || []);
        await this.buildMap(pred.items || []);
      } catch (e) {
        console.error(e);
      }
    },
    buildProvince(rows: any[]) {
      const data = [...rows].reverse();
      this.provinceOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 56, right: 20, top: 10, bottom: 24 },
        xAxis: { type: "value", ...AXIS },
        yAxis: { type: "category", data: data.map((x) => x.name), ...AXIS },
        series: [
          {
            type: "bar",
            barWidth: 10,
            data: data.map((x) => x.total),
            itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#1668dc" }, { offset: 1, color: "#4d9fff" }] } }
          }
        ]
      };
    },
    buildType(rows: any[]) {
      const sorted = [...rows].sort((a: any, b: any) => b.total - a.total);
      const top = sorted.slice(0, 5);
      const rest = sorted.slice(5);
      const restTotal = rest.reduce((s: number, x: any) => s + x.total, 0);
      const data = [...top];
      if (restTotal > 0) data.push({ type: `其他（${rest.length}类）`, total: restTotal });
      this.typeOption = {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: { bottom: 0, textStyle: { color: "#9cc0f5", fontSize: 10 } },
        series: [
          {
            type: "pie",
            radius: ["30%", "60%"],
            center: ["50%", "44%"],
            data: data.map((x, i) => ({
              name: x.type,
              value: x.total,
              itemStyle: { color: ["#1668dc", "#13c2c2", "#00b8ff", "#ffe066", "#ff9f43", "#722ed1"][i % 6] }
            }))
          }
        ]
      };
    },
    buildHour(rows: any[]) {
      this.hourOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 34, right: 10, top: 16, bottom: 22 },
        xAxis: { type: "category", data: rows.map((r) => r.hour + "h"), ...AXIS, axisLabel: { color: "#9cc0f5", fontSize: 9, interval: 3 } },
        yAxis: { type: "value", ...AXIS },
        series: [
          { type: "line", smooth: true, data: rows.map((r) => r.total), itemStyle: { color: "#13c2c2" }, areaStyle: { color: "rgba(19,194,194,.2)" } }
        ]
      };
    },
    buildWeek(rows: any[]) {
      const week = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
      this.weekOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 34, right: 10, top: 16, bottom: 22 },
        xAxis: { type: "category", data: rows.map((r) => week[(r.weekday - 1) % 7]), ...AXIS },
        yAxis: { type: "value", ...AXIS },
        series: [{ type: "bar", data: rows.map((r) => r.total), itemStyle: { color: "#ffe066" }, barWidth: "50%" }]
      };
    },
    buildYear(rows: any[]) {
      this.yearOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 40, right: 10, top: 16, bottom: 22 },
        xAxis: { type: "category", data: rows.map((r) => r.year), ...AXIS, axisLabel: { color: "#9cc0f5", fontSize: 9, interval: 2 } },
        yAxis: { type: "value", ...AXIS },
        series: [
          { type: "line", smooth: true, data: rows.map((r) => r.total), itemStyle: { color: "#4d9fff" }, areaStyle: { color: "rgba(77,159,255,.18)" } }
        ]
      };
    },
    async buildMap(items: any[]) {
      const res = await fetch("/geojson/china_provinces.json");
      const geo = await res.json();
      echarts.registerMap("china", geo);
      const byId = new Map(items.map((x) => [x.id, x]));
      const LEVEL_CODE: Record<string, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
      const LEVEL_LABEL: Record<string, string> = { green: "正常", yellow: "黄色预警", orange: "橙色预警", red: "红色预警" };
      const data = geo.features.map((f: any) => {
        const item = byId.get(f.properties.adcode);
        const lv = item ? item.forecast[0].level : "green";
        return {
          adcode: f.properties.adcode,
          name: f.properties.name,
          value: LEVEL_CODE[lv] ?? 0,
          level: lv,
          num: item ? item.forecast[0].value : 0,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: LEVEL_GLOW[lv]
          }
        };
      });
      this.mapOption = {
        tooltip: {
          formatter: (p: any) => {
            const d = p.data || {};
            return `${p.name}：${LEVEL_LABEL[d.level] || "无数据"}（${d.num || 0} 起）`;
          }
        },
        visualMap: {
          type: "piecewise",
          show: false,
          pieces: [
            { value: 0, color: LEVEL_COLORS.green },
            { value: 1, color: LEVEL_COLORS.yellow },
            { value: 2, color: LEVEL_COLORS.orange },
            { value: 3, color: LEVEL_COLORS.red }
          ]
        },
        series: [
          {
            type: "map",
            map: "china",
            roam: true,
            zoom: 1.03,
            center: [104.7, 27.9],
            label: { show: true, color: "#ffffff", fontSize: 9 },
            itemStyle: { borderColor: "#2a4a73", borderWidth: 1, shadowBlur: 8, shadowColor: "rgba(0,0,0,.35)" },
            emphasis: { label: { color: "#fff", fontSize: 11 }, itemStyle: { shadowBlur: 14, shadowColor: "rgba(77,159,255,.7)" } },
            data
          }
        ]
      };
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.screen {
  height: 100vh;
  background: radial-gradient(circle at 50% 0%, #0f2a4a, #081420 65%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #d5e4f5;
  position: relative;
}
.screen::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 3px);
}
.screen-header {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-bottom: 2px solid rgba(77, 159, 255, 0.7);
  background: linear-gradient(90deg, rgba(13, 42, 82, 0.95), rgba(8, 20, 36, 0.98));
  box-shadow: 0 0 24px rgba(22, 104, 220, 0.35);
}
.screen-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 5px;
  color: #fff;
  text-shadow: 0 0 22px rgba(77, 159, 255, 0.9), 0 0 60px rgba(77, 159, 255, 0.4);
}
.screen-datetime {
  position: absolute;
  right: 76px;
  color: #9cc0f5;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.fs-btn {
  position: absolute;
  right: 24px;
  top: 13px;
  background: rgba(22, 104, 220, 0.35);
  border: 1px solid rgba(77, 159, 255, 0.6);
  color: #fff;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 15px;
}
.fs-btn:hover {
  background: rgba(22, 104, 220, 0.6);
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 10px 16px 0;
}
.kpi {
  background: linear-gradient(180deg, rgba(16, 48, 88, 0.9), rgba(10, 28, 52, 0.95));
  border: 1px solid rgba(77, 159, 255, 0.45);
  text-align: center;
  padding: 10px 4px;
  position: relative;
}
.kpi::before,
.kpi::after,
.panel::before,
.panel::after {
  content: "";
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: #4d9fff;
  border-style: solid;
}
.kpi::before {
  left: -1px;
  top: -1px;
  border-width: 2px 0 0 2px;
}
.kpi::after {
  right: -1px;
  bottom: -1px;
  border-width: 0 2px 2px 0;
}
.kpi-num {
  font-size: 22px;
  font-weight: 700;
  color: #4d9fff;
  text-shadow: 0 0 12px rgba(77, 159, 255, 0.6);
}
.kpi-label {
  color: #9cc0f5;
  font-size: 12px;
  margin-top: 4px;
}
.screen-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.25fr 1fr;
  gap: 10px;
  padding: 10px 16px;
  min-height: 0;
  overflow: hidden;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(13, 39, 68, 0.92), rgba(8, 22, 40, 0.95));
  border: 1px solid rgba(42, 74, 115, 0.8);
  padding: 9px 10px 10px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.panel::before {
  left: -1px;
  top: -1px;
  border-width: 2px 0 0 2px;
}
.panel::after {
  right: -1px;
  bottom: -1px;
  border-width: 0 2px 2px 0;
}
.panel-title {
  color: #7fd7ff;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  padding-left: 8px;
  border-left: 3px solid #4d9fff;
  text-shadow: 0 0 8px rgba(77, 159, 255, 0.5);
  flex-shrink: 0;
}
.left .p-tall,
.right .p-tall {
  flex: 2.4;
  min-height: 0;
}
.left .p-short,
.right .p-short {
  flex: 1.2;
  min-height: 0;
}
.center {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.map-panel {
  flex: 4;
  min-height: 0;
}
.p-year {
  flex: 1;
  min-height: 0;
}
.screen-main .chart {
  flex: 1;
  min-height: 0;
}
.map-body {
  flex: 1;
  min-height: 0;
}
.map-body .chart {
  height: 100%;
}
.map-legend-bar {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 5px;
  flex-shrink: 0;
}
.map-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #b9d4f5;
}
.map-legend-item i {
  width: 10px;
  height: 10px;
  display: inline-block;
}
.scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.warn-row {
  display: flex;
  align-items: center;
  padding: 7px 2px;
  border-bottom: 1px dashed rgba(42, 74, 115, 0.6);
  font-size: 13px;
}
.warn-row:last-child {
  border-bottom: none;
}
.warn-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 8px;
}
.warn-name {
  flex: 1;
}
.warn-value {
  margin-right: 8px;
  font-weight: 600;
}
.warn-label {
  color: #7a93ad;
  font-size: 12px;
}
.case-marquee {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.case-track {
  animation: scrollUp 14s linear infinite;
}
.case-marquee:hover .case-track {
  animation-play-state: paused;
}
.case-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 2px;
  border-bottom: 1px dashed rgba(42, 74, 115, 0.6);
  font-size: 12px;
  color: #b9d4f5;
}
.case-date {
  color: #7a93ad;
}
.screen-footer {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6f8db0;
  font-size: 12px;
  border-top: 1px solid rgba(42, 74, 115, 0.6);
}
@keyframes scrollUp {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}
</style>
