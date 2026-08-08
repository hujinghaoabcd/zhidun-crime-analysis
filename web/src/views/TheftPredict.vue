<template>
  <div class="theft-predict">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="预测粒度">
        <a-radio-group v-model:value="level" @change="onLevelChange">
          <a-radio-button value="province">省级</a-radio-button>
          <a-radio-button value="city">地市级</a-radio-button>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="省份" v-if="level === 'city'">
        <a-select v-model:value="province" style="width: 140px" @change="onProvinceChange" placeholder="请选择省份">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" size="small" @click="load">重新预测</a-button>
      </a-form-item>
    </a-form>

    <a-alert
      v-if="level === 'city'"
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="地市级预测请先选择省份，地图将下钻到该省各地市"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">{{ summary.totalForecast || 0 }}</div>
          <div class="kpi-label">{{ periodLabel }}预测案件</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num" :style="{ color: changeColor }">{{ changeText }}</div>
          <div class="kpi-label">{{ level === "city" ? "年度变化" : "环比变化" }}</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">
            {{ quality.accuracy === null || quality.accuracy === undefined ? "--" : quality.accuracy + "%" }}
          </div>
          <div class="kpi-label">回测精度</div>
        </div>
      </a-col>
      <a-col :span="6">
        <div class="kpi">
          <div class="kpi-num">
            <span style="color: #d4380d">{{ summary.redCount || 0 }}</span>
            <span style="color: #fa8c16; margin-left: 6px">{{ summary.orangeCount || 0 }}</span>
            <span style="color: #fadb14; margin-left: 6px">{{ summary.yellowCount || 0 }}</span>
          </div>
          <div class="kpi-label">红 / 橙 / 黄</div>
        </div>
      </a-col>
    </a-row>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      :message="'模型：' + (result.model || '') + '；预测起始：' + (result.forecastFrom || '')"
    />

    <div v-if="modelsLoading" class="model-waiting model-waiting-top">
      <div class="model-chain">
        <span class="chain-node"><a-icon type="experiment" />SARIMA</span>
        <i class="chain-line"></i>
        <span class="chain-node"><a-icon type="tool" />STARMA</span>
        <i class="chain-line"></i>
        <span class="chain-node"><a-icon type="bulb" />Prophet</span>
        <i class="chain-line"></i>
        <span class="chain-node"><a-icon type="code" />XGBoost</span>
        <i class="chain-line"></i>
        <span class="chain-node ens"><a-icon type="api" />集成</span>
      </div>
      <div class="model-waiting-text">
        <a-icon type="loading" /> 正在联动各模型计算预测，约需 15 秒…
      </div>
      <div class="model-progress"><i></i></div>
    </div>

    <a-row :gutter="12">
      <a-col :span="24">
        <a-card size="small" title="预警 TOP 5（点击查看历史-预测曲线）" :bordered="false">
          <a-table
            size="small"
            :columns="columns"
            :dataSource="topRows"
            :pagination="false"
            rowKey="id"
            :customRow="customRow"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'levelLabel'">
                <a-tag :color="record.color">{{ record.levelLabel }}</a-tag>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="12" style="margin-top: 12px">
      <a-col :span="24">
        <a-card class="series-card" size="small" :title="seriesTitle" :bordered="false">
          <Chart :option="seriesOption" style="height: 190px" />
        </a-card>
      </a-col>
    </a-row>

    <a-collapse v-model:activeKey="modelPanelKeys" style="margin-top: 12px">
      <a-collapse-panel key="models" header="多模型对比（2018 年滚动回测）">
        <div v-if="modelsLoading" class="empty-tip">模型计算中，请稍候…</div>
        <template v-else>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
            <span style="font-size: 13px; color: #666">地图模型：</span>
            <a-select v-model:value="modelChoice" style="width: 230px" @change="onModelChange">
              <a-select-option value="ensemble">集成预测（加权平均）</a-select-option>
              <a-select-option v-for="m in modelRows" :key="m.key" :value="m.key">{{ m.name }}</a-select-option>
            </a-select>
          </div>
          <a-table
            size="small"
            :columns="modelColumns"
            :dataSource="modelRows"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'accuracy'">
                <b :style="{ color: record.best ? '#1668dc' : undefined }">{{ record.accuracy }}%</b>
                <a-tag v-if="record.best" color="blue" style="margin-left: 6px">最佳</a-tag>
              </template>
            </template>
          </a-table>
          <div style="margin-top: 8px; color: #999; font-size: 12px">
            说明：各模型使用 2018 年全年滚动回测对比；当前主模型为 STL + 趋势外推 + 空间平滑，多模型结果可用于后续集成切换。
          </div>
        </template>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { useAppStore } from "@/store";
