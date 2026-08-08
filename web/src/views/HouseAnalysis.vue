<template>
  <div class="house-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="房价为各省级行政区公开均价的演示近似值，仅用于探索房价指标与裁判文书案件样本之间的统计关系；相关性不代表因果关系。"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">房价-样本量相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topPrice.name }}</div>
          <div class="kpi-label">房价指标最高省份</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ peak.name }}</div>
          <div class="kpi-label">文书样本最多省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="房价指标 × 裁判文书案件样本量（省份）" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="房价指标 TOP 10（万元/㎡）" :bordered="false">
          <Chart :option="priceOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="analysis-note">
      解释限制：图中只能说明当前演示指标与裁判文书样本量之间的统计关联。地区人口规模、城市化、文书公开与数据采集完整度等因素均可能影响结果，不能据此判断房价对犯罪的因果作用或现实治安水平。
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { HOUSE_PRICE, pearson } from "@/utils/social";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "HouseAnalysis",
  data() {
    return {
      corr: "0.00",
      topPrice: {} as any,
      peak: {} as any,
      scatterOption: {} as any,
      priceOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("房价水平分析（探索性演示）");
    this.store.setMapConfig({ mode: "social", indicator: "house" });
    this.load();
  },
  methods: {
    async load() {
      const rankP = await api.rank({ by: "province", limit: 31 });
      const pts = rankP
        .filter((x) => HOUSE_PRICE[x.adcode])
        .map((x) => ({
          name: x.name,
          price: HOUSE_PRICE[x.adcode],
          crime: x.total
        }));
      this.corr = pearson(pts.map((p) => p.price), pts.map((p) => p.crime));
      this.topPrice = [...pts].sort((a, b) => b.price - a.price)[0] || {};
      this.peak = [...pts].sort((a, b) => b.crime - a.crime)[0] || {};
      this.buildScatter(pts);
      this.buildPrice(pts);
    },
    buildScatter(pts: any[]) {
      this.scatterOption = {
        tooltip: {
          formatter: (p: any) => `${p.data.name}<br>房价指标: ${p.data.price} 万/㎡<br>文书样本: ${p.data.crime} 条`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "均价指标（万元/㎡）", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "文书样本量", nameTextStyle: { fontSize: 10 } },
        series: [
          {
            type: "scatter",
            symbolSize: 11,
            data: pts.map((p) => ({ value: [p.price, p.crime], name: p.name })),
            itemStyle: { color: "#fa8c16", opacity: 0.8 }
          }
        ]
      };
    },
    buildPrice(pts: any[]) {
      const rows = [...pts].sort((a, b) => b.price - a.price).slice(0, 10).reverse();
      this.priceOption = {
        tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br>${p[0].value} 万/㎡` },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: rows.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: rows.map((x) => x.price),
            itemStyle: { color: "#722ed1" }
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
.kpi-num { font-size: 18px; font-weight: 700; color: #722ed1; }
.kpi-label { color: #666; font-size: 12px; margin-top: 2px; }
.analysis-note { margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8; }
</style>
