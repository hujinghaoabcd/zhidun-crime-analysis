<template>
  <div class="workplanet" style="padding: 16px 20px">
    <a-alert
      type="warning"
      show-icon
      banner
      style="margin-bottom: 16px"
      :message="disclaimer"
    />
    <a-card style="margin-bottom: 16px" :bordered="false">
      <div class="hello">
        <a-avatar :size="56" style="background: #1677ff; font-size: 24px">
          {{ user.name.slice(0, 1) }}
        </a-avatar>
        <div class="hello-text">
          <h2 style="margin: 0">{{ greeting }}！{{ user.name }}</h2>
          <div class="hello-meta">{{ todayText }} ｜ 数据更新：{{ dataUpdated }}</div>
        </div>
        <a-tag color="blue" style="margin-left: auto">{{ metaLabel }}</a-tag>
      </div>
    </a-card>

    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">{{ overview.total || 0 }}</div>
          <div class="kpi-label">全国案件总量</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">{{ overview.provinces || 0 }}</div>
          <div class="kpi-label">覆盖省份</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">{{ overview.cities || 0 }}</div>
          <div class="kpi-label">覆盖地市</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num" :style="{ color: changeColor }">{{ changeText }}</div>
          <div class="kpi-label">下月预测变化</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="16">
      <a-col :span="16">
        <a-card title="全国年度发案趋势" size="small" :bordered="false" style="margin-bottom: 16px" :loading="loading">
          <Chart :option="yearOption" style="height: 260px" />
        </a-card>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-card title="高发省份 TOP 8" size="small" :bordered="false" :loading="loading">
              <Chart :option="provinceOption" style="height: 260px" />
            </a-card>
          </a-col>
          <a-col :span="12">
            <a-card title="高发地市 TOP 8" size="small" :bordered="false" :loading="loading">
              <Chart :option="cityOption" style="height: 260px" />
            </a-card>
          </a-col>
        </a-row>
      </a-col>
      <a-col :span="8">
        <a-card title="案件类型分布" size="small" :bordered="false" style="margin-bottom: 16px" :loading="loading">
          <Chart :option="typeOption" style="height: 260px" />
        </a-card>
        <a-card
          title="下月预警速览（点击查看预测）"
          size="small"
          :bordered="false"
          :loading="loading"
          style="height: 321px"
        >
          <div v-for="(w, i) in warnings" :key="i" class="warn-row warn-clickable" @click="goWarn(w)">
            <span class="warn-dot" :style="{ background: w.color }"></span>
            <span class="warn-name">{{ w.name }}</span>
            <span class="warn-value">{{ w.value }} 起</span>
            <span class="warn-label">{{ w.label }}</span>
          </div>
          <div v-if="!warnings.length" class="empty-tip">暂无预警</div>
        </a-card>
      </a-col>
    </a-row>

    <a-card
      title="预测预警算法说明"
      size="small"
      :bordered="false"
      :loading="loading"
      style="margin-top: 16px"
    >
      <a-row :gutter="32">
        <a-col :span="12">
          <div class="algo-title">数据说明</div>
          <div class="algo-row">
            <span class="algo-label">数据来源</span>
            <span>中国裁判文书网公开判决文书（LLM 提取整理，Scientific Data 2025）</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">时间范围</span>
            <span>{{ metaYears }}</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">样本规模</span>
            <span>{{ metaRecords }} 条（演示抽样 {{ sampleSize }} 条）</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">覆盖范围</span>
            <span>{{ metaProvinces }} 省 / {{ metaCities }} 地市</span>
          </div>
        </a-col>
        <a-col :span="12">
          <div class="algo-title">算法说明</div>
          <div class="algo-row">
            <span class="algo-label">模型方法</span>
            <span>{{ pred.model || "STL 季节分解 + 趋势外推 + 空间邻域平滑" }}</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">预测粒度</span>
            <span>省级按月预测 / 地市级按年预测</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">回测精度</span>
            <span>{{ qualityText }}</span>
          </div>
          <div class="algo-row">
            <span class="algo-label">预测起始</span>
            <span>{{ pred.forecastFrom || "--" }}</span>
          </div>
        </a-col>
      </a-row>
      <div class="algo-levels">
        预警分级：红色（高位异常/快速增长）＞ 橙色（明显上升）＞ 黄色（关注）＞ 绿色（正常），并叠加趋势方向修正。
      </div>
      <div class="algo-note">说明：本系统为测试演示用途，算法与数据仅用于功能验证，不代表真实犯罪情况。</div>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "WorkPlanet",
  data() {
    return {
      overview: {} as any,
      meta: {} as any,
      yearOption: {} as any,
      typeOption: {} as any,
      provinceOption: {} as any,
      cityOption: {} as any,
      warnings: [] as any[],
      loading: true,
      nowText: "",
      timer: null as ReturnType<typeof setInterval> | null,
      disclaimer: "本系统为测试演示用途，数据仅用于功能验证，不代表真实犯罪情况。",
      pred: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {
    user() {
      return this.store.user;
    },
    greeting() {
      const h = new Date().getHours();
      return h < 6 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
    },
    todayText() {
      return this.nowText;
    },
    dataUpdated() {
      const m = this.meta && this.meta.data;
      return m && m.generatedAt ? m.generatedAt.slice(0, 10) : "--";
    },
    metaYears() {
      const y = this.meta && this.meta.data && this.meta.data.years;
      return y && y.length === 2 ? `${y[0]} - ${y[1]}` : "--";
    },
    metaRecords() {
      const r = this.meta && this.meta.data && this.meta.data.records;
      return r ? r.toLocaleString() : "--";
    },
    sampleSize() {
      return "120,000";
    },
    metaProvinces() {
      const p = this.meta && this.meta.data && this.meta.data.provinces;
      return p || "--";
    },
    metaCities() {
      const c = this.meta && this.meta.data && this.meta.data.cities;
      return c || "--";
    },
    qualityText() {
      const q = this.pred && this.pred.quality;
      if (!q || q.accuracy === null || q.accuracy === undefined) return "--";
      return `2018 年滚动回测精度约 ${q.accuracy}%（MAPE ${q.mape}%）`;
    },
    metaLabel() {
      const m = this.meta && this.meta.data;
      return m ? (m.source === "placeholder" ? "模拟数据" : "来自裁判文书网") : "加载中";
    },
    changeText() {
      const f = this.overview.forecast || {};
      return f.changePct === undefined ? "--" : `${f.changePct >= 0 ? "+" : ""}${f.changePct}%`;
    },
    changeColor() {
      const f = this.overview.forecast || {};
      return f.changePct > 5 ? "#d4380d" : f.changePct < -5 ? "#52c41a" : "#fa8c16";
    }
  },
  mounted() {
    this.store.setShowSlide(false);
    this.updateClock();
    this.timer = setInterval(this.updateClock, 30000);
    this.load();
  },
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    updateClock() {
      const d = new Date();
      this.nowText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${"日一二三四五六"[d.getDay()]}`;
    },
    go(path: string) {
      this.store.setShowSlide(false);
      this.$router.push({ path });
    },
    async load() {
      this.loading = true;
      try {
        const [overview, meta, pred] = await Promise.all([
          api.overview(),
          api.meta(),
          api.predict({ level: "province", months: 1 })
        ]);
        this.overview = overview;
        this.meta = meta;
        this.pred = pred;
        this.buildYear(overview.byYear || []);
        this.buildType(overview.byType || []);
        this.buildRank(overview.topProvinces || [], true);
        this.buildRank(overview.topCities || [], false);
        this.warnings = (pred.items || [])
          .filter((x) => x.forecast[0].level !== "green")
          .sort(
            (a, b) =>
              (a.forecast[0].level === "red" ? 1 : 0) - (b.forecast[0].level === "red" ? 1 : 0) ||
              b.forecast[0].value - a.forecast[0].value
          )
          .slice(0, 8)
          .map((x) => ({
            id: x.id,
            name: x.name,
            value: x.forecast[0].value,
            label: x.forecast[0].label,
            color: x.forecast[0].color
          }));
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },
    goWarn(w: any) {
      this.$router.push({ path: "/predict", query: { region: w.id } });
    },
    buildYear(rows: { year: number; total: number }[]) {
      this.yearOption = {
        tooltip: {
          trigger: "axis",
          formatter: (p: any) => {
            const item = p && p[0];
            if (!item) return "";
            const total = this.overview.total || 1;
            return `${item.axisValue}年：${item.value.toLocaleString()} 起（占总量 ${((item.value / total) * 100).toFixed(1)}%）`;
          }
        },
        grid: { left: 44, right: 14, top: 20, bottom: 28 },
        xAxis: { type: "category", data: rows.map((r) => r.year) },
        yAxis: { type: "value" },
        series: [
          {
            name: "案件数",
            type: "bar",
            data: rows.map((r) => r.total),
            itemStyle: {
              color: (p: any) => (p.dataIndex >= rows.length - 2 ? "#fa8c16" : "#1677ff")
            },
            barWidth: "55%"
          }
        ]
      };
    },
    buildType(rows: { type: string; total: number }[]) {
      const data = this.topTypes(rows);
      this.typeOption = {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: { bottom: 0, textStyle: { fontSize: 10 } },
        series: [
          {
            type: "pie",
            radius: ["32%", "62%"],
            center: ["50%", "44%"],
            data: data.map((x, i) => ({
              name: x.type,
              value: x.total,
              itemStyle: { color: ["#1677ff", "#13c2c2", "#52c41a", "#faad14", "#fa8c16", "#eb2f96", "#722ed1"][i % 7] }
            }))
          }
        ]
      };
    },
    topTypes(rows: { type: string; total: number }[], n = 5) {
      const sorted = [...rows].sort((a, b) => b.total - a.total);
      const top = sorted.slice(0, n);
      const rest = sorted.slice(n);
      const restTotal = rest.reduce((s, x) => s + x.total, 0);
      const result = [...top];
      if (restTotal > 0) result.push({ type: `其他（${rest.length}类）`, total: restTotal });
      return result;
    },
    buildRank(rows: any[], isProvince: boolean) {
      const data = [...rows].reverse();
      const opt = {
        tooltip: { trigger: "axis" },
        grid: { left: 56, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 12,
            data: data.map((x) => x.total),
            itemStyle: { color: isProvince ? "#1677ff" : "#13c2c2" },
            label: {
              show: true,
              position: "right",
              fontSize: 10,
              formatter: (p: any) => {
                const total = this.overview.total || 1;
                return `${((p.value / total) * 100).toFixed(1)}%`;
              }
            }
          }
        ]
      };
      if (isProvince) this.provinceOption = opt;
      else this.cityOption = opt;
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.hello {
  display: flex;
  align-items: center;
}
.hello-text {
  margin-left: 16px;
}
.hello-meta {
  color: #999;
  font-size: 12px;
  margin-top: 4px;
}
.kpi {
  background: linear-gradient(135deg, #f0f5ff, #fff);
  border: 1px solid #e8e8e8;
  border-radius: 0;
  text-align: center;
  padding: 18px 8px;
}
.kpi-num {
  font-size: 26px;
  font-weight: 700;
  color: #1677ff;
}
.kpi-label {
  color: #666;
  font-size: 13px;
  margin-top: 4px;
}
.warn-row {
  display: flex;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 12px;
  line-height: 20px;
}
.warn-row:last-child {
  border-bottom: none;
}
.warn-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}
.warn-name {
  flex: 1;
}
.warn-clickable {
  cursor: pointer;
}
.warn-clickable:hover {
  background: #f0f5ff;
}
.warn-value {
  margin-right: 8px;
  font-weight: 600;
}
.warn-label {
  color: #999;
  font-size: 12px;
}
.algo-title {
  font-size: 14px;
  font-weight: 600;
  color: #1668dc;
  margin-bottom: 8px;
}
.algo-row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.75);
}
.algo-label {
  flex-shrink: 0;
  width: 64px;
  color: #999;
}
.algo-levels {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0f5ff;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.75);
}
.algo-note {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}
</style>
