<template>
  <div class="basic-analysis">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="基于全国裁判文书样本做空间描述：样本集中度、行政区规模与样本量关系。结果反映当前数据集结构，不等同于现实犯罪热点或发案水平。"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ cr8 }}%</div>
          <div class="kpi-label">TOP8 城市样本集中度</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ topProvinceShare }}%</div>
          <div class="kpi-label">TOP1 省份样本占比</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ corr }}</div>
          <div class="kpi-label">地市数量-样本量相关</div>
        </div>
      </a-col>
    </a-row>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="省份裁判文书案件样本量 TOP 15" :bordered="false">
          <Chart :option="provinceOption" style="height: 230px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="省份样本集中度" :bordered="false">
          <Chart :option="crOption" style="height: 230px" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="12" style="margin-top: 12px">
      <a-col :span="24">
        <a-card size="small" title="地市数量与文书样本量（行政区规模描述）" :bordered="false">
          <Chart :option="scaleOption" style="height: 150px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="analysis-note">
      数据集描述：TOP8 城市占当前样本的 {{ cr8 }}%，省内地市数量与省级文书样本量的 Pearson 相关系数为 r={{ corr }}。这些统计量受人口、城市化、司法文书公开和样本覆盖等共同影响，仅用于理解当前数据集的空间结构。
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { pearson } from "@/utils/social";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "BasiclAnalysis",
  data() {
    return {
      cr8: 0 as number | string,
      topProvinceShare: 0 as number | string,
      corr: "0.00",
      provinceOption: {} as any,
      crOption: {} as any,
      scaleOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("基础专题分析（数据集描述）");
    this.store.setMapConfig({ mode: "social", indicator: "composite" });
    this.load();
  },
  methods: {
    async load() {
      try {
        const [rankP, rankC, cityList] = await Promise.all([
          api.rank({ by: "province", limit: 31 }),
          api.rank({ by: "city", limit: 8 }),
          api.cities()
        ]);
        const total = rankP.reduce((s, x) => s + x.total, 0);
        this.topProvinceShare = total ? ((rankP[0].total / total) * 100).toFixed(1) : "0";
        this.cr8 = total ? ((rankC.reduce((s, x) => s + x.total, 0) / total) * 100).toFixed(1) : "0";
        this.buildProvince(rankP);
        this.buildCR(rankP, total);
        this.buildScale(rankP, cityList);
      } catch (e) {
        console.error(e);
      }
    },
    buildProvince(rows: any[]) {
      const data = rows.slice(0, 15).reverse();
      this.provinceOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 62, right: 20, top: 8, bottom: 26 },
        xAxis: { type: "value", name: "文书样本量", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 11,
            data: data.map((x) => x.total),
            itemStyle: {
              color: (p: any) => (p.dataIndex >= data.length - 3 ? "#fa8c16" : "#1677ff")
            }
          }
        ]
      };
    },
    buildCR(rows: any[], total: number) {
      const top = rows.slice(0, 5).map((x) => ({ name: x.name, value: x.total }));
      const rest = { name: "其他省份", value: total - top.reduce((s, x) => s + x.value, 0) };
      this.crOption = {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: { bottom: 0, textStyle: { fontSize: 9 } },
        series: [
          {
            type: "pie",
            radius: ["28%", "58%"],
            center: ["50%", "42%"],
            data: [...top, rest].map((x, i) => ({
              name: x.name,
              value: x.value,
              itemStyle: { color: ["#d4380d", "#fa8c16", "#fadb14", "#52c41a", "#13c2c2", "#bfbfbf"][i % 6] }
            }))
          }
        ]
      };
    },
    buildScale(rankP: any[], cityList: any[]) {
      const byProvince: Record<number, number> = {};
      for (const c of cityList) {
        if (c.provinceAdcode === undefined) continue;
        byProvince[c.provinceAdcode] = (byProvince[c.provinceAdcode] || 0) + 1;
      }
      const pts = rankP
        .filter((p) => byProvince[p.adcode])
        .map((p) => ({ x: byProvince[p.adcode], y: p.total, name: p.name }));
      this.corr = pearson(pts.map((p) => p.x), pts.map((p) => p.y));
      this.scaleOption = {
        tooltip: {
          trigger: "item",
          formatter: (p: any) => `${p.data.name}<br>地市数: ${p.data.x}<br>文书样本: ${p.data.y}`
        },
        grid: { left: 44, right: 16, top: 12, bottom: 28 },
        xAxis: { type: "value", name: "地市数量", nameTextStyle: { fontSize: 10 } },
        yAxis: { type: "value", name: "文书样本量", nameTextStyle: { fontSize: 10 } },
        series: [
          {
            type: "scatter",
            symbolSize: 10,
            data: pts.map((p) => ({ value: [p.x, p.y], name: p.name })),
            itemStyle: { color: "#1677ff", opacity: 0.75 }
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
.kpi-num { font-size: 20px; font-weight: 700; color: #1677ff; }
.kpi-label { color: #666; font-size: 12px; margin-top: 2px; }
.analysis-note { margin-top: 10px; color: #666; font-size: 12px; line-height: 1.8; }
</style>
