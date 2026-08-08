<template>
  <div class="house-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="房价为各省级行政区公开均价的近似值（万元/㎡），用于演示“房价-街头犯罪”的倒U形关系"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">房价-案件相关系数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topPrice.name }}</div>
          <div class="kpi-label">房价最高省份</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ peak.name }}</div>
          <div class="kpi-label">案件峰值省份</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="房价 × 案件规模（省份）" :bordered="false">
          <Chart :option="scatterOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="房价 TOP 10（万元/㎡）" :bordered="false">
          <Chart :option="priceOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <div style="margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8">
      结论：房价与案件呈倒 U 形——超高房价地区（京沪）治安投入高、发案相对受控；
      中等房价的人口流入大省（广东、浙江、山东）案件最集中。
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
    this.store.setCardTitle("房价水平分析（全国）");
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
          formatter: (p: any) => `${p.data.name}<br>房价: ${p.data.price} 万/㎡<br>案件: ${p.data.crime} 起`
        },
        grid: { left: 50, right: 16, top: 12, bottom: 30 },
        xAxis: { type: "value", name: "均价（万元/㎡）", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "案件数", nameTextStyle: { fontSize: 10 } },
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
      const data = [...pts].sort((a, b) => b.price - a.price).slice(0, 10).reverse();
      this.priceOption = {
        tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].name}<br>${p[0].value} 万/㎡` },
        grid: { left: 58, right: 16, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: data.map((x) => x.price),
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
  color: #722ed1;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
</style>
