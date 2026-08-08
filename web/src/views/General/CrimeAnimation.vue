<template>
  <div class="crime-animation">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="时段">
        <a-select v-model:value="range" style="width: 120px" @change="onRangeChange">
          <a-select-option value="all">2000-2019</a-select-option>
          <a-select-option value="1319">2013-2019</a-select-option>
          <a-select-option value="1519">2015-2019</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="类型">
        <a-select v-model:value="type" style="width: 120px" @change="onTypeChange" allowClear placeholder="全部">
          <a-select-option v-for="t in types" :key="t.type" :value="t.type">{{ t.type }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="省份">
        <a-select v-model:value="province" style="width: 120px" @change="onProvince" allowClear placeholder="全国">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="城市">
        <a-select v-model:value="city" style="width: 120px" @change="onCityChange" allowClear placeholder="全部城市">
          <a-select-option v-for="c in cities" :key="c.adcode" :value="c.adcode">{{ c.name }}</a-select-option>
        </a-select>
      </a-form-item>
    </a-form>

    <div class="player">
      <a-button type="primary" shape="circle" @click="togglePlay">
        <template #icon>
          <a-icon :type="playing ? 'pause-circle' : 'play-circle'" />
        </template>
      </a-button>
      <a-radio-group v-model:value="speed" size="small" style="margin: 0 10px" @change="restartTimer">
        <a-radio-button value="1">1x</a-radio-button>
        <a-radio-button value="2">2x</a-radio-button>
        <a-radio-button value="4">4x</a-radio-button>
      </a-radio-group>
      <span class="month-label">{{ currentLabel }}</span>
      <a-slider
        :min="0"
        :max="months.length - 1"
        :value="idx"
        style="flex: 1; margin: 0 12px"
        @change="jumpTo"
      />
    </div>

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ currentCount }}</div>
          <div class="kpi-label">当月案件数</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ cumulative }}</div>
          <div class="kpi-label">累计案件（至当月）</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ months.length }}</div>
          <div class="kpi-label">动画总月数</div>
        </div>
      </a-col>
    </a-row>

    <a-card size="small" title="月度案件走势" :bordered="false">
      <Chart :option="trendOption" style="height: 190px" />
    </a-card>

    <div class="timeline">
      <div class="timeline-head">
        <span class="timeline-title">时间轴</span>
        <span class="timeline-current">{{ currentLabel }}</span>
      </div>
      <div class="timeline-bar">
        <div
          v-for="(c, i) in timelineCells"
          :key="i"
          class="timeline-cell"
          :class="{ active: c.active }"
          :style="{ background: cellColor(c.count) }"
          @click="jumpTo(i)"
          :title="c.label + '：' + c.count + ' 起'"
        ></div>
        <div class="timeline-marker" :style="{ left: markerLeft }"></div>
      </div>
      <div class="timeline-labels">
        <span v-for="y in yearLabels" :key="y" class="timeline-year">{{ y }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import Chart from "@/components/Chart.vue";
import { useAppStore } from "@/store";

const SPEEDS: Record<string, number> = { "1": 800, "2": 400, "4": 200 };

export default defineComponent({
  name: "CrimeAnimation",
  data() {
    return {
      range: "all",
      type: undefined as string | undefined,
      province: undefined as number | undefined,
      city: undefined as number | undefined,
      provinces: [] as any[],
      cities: [] as any[],
      types: [] as any[],
      months: [] as { year: number; month: number; label: string }[],
      idx: 0,
      playing: false,
      speed: "1",
      timer: null as ReturnType<typeof setInterval> | null,
      currentCount: 0,
      cumulative: 0,
      monthlyRows: [] as any[],
      trendOption: {} as any
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {
    cityName() {
      const c = this.cities.find((x) => x.adcode === this.city);
      return c ? c.name : "";
    },
    currentLabel() {
      const m = this.months[this.idx];
      return m ? `${m.year}-${String(m.month).padStart(2, "0")}` : "--";
    },
    timelineCells() {
      return this.months.map((m, i) => ({
        label: `${m.year}-${String(m.month).padStart(2, "0")}`,
        count: this.monthlyRows[i] ? this.monthlyRows[i].total : 0,
        active: i === this.idx
      }));
    },
    timelineMax() {
      return Math.max(1, ...this.timelineCells.map((c) => c.count));
    },
    yearLabels() {
      return [...new Set(this.months.map((m) => m.year))];
    },
    markerLeft() {
      return this.months.length > 1 ? `${(this.idx / (this.months.length - 1)) * 100}%` : "0%";
    }
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("犯罪动态播放（全国/城市）");
    Promise.all([api.provinces(), api.types()]).then(([ps, ts]) => {
      this.provinces = ps;
      this.types = ts;
      this.rebuild();
    });
  },
  beforeUnmount() {
    this.stopTimer();
  },
  methods: {
    cellColor(count: number) {
      const t = Math.log(1 + count) / Math.log(1 + this.timelineMax);
      return `rgba(246, 195, 67, ${(0.12 + 0.85 * t).toFixed(2)})`;
    },
    onRangeChange(val: string) {
      this.range = val;
      this.rebuild();
    },
    onTypeChange(val: string | undefined) {
      this.type = val;
      this.rebuild();
    },
    onCityChange(val: number | undefined) {
      this.city = val;
      this.rebuild();
    },
    buildMonths() {
      let startYear = 2000;
      let endYear = 2019;
      if (this.range === "1319") startYear = 2013;
      if (this.range === "1519") startYear = 2015;
      const list: { year: number; month: number; label: string }[] = [];
      for (let y = startYear; y <= endYear; y++) {
        for (let m = 1; m <= 12; m++) {
          list.push({
            year: y,
            month: m,
            label: `${y}-${String(m).padStart(2, "0")}`
          });
        }
      }
      this.months = list;
    },
    async onProvince(adcode: number) {
      this.city = undefined;
      this.cities = adcode ? await api.cities(adcode) : [];
      this.rebuild();
    },
    async rebuild() {
      this.stopTimer();
      this.playing = false;
      this.buildMonths();
      this.idx = 0;
      this.cumulative = 0;
      await this.loadTrend();
      await this.loadFrame(0);
    },
    monthRange(i: number) {
      const m = this.months[i];
      if (!m) return { start: "", end: "" };
      const start = `${m.year}-${String(m.month).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
      const end = `${m.year}-${String(m.month).padStart(2, "0")}-${lastDay}`;
      return { start, end };
    },
    async loadFrame(i: number) {
      const m = this.months[i];
      if (!m) return;
      const { start, end } = this.monthRange(i);
      try {
        const fc = await api.points({
          start,
          end,
          type: this.type || "",
          province: this.province || "",
          city: this.city || "",
          limit: 2500
        });
        this.currentCount = fc.features.length;
        this.cumulative = this.monthlyRows.slice(0, i + 1).reduce((s, r) => s + r.total, 0);
        this.store.setMapConfig({
          mode: "animation",
          province: this.province || null,
          city: this.city || null,
          start,
          end,
          type: this.type || null,
          data: {
            features: fc.features,
            label: `${this.currentLabel} ｜ 当月 ${this.currentCount} 起案件${this.cityName ? "（" + this.cityName + "）" : ""}`,
            firstFrame: i === 0
          }
        });
        this.buildTrendMark();
        this.syncTimeline();
      } catch (e) {
        console.error(e);
      }
    },
    togglePlay() {
      if (this.playing) {
        this.playing = false;
        this.stopTimer();
      } else {
        this.playing = true;
        this.startTimer();
      }
    },
    startTimer() {
      this.stopTimer();
      this.timer = setInterval(() => {
        const next = this.idx + 1;
        if (next >= this.months.length) {
          this.idx = 0;
        } else {
          this.idx = next;
        }
        this.loadFrame(this.idx);
      }, SPEEDS[this.speed] || 800);
    },
    restartTimer() {
      if (this.playing) this.startTimer();
    },
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    jumpTo(i: number) {
      this.idx = i;
      this.loadFrame(i);
    },
    async loadTrend() {
      const first = this.months[0];
      const last = this.months[this.months.length - 1];
      if (!first || !last) return;
      const rows = await api.trend({
        dimension: "month",
        start: `${first.year}-01-01`,
        end: `${last.year}-12-31`,
        type: this.type || "",
        province: this.province || "",
        city: this.city || ""
      });
      this.monthlyRows = rows.filter((r) => r.label >= first.label && r.label <= last.label);
      this.buildTrendMark();
      this.syncTimeline();
    },
    buildTrendMark() {
      const rows = this.monthlyRows;
      const current = this.months[this.idx];
      const markIdx = current
        ? rows.findIndex((r) => r.year === current.year && r.month === current.month)
        : -1;
      this.trendOption = {
        tooltip: { trigger: "axis" },
        grid: { left: 36, right: 12, top: 18, bottom: 24 },
        xAxis: {
          type: "category",
          data: rows.map((r) => r.label),
          axisLabel: { interval: Math.max(1, Math.floor(rows.length / 12)), fontSize: 9 }
        },
        yAxis: { type: "value" },
        series: [
          {
            type: "line",
            smooth: true,
            data: rows.map((r) => r.total),
            itemStyle: { color: "#1677ff" },
            areaStyle: { opacity: 0.15 },
            markLine:
              markIdx >= 0
                ? {
                    symbol: "none",
                    label: { formatter: "当前", color: "#d4380d", fontSize: 10 },
                    lineStyle: { color: "#d4380d", width: 2 },
                    data: [{ xAxis: markIdx }]
                  }
                : undefined
          }
        ]
      };
    },
    syncTimeline() {
      this.store.setTimeline({
        months: this.months.map((m) => m.label),
        counts: this.monthlyRows.map((r) => r.total),
        idx: this.idx
      });
    }
  },
  watch: {
    "store.timelineJump.version"() {
      if (this.store.timelineJump.idx >= 0) {
        this.jumpTo(this.store.timelineJump.idx);
      }
    }
  },
  components: { Chart }
});
</script>

<style scoped>
.filter-bar {
  margin-bottom: 10px;
}
.player {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 0;
  margin-bottom: 10px;
}
.month-label {
  font-weight: 600;
  color: #1677ff;
  min-width: 86px;
  text-align: center;
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
  color: #eb2f96;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
.timeline {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #e8e8e8;
}
.timeline-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}
.timeline-title {
  font-weight: 600;
  color: #333;
}
.timeline-current {
  color: #1668dc;
  font-weight: 600;
}
.timeline-bar {
  position: relative;
  display: flex;
  gap: 1px;
  height: 26px;
}
.timeline-cell {
  flex: 1;
  min-width: 2px;
  cursor: pointer;
  transition: all 0.15s;
}
.timeline-cell:hover {
  transform: scaleY(1.25);
}
.timeline-cell.active {
  outline: 1px solid #1668dc;
}
.timeline-marker {
  position: absolute;
  top: -5px;
  bottom: -5px;
  width: 2px;
  background: #1668dc;
  transition: left 0.3s ease;
  pointer-events: none;
}
.timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: #999;
}
</style>