import { message } from "ant-design-vue";

export default defineComponent({
  name: "TheftPredict",
  data() {
    return {
      level: "province",
      province: undefined as number | undefined,
      provinces: [] as any[],
      result: {} as any,
      summary: {} as any,
      quality: {} as any,
      topRows: [] as any[],
      columns: [
        { title: "排名", dataIndex: "rank", key: "rank", width: 50 },
        { title: "地区", dataIndex: "name", key: "name" },
        { title: "基准值", dataIndex: "lastValue", key: "lastValue", width: 70, align: "right" },
        { title: "预测值", dataIndex: "value", key: "value", width: 80, align: "right" },
        { title: "变化率", dataIndex: "changePct", key: "changePct", width: 70, align: "right" },
        { title: "预警等级", dataIndex: "levelLabel", key: "levelLabel", width: 100 }
      ],
      seriesTitle: "全国月度趋势（点击预警地区查看明细）",
      seriesOption: {} as any,
      selected: null as any,
      initialRegion: null as number | null,
      modelsLoading: false,
      modelRows: [] as any[],
      modelChoice: "stl",
      modelData: null as any,
      modelPanelKeys: [] as string[],
      modelColumns: [
        { title: "模型", dataIndex: "name", key: "name" },
        { title: "回测精度", dataIndex: "accuracy", key: "accuracy", width: 110, align: "right" },
        { title: "MAPE", dataIndex: "mape", key: "mape", width: 90, align: "right" },
        { title: "下月均值预测", dataIndex: "next", key: "next", width: 110, align: "right" }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {
    periodLabel() {
      return this.level === "city" ? "下一年" : "下月";
    },
    changeText() {
      const v = this.summary.changePct;
      return v === undefined ? "--" : `${v >= 0 ? "+" : ""}${v}%`;
    },
    changeColor() {
      const v = this.summary.changePct;
      if (v === undefined) return "#333";
      return v > 5 ? "#d4380d" : v < -5 ? "#52c41a" : "#fa8c16";
    }
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("犯罪预测与预警（全国）");
    const q = this.$route.query;
    if (q.region) this.initialRegion = Number(q.region);
    api.provinces().then((ps) => {
      this.provinces = ps;
      this.load();
    });
  },
  methods: {
    onLevelChange() {
      // antd-vue4 的 change 事件传的是事件对象，等级已由 v-model:value 更新
      this.selected = null;
      this.load();
    },
    onProvinceChange(val: number | undefined) {
      this.province = val;
      this.selected = null;
      this.load();
    },
    customRow(record: any) {
      return {
        onClick: () => this.selectRegion(record),
        style: { cursor: "pointer" }
      };
    },
    async load() {
      if (this.level === "city" && !this.province) {
        message.warning("地市级预测请先选择省份");
        return;
      }
      const params = {
        level: this.level,
        months: 3,
        top: 0
      };
      this.store.setMapConfig({
        mode: "predict",
        level: this.level,
        province: this.level === "city" ? this.province || null : null,
        city: null
      });
      try {
        const res = await api.predict(params);
        this.result = res;
        this.summary = res.summary || {};
        this.quality = res.quality || {};
        let items = res.items || [];
        if (this.level === "city" && this.province) {
          const prefix = String(this.province).slice(0, 2);
          items = items.filter(
            (x) => x.id === Number(this.province) || String(x.id).startsWith(prefix)
          );
          this.summary = this.clientSummary(items);
        }
        this.topRows = items.slice(0, 5).map((x, i) => ({
          id: x.id,
          rank: i + 1,
          name: x.name,
          lastValue: x.lastValue,
          value: x.forecast[0].value,
          changePct: `${x.forecast[0].changePct >= 0 ? "+" : ""}${x.forecast[0].changePct}%`,
          levelLabel: x.forecast[0].label,
          level: x.forecast[0].level,
          color: x.forecast[0].color
        }));
        if (this.initialRegion) {
          const row = this.topRows.find((r) => r.id === this.initialRegion);
          this.initialRegion = null;
          if (row) this.selectRegion(row);
          else this.loadNationalSeries();
        } else if (!this.selected) this.loadNationalSeries();
        else this.selectRegion(this.selected);
        this.loadModels();
      } catch (e) {
        console.error(e);
      }
    },
    async loadModels() {
      this.modelsLoading = true;
      const started = Date.now();
      try {
        const res = await api.models({ level: this.level });
        this.modelData = res;
        const best = Math.max(...res.models.map((m) => m.accuracy || 0));
        this.modelRows = res.models.map((m) => ({
          key: m.key,
          name: m.name,
          accuracy: m.accuracy === null || m.accuracy === undefined ? "--" : m.accuracy,
          mape: m.mape === null || m.mape === undefined ? "--" : m.mape,
          next: m.next,
          best: (m.accuracy || 0) >= best && best > 0
        }));
        this.applyModelToMap();
      } catch (e) {
        console.error(e);
      } finally {
        const elapsed = Date.now() - started;
        const wait = Math.max(0, 3000 - elapsed);
        setTimeout(() => {
          this.modelsLoading = false;
        }, wait);
      }
    },
    onModelChange() {
      this.applyModelToMap();
    },
    applyModelToMap() {
      if (!this.modelData || this.level !== "province") return;
      let items;
      let summary;
      let forecastFrom = "2020-01";
      if (this.modelChoice === "stl") {
        items = this.modelData.itemsByModel.stl || this.modelData.ensemble;
        summary = this.modelData.stlSummary || this.clientSummary(items);
        forecastFrom = this.modelData.stlForecastFrom || forecastFrom;
      } else if (this.modelChoice === "ensemble") {
        items = this.modelData.ensemble;
        summary = this.modelData.ensembleSummary;
      } else {
        items = this.modelData.itemsByModel[this.modelChoice] || this.modelData.ensemble;
        summary = this.clientSummary(items);
      }
      this.summary = summary;
      this.topRows = items.slice(0, 5).map((x, i) => ({
        id: x.id,
        rank: i + 1,
        name: x.name,
        lastValue: x.lastValue,
        value: x.forecast[0].value,
        changePct: `${x.forecast[0].changePct >= 0 ? "+" : ""}${x.forecast[0].changePct}%`,
        levelLabel: x.forecast[0].label,
        level: x.forecast[0].level,
        color: x.forecast[0].color
      }));
      this.store.setMapConfig({
        mode: "predict",
        level: "province",
        province: null,
        city: null,
        data: {
          predictItems: items,
          summary,
          forecastFrom
        }
      });
    },
    clientSummary(items: any[]) {
      const totalForecast = items.reduce((s, x) => s + x.forecast[0].value, 0);
      const totalLast = items.reduce((s, x) => s + x.lastValue, 0);
      const count = (lv: string) => items.filter((x) => x.forecast[0].level === lv).length;
      return {
        totalForecast,
        changePct: totalLast > 0 ? Math.round(((totalForecast - totalLast) / totalLast) * 100) : 0,
        redCount: count("red"),
        orangeCount: count("orange"),
        yellowCount: count("yellow"),
        normalCount: count("green"),
        regions: items.length
      };
    },
    async loadNationalSeries() {
      const rows = await api.trend({ dimension: "month" });
      const labels = rows.map((r) => r.label);
      const values = rows.map((r) => r.total);
      const fc = (this.result.items || []).reduce((s, x) => s + x.forecast[0].value, 0);
      labels.push(this.result.forecastFrom);
      values.push(fc);
      this.seriesTitle = "全国月度案件趋势（含下月预测）";
      this.seriesOption = this.seriesChart(labels, values, true, 1);
    },
    async selectRegion(row: any) {
      this.selected = row;
      try {
        const s = await api.predictSeries({ level: this.level, id: row.id });
        const labels = [...s.labels];
        const values = [...s.values];
        for (const f of s.forecast) {
          labels.push(this.level === "city" ? String(f.year) : `${f.year}-${String(f.month).padStart(2, "0")}`);
          values.push(f.value);
        }
        this.seriesTitle = `${row.name} 历史与预测`;
        this.seriesOption = this.seriesChart(labels, values, true, s.forecast.length);
        this.store.patchMapConfig({
          data: {
            ...(this.store.mapConfig.data || {}),
            focusRegion: row.id
          }
        });
        this.$nextTick(() => {
          const el = document.querySelector(".series-card");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch (e) {
        console.error(e);
      }
    },
    seriesChart(labels: string[], values: number[], markForecast: boolean, forecastCount: number) {
      return {
        tooltip: { trigger: "axis" },
        grid: { left: 40, right: 12, top: 20, bottom: 28 },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: { interval: Math.max(1, Math.floor(labels.length / 14)), fontSize: 9 }
        },
        yAxis: { type: "value" },
        series: [
          {
            name: "案件数",
            type: "line",
            smooth: true,
            data: values,
            itemStyle: { color: "#1677ff" },
            areaStyle: { opacity: 0.15 },
            markPoint: markForecast
              ? {
                  data: [
                    {
                      name: "预测起点",
                      coord: [labels.length - (forecastCount || 1), values[labels.length - (forecastCount || 1)]],
                      symbol: "triangle",
                      symbolSize: 12,
                      itemStyle: { color: "#fa8c16" }
                    }
                  ]
                }
              : undefined
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
  color: #d46b08;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
.theft-predict :deep(.ant-table-thead > tr > th) {
  padding: 6px 8px !important;
}
.theft-predict :deep(.ant-table-tbody > tr > td) {
  padding: 5px 8px !important;
}
.model-waiting {
  padding: 26px 12px 22px;
  text-align: center;
  background-image: radial-gradient(circle at 50% 0%, rgba(22, 104, 220, 0.08), transparent 60%),
    linear-gradient(rgba(22, 104, 220, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(22, 104, 220, 0.04) 1px, transparent 1px);
  background-size: 100% 100%, 20px 20px, 20px 20px;
}
.model-waiting-top {
  margin-bottom: 12px;
}
.model-chain {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}
.chain-node {
  position: relative;
  overflow: hidden;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid #91caff;
  background: radial-gradient(circle at 30% 30%, #f8fbff, #e7f0ff);
  color: #1668dc;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: nodePulse 1.6s ease-in-out infinite;
  box-shadow: 0 2px 8px rgba(22, 104, 220, 0.18);
}
.chain-node .anticon {
  font-size: 17px;
  margin-bottom: 2px;
}
.chain-node::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: shimmer 2.4s linear infinite;
}
.chain-node.ens {
  background: radial-gradient(circle at 30% 30%, #3f8bff, #0d4fad);
  color: #fff;
  border-color: #1668dc;
  animation-delay: 0.35s;
  box-shadow: 0 0 18px rgba(22, 104, 220, 0.6);
}
.chain-node.ens::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1px solid rgba(22, 104, 220, 0.55);
  animation: radarRing 1.8s ease-out infinite;
}
.chain-line {
  position: relative;
  flex: 1;
  height: 2px;
  max-width: 72px;
  background: linear-gradient(90deg, #91caff, #1668dc, #91caff);
  background-size: 200% 100%;
  animation: lineFlow 1.1s linear infinite;
}
.chain-line::before {
  content: "";
  position: absolute;
  top: -2px;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4d9fff;
  box-shadow: 0 0 8px rgba(77, 159, 255, 0.95);
  animation: dotTravel 1.1s linear infinite;
}
.chain-line::after {
  content: "";
  position: absolute;
  right: -1px;
  top: -3px;
  border-left: 5px solid #1668dc;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}
@keyframes nodePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(22, 104, 220, 0.35);
  }
  50% {
    box-shadow: 0 0 0 9px rgba(22, 104, 220, 0);
  }
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
@keyframes lineFlow {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.model-waiting-text {
  color: #666;
  font-size: 13px;
}
.model-progress {
  width: 260px;
  height: 5px;
  margin: 10px auto 0;
  background: #e8edf3;
  overflow: hidden;
}
.model-progress i {
  display: block;
  width: 45%;
  height: 100%;
  background: linear-gradient(90deg, #4d9fff, #1668dc);
  animation: barSlide 1.2s ease-in-out infinite;
}
@keyframes barSlide {
  0% {
    margin-left: -45%;
  }
  100% {
    margin-left: 100%;
  }
}
@keyframes dotTravel {
  0% {
    left: 0;
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  100% {
    left: calc(100% - 4px);
    opacity: 0.3;
  }
}
@keyframes radarRing {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
</style>
