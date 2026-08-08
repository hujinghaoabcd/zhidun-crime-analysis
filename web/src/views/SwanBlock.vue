<template>
  <div class="swan-block">
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
      <a-form-item>
        <a-button type="primary" size="small" :disabled="!city" @click="load">加载卡口</a-button>
      </a-form-item>
    </a-form>

    <a-card size="small" title="已布控区域（联动）" :bordered="false" style="margin-bottom: 12px" :loading="controlledLoading">
      <div v-if="!controlled.length" class="empty-tip">暂无布控区域，请先到“重点区域布控”添加</div>
      <div v-for="c in controlled" :key="c.id" class="ctrl-row">
        <span class="warn-dot" :style="{ background: c.color }"></span>
        <span>{{ c.name }}</span>
        <a-tag style="margin-left: 8px">{{ c.label }}</a-tag>
        <span style="margin-left: auto">
          <a-button v-if="c.provinceAdcode" size="small" type="primary" ghost @click="loadControlledCheckpoints(c)">
            加载卡口
          </a-button>
          <a-tag v-else color="default">省级布控</a-tag>
        </span>
      </div>
    </a-card>

    <div v-if="!points.length && !loading" class="empty-tip">请选择城市查看卡口布防</div>

    <template v-if="points.length">
      <a-row :gutter="12" class="kpi-row">
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num">{{ points.length }}</div>
            <div class="kpi-label">卡口总数</div>
          </div>
        </a-col>
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num" style="color: #d4380d">{{ busyCount }}</div>
            <div class="kpi-label">繁忙卡口</div>
          </div>
        </a-col>
        <a-col :span="8">
          <div class="kpi">
            <div class="kpi-num">{{ records.length }}</div>
            <div class="kpi-label">今日拦截记录</div>
          </div>
        </a-col>
      </a-row>

      <a-card size="small" title="卡口点位" :bordered="false" style="margin-bottom: 12px">
        <a-table size="small" :columns="columns" :dataSource="points" :pagination="false" rowKey="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === '繁忙' ? 'red' : 'blue'">{{ record.status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button size="small" :type="isGuard(record.id) ? 'primary' : 'default'" @click="toggleGuard(record.id)">
                {{ isGuard(record.id) ? "已重点布防" : "重点布防" }}
              </a-button>
            </template>
          </template>
        </a-table>
      </a-card>

      <a-card size="small" title="拦截记录（演示）" :bordered="false">
        <div style="margin-bottom: 10px">
          <a-button size="small" @click="simulate">模拟拦截 1 条</a-button>
          <span style="margin-left: 8px; color: #999; font-size: 12px">车牌与人员均为随机演示数据</span>
        </div>
        <div v-for="(r, i) in records" :key="i" class="record-row">
          <a-tag color="red">{{ r.time }}</a-tag>
          <span style="margin-left: 8px">{{ r.plate }}</span>
          <span style="margin-left: 12px; color: #666">{{ r.checkpoint }}</span>
          <span style="margin-left: auto; color: #999; font-size: 12px">{{ r.reason }}</span>
        </div>
        <div v-if="!records.length" class="empty-tip">暂无拦截记录</div>
      </a-card>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import dayjs from "dayjs";
import api from "@/api";
import { useAppStore } from "@/store";
import { message } from "ant-design-vue";

export default defineComponent({
  name: "SwanBlock",
  data() {
    return {
      provinces: [] as any[],
      cities: [] as any[],
      province: undefined as number | undefined,
      city: undefined as number | undefined,
      points: [] as any[],
      loading: false,
      guards: [] as string[],
      records: [] as any[],
      controlled: [] as any[],
      controlledLoading: false,
      columns: [
        { title: "卡口名称", dataIndex: "name", key: "name" },
        { title: "状态", dataIndex: "status", key: "status", width: 80 },
        { title: "操作", dataIndex: "action", key: "action", width: 110 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {
    busyCount() {
      return this.points.filter((p: any) => p.status === "繁忙").length;
    }
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("卡口拦截（全国）");
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
    async loadControlledCheckpoints(c: any) {
      this.province = c.provinceAdcode;
      this.city = c.id;
      this.cities = await api.cities(c.provinceAdcode);
      await this.load();
    },
    onCityChange(val: number | undefined) {
      this.city = val;
      this.load();
    },
    async onProvince(adcode: number) {
      this.city = undefined;
      this.points = [];
      this.cities = adcode ? await api.cities(adcode) : [];
    },
    async load() {
      if (!this.city) return;
      this.loading = true;
      try {
        const res = await api.checkpoints({ city: this.city });
        this.points = res.points || [];
        if (this.controlled.some((c) => c.id === this.city)) {
          this.guards = res.points.map((p: any) => p.id);
          message.success("该城市已布控，卡口已全部重点布防");
        }
        this.store.setMapConfig({
          mode: "checkpoints",
          province: this.province,
          city: this.city,
          data: res
        });
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },
    isGuard(id: string) {
      return this.guards.includes(id);
    },
    toggleGuard(id: string) {
      if (this.isGuard(id)) this.guards = this.guards.filter((x) => x !== id);
      else this.guards.push(id);
    },
    simulate() {
      const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      const plate =
        String(this.city).slice(0, 2) +
        pick(letters) +
        pick(letters) +
        String(Math.floor(Math.random() * 10)) +
        String(Math.floor(Math.random() * 10)) +
        String(Math.floor(Math.random() * 10)) +
        String(Math.floor(Math.random() * 10));
      const cp = this.points[Math.floor(Math.random() * this.points.length)];
      this.records.unshift({
        time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        plate,
        checkpoint: cp ? cp.name : "未知卡口",
        reason: Math.random() > 0.5 ? "套牌嫌疑" : "人员比对命中"
      });
    }
  }
});

function pick(s: string) {
  return s[Math.floor(Math.random() * s.length)];
}
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
  color: #1677ff;
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
.record-row {
  display: flex;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 13px;
}
.record-row:last-child {
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
</style>
