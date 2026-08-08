<template>
  <div class="poi-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="POI 繁华度指数为演示近似值（综合人口与城市规模），仅用于探索该指标与裁判文书案件样本量之间的统计关系；不代表真实 POI 密度或因果效应。"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">POI指数-样本量相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topPoi.name }}</div>
          <div class="kpi-label">繁华度指标最高省份</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topCrime.name }}</div>
          <div class="kpi-label">文书样本最多省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="POI 繁华度指标 × 裁判文书案件样本量" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="POI 繁华度指标 TOP 10" :bordered="false">
          <Chart :option="poiOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="analysis-note">
      解释限制：该图只展示当前演示指标与文书样本量的相关性。人口规模、商业活动、数据公开和样本覆盖等都可能造成共同变化，因此不能据此推断“POI 导致犯罪”，也不能直接形成现实巡逻或视频布控阈值。
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { poiIndex, pearson } from "@/utils/social";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "POIAnalysis",
  data() {
    return {
      corr: "0.00",
      topPoi: {} as any,
      topCrime: {} as any,
      scatterOption: {} as any,
      poiOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("POI 繁华度分析（探索性演示）");
    this.store.setMapConfig({ mode: "social", indicator: "poi" });
    this.load();
  },
  methods: {
    async load() {
      const rankP = await api.rank({ by: "province", limit: 31 });
      const pts = rankP.map((x) => ({
        name: x.name,
        poi: poiIndex(x.adcode),
        crime: x.total
      }));
      this.corr = pearson(pts.map((p) => p.poi), pts.map((p) => p.crime));
      this.topPoi = [...pts].sort((a, b) => b.poi - a.poi)[0] || {};
      this.topCrime = [...pts].sort((a, b) => b.crime - a.crime)[0] || {};
      this.buildScatter(pts);
      this.buildPoi(pts);
    },
    buildScatter(pts: any[]) {
      this.scatterOption = {
        tooltip: {
          formatter: (p: any) => `${p.data.name}<br>POI 指标: ${p.data.poi}<br>文书样本: ${p.data.crime} 条`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "POI 繁华度指标", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "文书样本量", nameTextStyle: { fontSize: 10 } },
        series: [
          {
            type: "scatter",
            symbolSize: 11,
            data: pts.map((p) => ({ value: [p.poi, p.crime], name: p.name })),
            itemStyle: { color: "#52c41a", opacity: 0.8 }
          }
        ]
      };
    },
    buildPoi(pts: any[]) {
      const rows = [...pts].sort((a, b) => b.poi - a.poi).slice(0, 10).reverse();
      this.poiOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value", max: 100 },
        yAxis: { type: "category", data: rows.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: rows.map((x) => x.poi),
            itemStyle: { color: "#52c41a" }
          }
        ]
      };
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.kpi-row { margin-bottom: 10px; }
.kpi {
  background: linear-gradient(135deg, #f0f5ff, #fff);
  border: 1px solid #e8e8e8;
  border-radius: 0;
  text-align: center;
  padding: 10px 4px;
}
.kpi-num { font-size: 18px; font-weight: 700; color: #389e0d; }
.kpi-label { color: #666; font-size: 12px; margin-top: 2px; }
.analysis-note { margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8; }
</style>
