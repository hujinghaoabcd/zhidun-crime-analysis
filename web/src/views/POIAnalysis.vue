<template>
  <div class="poi-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="POI 繁华度指数为演示近似值（综合人口与城市规模），用于分析商业繁华度与街头犯罪的关系"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">POI-案件相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topPoi.name }}</div>
          <div class="kpi-label">繁华度最高省份</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topCrime.name }}</div>
          <div class="kpi-label">案件最高省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="POI 繁华度 × 案件规模" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="POI 繁华度 TOP 10" :bordered="false">
          <Chart :option="poiOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div style="margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8">
      结论：商业/公共服务设施密度（POI）与街头犯罪呈正相关，繁华商圈既是人流集聚区也是盗窃、抢夺高发区；
      建议对 POI 指数 ≥ 70 的地区加密巡逻与视频布控。
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
    this.store.setCardTitle("POI 繁华度分析（全国）");
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
          formatter: (p: any) => `${p.data.name}<br>POI: ${p.data.poi}<br>案件: ${p.data.crime} 起`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "POI 繁华度指数", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "案件数", nameTextStyle: { fontSize: 10 } },
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
      const data = [...pts].sort((a, b) => b.poi - a.poi).slice(0, 10).reverse();
      this.poiOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value", max: 100 },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: data.map((x) => x.poi),
            itemStyle: {
              color: (p: any) => (p.value >= 70 ? "#fa8c16" : "#52c41a")
            }
          }
        ]
      };
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.kpi-row {
  margin-bottom: 10px;
}
.kpi {
  background: linear-gradient(135deg, #f0f5ff, #fff);
  border: 1px solid #e8e8e8;
  border-radius: 0;
  text-align: center;
  padding: 10px 4px;
}
.kpi-num {
  font-size: 18px;
  font-weight: 700;
  color: #389e0d;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
</style>
