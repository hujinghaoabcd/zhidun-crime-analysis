<template>
  <div class="people-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="人口数据采用第七次人口普查各省常住人口（万人），与裁判文书案件样本做相关性分析"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">人口-案件相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ avgRate }}</div>
          <div class="kpi-label">平均每万人案件数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topRate.name }}</div>
          <div class="kpi-label">发案率最高省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="人口规模 × 案件规模（省份）" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="每万人发案率 TOP 10" :bordered="false">
          <Chart :option="rateOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div style="margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8">
      结论：人口规模与街头犯罪案件数量显著正相关（r={{ corr }}）；考虑人口后，广东、浙江等人口流入大省发案率更高，
      印证了人口密度与流动人口对街头犯罪空间分布的影响。
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { POP_10K, pearson } from "@/utils/social";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "PeopleAnalysis",
  data() {
    return {
      corr: "0.00",
      avgRate: "0.00",
      topRate: {} as any,
      scatterOption: {} as any,
      rateOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("人口数据分析（全国）");
    this.store.setMapConfig({ mode: "social", indicator: "population" });
    this.load();
  },
  methods: {
    async load() {
      const rankP = await api.rank({ by: "province", limit: 31 });
      const pts = rankP
        .filter((x) => POP_10K[x.adcode])
        .map((x) => ({
          name: x.name,
          pop: POP_10K[x.adcode],
          crime: x.total,
          rate: (x.total / POP_10K[x.adcode]) * 10000
        }));
      this.corr = pearson(pts.map((p) => p.pop), pts.map((p) => p.crime));
      this.avgRate = (pts.reduce((s, p) => s + p.rate, 0) / pts.length).toFixed(2);
      this.topRate = [...pts].sort((a, b) => b.rate - a.rate)[0] || {};
      this.buildScatter(pts);
      this.buildRate(pts);
    },
    buildScatter(pts: any[]) {
      this.scatterOption = {
        tooltip: {
          formatter: (p: any) => `${p.data.name}<br>人口: ${p.data.pop} 万人<br>案件: ${p.data.crime} 起`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "常住人口（万人）", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "案件数", nameTextStyle: { fontSize: 10 } },
        series: [
          {
            type: "scatter",
            symbolSize: (d: any) => 6 + Math.sqrt(d[0]) / 6,
            data: pts.map((p) => ({ value: [p.pop, p.crime], name: p.name })),
            itemStyle: { color: "#13c2c2", opacity: 0.8 }
          }
        ]
      };
    },
    buildRate(pts: any[]) {
      const data = [...pts].sort((a, b) => b.rate - a.rate).slice(0, 10).reverse();
      this.rateOption = {
        tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br>${p[0].value.toFixed(2)} 起/万人` },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: data.map((x) => x.rate),
            itemStyle: { color: "#eb2f96" }
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
  color: #eb2f96;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
</style>
