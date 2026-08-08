<template>
  <div class="people-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="人口采用第七次人口普查省级常住人口，与历史裁判文书案件样本做探索性对比。这里的“每万人样本数”不是现实犯罪发生率。"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">人口-文书样本量相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ avgRate }}</div>
          <div class="kpi-label">平均每万人文书样本数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topRate.name }}</div>
          <div class="kpi-label">样本/人口比最高省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="人口规模 × 裁判文书案件样本量（省份）" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="每万人文书样本数 TOP 10" :bordered="false">
          <Chart :option="rateOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="analysis-note">
      解释限制：人口规模与文书样本量可能共同受到城市规模、司法案件进入流程、文书公开率和数据覆盖度等因素影响。该比值只能作为当前数据集的标准化描述，不能称为“发案率”，也不能用于比较现实地区治安水平。
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
    this.store.setCardTitle("人口数据分析（探索性演示）");
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
          rate: x.total / POP_10K[x.adcode]
        }));
      this.corr = pearson(pts.map((p) => p.pop), pts.map((p) => p.crime));
      this.avgRate = (pts.reduce((s, p) => s + p.rate, 0) / Math.max(1, pts.length)).toFixed(2);
      this.topRate = [...pts].sort((a, b) => b.rate - a.rate)[0] || {};
      this.buildScatter(pts);
      this.buildRate(pts);
    },
    buildScatter(pts: any[]) {
      this.scatterOption = {
        tooltip: {
          formatter: (p: any) => `${p.data.name}<br>人口: ${p.data.pop} 万人<br>文书样本: ${p.data.crime} 条`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "常住人口（万人）", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "文书样本量", nameTextStyle: { fontSize: 10 } },
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
      const rows = [...pts].sort((a, b) => b.rate - a.rate).slice(0, 10).reverse();
      this.rateOption = {
        tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br>${Number(p[0].value).toFixed(2)} 条/万人` },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: rows.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: rows.map((x) => x.rate),
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
.kpi-row { margin-bottom: 10px; }
.kpi {
  background: linear-gradient(135deg, #f0f5ff, #fff);
  border: 1px solid #e8e8e8;
  border-radius: 0;
  text-align: center;
  padding: 10px 4px;
}
.kpi-num { font-size: 18px; font-weight: 700; color: #eb2f96; }
.kpi-label { color: #666; font-size: 12px; margin-top: 2px; }
.analysis-note { margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8; }
</style>
