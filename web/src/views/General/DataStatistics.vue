<template>
  <div class="data-statistics">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="时间">
        <a-select v-model:value="range" style="width: 140px" @change="onRangeChange">
          <a-select-option value="all">2000-2019 全部</a-select-option>
          <a-select-option value="1319">2013-2019</a-select-option>
          <a-select-option value="0012">2000-2012</a-select-option>
          <a-select-option value="1519">2015-2019</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="类型">
        <a-select v-model:value="type" style="width: 130px" @change="onTypeChange" allowClear placeholder="全部">
          <a-select-option v-for="t in types" :key="t.type" :value="t.type">{{ t.type }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="省份">
        <a-select v-model:value="province" style="width: 130px" @change="onProvince" allowClear placeholder="全国">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="地市" v-if="province">
        <a-select v-model:value="city" style="width: 130px" @change="onCityChange" allowClear placeholder="全部">
          <a-select-option v-for="c in cities" :key="c.adcode" :value="c.adcode">{{ c.name }}</a-select-option>
        </a-select>
      </a-form-item>
    </a-form>

    <a-row :gutter="12">
      <a-col :span="14">
        <a-card size="small" title="月度案件趋势" :bordered="false">
          <Chart :option="trendOption" style="height: 250px" />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card size="small" title="案件类型分布" :bordered="false">
          <Chart :option="typeOption" style="height: 250px" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="12" style="margin-top: 12px">
      <a-col :span="12">
        <a-card size="small" title="省份 TOP 8" :bordered="false">
          <Chart :option="provinceOption" style="height: 220px" />
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" title="地市 TOP 8" :bordered="false">
          <Chart :option="cityOption" style="height: 220px" />
        </a-card>
      </a-col>
    </a-row>

    <div class="hint">提示：点击地图省份可下钻到地市；点击地市查看案件点位。</div>
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
  "0012": { start: "2000-01-01", end: "2012-12-31" },
  "1519": { start: "2015-01-01", end: "2019-12-31" }
};

export default defineComponent({
  name: "DataStatistics",
  data() {
    return {
      range: "all",
      type: undefined as string | undefined,
      province: undefined as number | undefined,
      city: undefined as number | undefined,
      provinces: [] as any[],
      cities: [] as any[],
      types: [] as any[],
      overview: {} as any,
      trendOption: {} as any,
      typeOption: {} as any,
      provinceOption: {} as any,
      cityOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {},
  mounted() {
    if (!this.store.mapConfig.data || !this.store.mapConfig.data.focusCase) {
      this.store.setShowSlide(true);
    }
    this.store.setCardTitle("警情信息统计（全国）");
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
    onCityChange(val: number | undefined) {
      this.city = val;
      this.load();
    },
    async onProvince(adcode: number) {
      this.city = undefined;
      this.cities = adcode ? await api.cities(adcode) : [];
      this.load();
    },
    rangeParams() {
      return RANGES[this.range] || RANGES.all;
    },
    async load() {
      const { start, end } = this.rangeParams();
      const params = {
        start,
        end,
        type: this.type || "",
        province: this.province || "",
        city: this.city || ""
      };
      const focusCase =
        this.store.mapConfig.data && this.store.mapConfig.data.focusCase
          ? this.store.mapConfig.data.focusCase
          : null;
      this.store.setMapConfig({
        mode: "stats",
        province: this.province || null,
        city: this.city || null,
        start,
        end,
        type: this.type || null,
        data: focusCase ? { focusCase } : null
      });
      try {
        const [overview, trend, rankP, rankC] = await Promise.all([
          api.overview(),
          api.trend({ dimension: "month", ...params }),
          api.rank({ by: "province", limit: 8, start, end, type: this.type || "" }),
          api.rank({ by: "city", province: this.province || "", limit: 8, start, end, type: this.type || "" })
        ]);
        this.overview = overview;
        this.buildTrend(trend);
        this.buildType(overview.byType);
        this.buildProvince(rankP);
        this.buildCity(rankC);
      } catch (e) {
        console.error(e);
      }
    },
    buildTrend(rows: any[]) {
      this.trendOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 34, right: 10, top: 24, bottom: 24 },
        xAxis: {
          type: "category",
          data: rows.map((r) => r.label),
          axisLabel: { fontSize: 9 }
        },
        yAxis: { type: "value", splitLine: { lineStyle: { type: "dashed" } } },
        series: [
          {
            name: "案件数",
            type: "line",
            smooth: true,
            data: rows.map((r) => r.total),
            areaStyle: { opacity: 0.25 },
            itemStyle: { color: "#1677ff" }
          }
        ]
      };
    },
    buildType(rows: any[]) {
      const data = this.topTypes(rows);
      this.typeOption = {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: {
          bottom: 0,
          left: "center",
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 8,
          textStyle: { fontSize: 10 }
        },
        series: [
          {
            type: "pie",
            radius: ["34%", "62%"],
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
    topTypes(rows: any[], n = 5) {
      const sorted = [...rows].sort((a: any, b: any) => b.total - a.total);
      const top = sorted.slice(0, n);
      const rest = sorted.slice(n);
      const restTotal = rest.reduce((s: number, x: any) => s + x.total, 0);
      const result = [...top];
      if (restTotal > 0) result.push({ type: `其他（${rest.length}类）`, total: restTotal });
      return result;
    },
    buildProvince(rows: any[]) {
      const data = [...rows].reverse();
      this.provinceOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 62, right: 20, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 12,
            data: data.map((x) => x.total),
            itemStyle: {
              color: (p: any) => ["#1677ff", "#69b1ff", "#91caff", "#bae0ff", "#d6e8ff"][p.dataIndex % 5]
            }
          }
        ]
      };
    },
    buildCity(rows: any[]) {
      const data = [...rows].reverse();
      this.cityOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 62, right: 20, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: data.map((x) => x.name), axisLabel: { fontSize: 10 } },
        series: [
          {
            type: "bar",
            barWidth: 12,
            data: data.map((x) => x.total),
            itemStyle: { color: "#13c2c2" }
          }
        ]
      };
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.filter-bar {
  margin-bottom: 10px;
}
.hint {
  margin-top: 10px;
  color: #999;
  font-size: 12px;
}
</style>
