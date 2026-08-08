<template>
  <div class="area-control">
    <a-form layout="inline" class="filter-bar">
      <a-form-item label="级别">
        <a-radio-group v-model:value="level" @change="onLevelChange">
          <a-radio-button value="province">省级</a-radio-button>
          <a-radio-button value="city">地市级</a-radio-button>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="省份" v-if="level === 'city'">
        <a-select v-model:value="province" style="width: 130px" @change="onProvinceChange" placeholder="请选择">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" size="small" @click="load">刷新</a-button>
      </a-form-item>
    </a-form>

    <a-alert
      v-if="level === 'city'"
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="地市级布控请先选择省份，地图将下钻到该省各地市"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num" style="color: #d4380d">{{ summary.redCount || 0 }}</div>
          <div class="kpi-label">红色预警</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num" style="color: #fa8c16">{{ summary.orangeCount || 0 }}</div>
          <div class="kpi-label">橙色预警</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num">{{ controlled.length }}</div>
          <div class="kpi-label">已布控区域</div>
        </div>
      </a-col>
    </a-row>

    <a-card size="small" title="预警区域列表" :bordered="false" style="margin-bottom: 12px">
      <a-table size="small" :columns="columns" :dataSource="rows" :pagination="{ pageSize: 5 }" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <a-tag :color="record.color">{{ record.label }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button v-if="!isControlled(record.id)" type="primary" size="small" ghost @click="addControl(record)">
              布控
            </a-button>
            <a-button v-else size="small" danger @click="removeControl(record.id)">解除</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card size="small" title="已布控区域" :bordered="false">
      <div v-for="c in controlled" :key="c.id" class="control-row">
        <span class="warn-dot" :style="{ background: c.color }"></span>
        <span>{{ c.name }}</span>
        <a-tag style="margin-left: 8px">{{ c.label }}</a-tag>
        <span style="margin-left: auto; color: #999; font-size: 12px">{{ c.value }} 起/月</span>
        <a-button size="small" danger style="margin-left: 8px" @click="removeControl(c.id)">解除</a-button>
      </div>
      <div v-if="!controlled.length" class="empty-tip">暂无布控区域</div>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import { useAppStore } from "@/store";
import { message } from "ant-design-vue";

export default defineComponent({
  name: "AreaControl",
  data() {
    return {
      level: "province",
      province: undefined as number | undefined,
      provinces: [] as any[],
      rows: [] as any[],
      summary: {} as any,
      controlled: [] as any[],
      columns: [
        { title: "地区", dataIndex: "name", key: "name" },
        { title: "上月", dataIndex: "lastValue", key: "lastValue", width: 70, align: "right" },
        { title: "预测", dataIndex: "value", key: "value", width: 70, align: "right" },
        { title: "变化", dataIndex: "changePct", key: "changePct", width: 70, align: "right" },
        { title: "等级", dataIndex: "level", key: "level", width: 110 },
        { title: "操作", dataIndex: "action", key: "action", width: 80 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("重点区域布控（全国）");
    api.provinces().then((ps) => (this.provinces = ps));
    this.load();
    this.loadControlled();
  },
  methods: {
    onLevelChange() {
      // antd-vue4 的 change 事件传的是事件对象，等级已由 v-model:value 更新
      this.load();
    },
    onProvinceChange(val: number | undefined) {
      this.province = val;
      this.load();
    },
    async load() {
      if (this.level === "city" && !this.province) {
        message.warning("地市级布控请先选择省份");
        return;
      }
      const res = await api.predict({ level: this.level, months: 1 });
      this.summary = res.summary || {};
      let items = res.items || [];
      if (this.level === "city" && this.province) {
        const prefix = String(this.province).slice(0, 2);
        items = items.filter(
          (x) => x.id === Number(this.province) || String(x.id).startsWith(prefix)
        );
        const count = (lv: string) => items.filter((x) => x.forecast[0].level === lv).length;
        this.summary = {
          redCount: count("red"),
          orangeCount: count("orange"),
          yellowCount: count("yellow"),
          normalCount: count("green"),
          regions: items.length
        };
      }
      this.rows = items
        .map((x) => ({
          id: x.id,
          name: x.name,
          provinceAdcode: x.provinceAdcode,
          center: x.center,
          lastValue: x.lastValue,
          value: x.forecast[0].value,
          changePct: `${x.forecast[0].changePct >= 0 ? "+" : ""}${x.forecast[0].changePct}%`,
          label: x.forecast[0].label,
          level: x.forecast[0].level,
          color: x.forecast[0].color
        }))
        .sort((a: any, b: any) => {
          const order: Record<string, number> = { red: 0, orange: 1, yellow: 2, green: 3 };
          return (order[a.level] || 4) - (order[b.level] || 4);
        });
      this.store.setMapConfig({
        mode: "predict",
        level: this.level,
        province: this.level === "city" ? this.province || null : null,
        city: null,
        data: { controlledRegions: this.controlled.slice() }
      });
    },
    async loadControlled() {
      try {
        this.controlled = await api.controlledList();
        this.syncMap();
      } catch (e) {
        console.error(e);
      }
    },
    isControlled(id: number) {
      return this.controlled.some((c) => c.id === id);
    },
    async addControl(record: any) {
      try {
        await api.addControlled({ ...record });
        message.success(`已布控：${record.name}`);
        await this.loadControlled();
        this.syncMap();
      } catch (e) {
        message.error("布控失败");
      }
    },
    async removeControl(id: number) {
      try {
        await api.deleteControlled(id);
        message.success("已解除布控");
        await this.loadControlled();
        this.syncMap();
      } catch (e) {
        message.error("解除失败");
      }
    },
    syncMap() {
      this.store.setMapConfig({
        mode: "predict",
        level: this.level,
        province: this.level === "city" ? this.province || null : null,
        city: null,
        data: { controlledRegions: this.controlled.slice() }
      });
    }
  }
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
}
.kpi-label {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}
.control-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed #f0f0f0;
}
.control-row:last-child {
  border-bottom: none;
}
.warn-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}
</style>
