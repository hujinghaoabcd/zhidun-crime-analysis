<template>
  <div class="planning">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="省份">
        <a-select v-model:value="province" style="width: 130px" @change="onProvince" placeholder="请选择">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="城市">
        <a-select v-model:value="city" style="width: 140px" @change="onCityChange" placeholder="请选择">
          <a-select-option v-for="c in cities" :key="c.adcode" :value="c.adcode">{{ c.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="时间">
        <a-select v-model:value="range" style="width: 120px" @change="onRangeChange">
          <a-select-option value="all">全部</a-select-option>
          <a-select-option value="1319">2013-2019</a-select-option>
          <a-select-option value="1519">2015-2019</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" size="small" :disabled="!city" @click="load">
          <a-icon type="car" />生成出警规划
        </a-button>
      </a-form-item>
    </a-form>

    <a-card size="small" title="已布控区域（联动）" :bordered="false" style="margin-bottom: 12px" :loading="controlledLoading">
      <div v-if="!controlled.length" class="empty-tip">暂无布控区域，请先到“重点区域布控”添加</div>
      <div v-for="c in controlled" :key="c.id" class="ctrl-row">
        <span class="warn-dot" :style="{ background: c.color }"></span>
        <span>{{ c.name }}</span>
        <a-tag style="margin-left: 8px">{{ c.label }}</a-tag>
        <span style="margin-left: auto">
          <a-button v-if="c.provinceAdcode" size="small" type="primary" ghost @click="planControlled(c)">
            出警规划
          </a-button>
          <a-tag v-else color="default">省级布控</a-tag>
        </span>
      </div>
    </a-card>

    <div v-if="!plan" class="empty-tip">请选择省份和城市，生成出警规划</div>

    <template v-if="plan">
      <a-row :gutter="12" class="kpi-row">
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num">{{ plan.total || 0 }}</div>
            <div class="kpi-label">样本案件</div>
          </div>
        </a-col>
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num">{{ plan.clusters.length }}</div>
            <div class="kpi-label">识别热点</div>
          </div>
        </a-col>
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num">{{ plan.stations.length }}</div>
            <div class="kpi-label">可调度派出所</div>
          </div>
        </a-col>
      </a-row>

      <a-collapse v-model:activeKey="planPanels" style="margin-bottom: 12px">
        <a-collapse-panel key="hotspots" header="热点列表（按案件数排序）">
          <a-table size="small" :columns="columns" :dataSource="plan.clusters" :pagination="false" rowKey="id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'level'">
                <a-tag :color="levelColor(record.level)">{{ levelLabel(record.level) }}</a-tag>
              </template>
            </template>
          </a-table>
        </a-collapse-panel>
        <a-collapse-panel key="route" header="推荐巡逻路线">
          <p style="margin: 0 0 8px; color: #666; font-size: 12px">
            依次连接 {{ plan.clusters.length }} 个热点，覆盖高发区域；建议 2 辆巡逻车分南北两段执行，每 2 小时轮换一次。
          </p>
          <Chart :option="routeOption" style="height: 180px" />
        </a-collapse-panel>
      </a-collapse>

      <a-card size="small" title="附近派出所" :bordered="false">
        <div v-for="s in plan.stations" :key="s.id" class="station-row">
          <a-icon type="bank" style="color: #2f54eb; margin-right: 8px" />
          <span>{{ s.name }}</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px">{{ s.address }}</span>
        </div>
      </a-card>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { useAppStore } from "@/store";

const RANGES: Record<string, { start: string; end: string }> = {
  all: { start: "", end: "" },
  "1319": { start: "2013-01-01", end: "2019-12-31" },
  "1519": { start: "2015-01-01", end: "2019-12-31" }
};

export default defineComponent({
  name: "Planning",
  data() {
    return {
      provinces: [] as any[],
      cities: [] as any[],
      province: undefined as number | undefined,
      city: undefined as number | undefined,
      range: "all",
      plan: null as any,
      planPanels: ["hotspots", "route"] as string[],
      controlled: [] as any[],
      controlledLoading: false,
      routeOption: {} as any,
      columns: [
        { title: "#", dataIndex: "id", key: "id", width: 40 },
        { title: "经度", dataIndex: "lng", key: "lng", width: 90 },
        { title: "纬度", dataIndex: "lat", key: "lat", width: 90 },
        { title: "案件数", dataIndex: "count", key: "count", width: 80, align: "right" },
        { title: "等级", dataIndex: "level", key: "level", width: 90 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("出警规划（全国）");
    api.provinces().then((ps) => (this.provinces = ps));
    this.loadControlled();
  },
  methods: {
    async loadControlled() {
      this.controlledLoading = true;
      try {
        this.controlled = await api.controlledList();
      } catch (e) {
        console.error(e);
      } finally {
        this.controlledLoading = false;
      }
    },
    async planControlled(c: any) {
      this.province = c.provinceAdcode;
      this.city = c.id;
      this.cities = await api.cities(c.provinceAdcode);
      this.load();
    },
    onCityChange(val: number | undefined) {
      this.city = val;
      this.load();
    },
    onRangeChange(val: string) {
      this.range = val;
      this.load();
    },
    async onProvince(adcode: number) {
      this.city = undefined;
      this.plan = null;
      this.cities = adcode ? await api.cities(adcode) : [];
    },
    async load() {
      if (!this.city) return;
      const { start, end } = RANGES[this.range] || RANGES.all;
      try {
        this.plan = await api.patrol({ city: this.city, start, end, grid: 0.03 });
        this.store.setMapConfig({
          mode: "patrol",
          province: this.province,
          city: this.city,
          start: start || "2000-01-01",
          end: end || "2019-12-31"
        });
        this.buildRouteChart();
      } catch (e) {
        console.error(e);
      }
    },
    buildRouteChart() {
      const route = this.plan.route || [];
      this.routeOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 30, right: 12, top: 12, bottom: 26 },
        xAxis: { type: "category", data: route.map((_: any, i: number) => "点" + (i + 1)) },
        yAxis: { type: "value", name: "累计覆盖案件", nameTextStyle: { fontSize: 10 } },
        series: [
          {
            type: "line",
            smooth: true,
            data: route.map((_: any, i: number) =>
              this.plan.clusters.slice(0, i + 1).reduce((s: number, c: any) => s + c.count, 0)
            ),
            areaStyle: { opacity: 0.2 },
            itemStyle: { color: "#1677ff" }
          }
        ]
      };
    },
    levelLabel(lv: string) {
      return lv === "red" ? "一级热点" : lv === "orange" ? "二级热点" : "三级热点";
    },
    levelColor(lv: string) {
      return lv === "red" ? "red" : lv === "orange" ? "orange" : "gold";
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.filter-bar {
  margin-bottom: 10px;
}
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
  font-size: 20px;
  font-weight: 700;
  color: #389e0d;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
.station-row {
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 13px;
}
.station-row:last-child {
  border-bottom: none;
}
.ctrl-row {
  display: flex;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 13px;
}
.ctrl-row:last-child {
  border-bottom: none;
}
.warn-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}
.planning :deep(.ant-table-thead > tr > th) {
  background: #ffffff;
  color: #1668dc;
}
</style>
