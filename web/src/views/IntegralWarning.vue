<template>
  <div class="integral-warning">
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
        <a-button type="primary" size="small" :disabled="!city" @click="load">加载</a-button>
      </a-form-item>
    </a-form>

    <a-alert
      type="warning"
      show-icon
      style="margin-bottom: 10px"
      message="人员数据为演示模拟数据（脱敏），用于展示积分预警流程；接入实名数据后替换即可"
    />

    <a-row :gutter="12" class="kpi-row">
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num" style="color: #d4380d">{{ countBy("red") }}</div>
          <div class="kpi-label">高风险（≥85）</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num" style="color: #fa8c16">{{ countBy("orange") }}</div>
          <div class="kpi-label">中高风险（≥70）</div>
        </div>
      </a-col>
      <a-col :span="8">
        <div class="kpi">
          <div class="kpi-num" style="color: #faad14">{{ countBy("yellow") }}</div>
          <div class="kpi-label">关注（≥55）</div>
        </div>
      </a-col>
    </a-row>

    <a-card size="small" title="重点人员列表" :bordered="false">
      <a-table size="small" :columns="columns" :dataSource="persons" :pagination="{ pageSize: 8 }" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <a-tag :color="levelTag(record.level)">{{ levelText(record.level) }}</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "IntegralWarning",
  data() {
    return {
      provinces: [] as any[],
      cities: [] as any[],
      province: undefined as number | undefined,
      city: undefined as number | undefined,
      persons: [] as any[],
      columns: [
        { title: "姓名（脱敏）", dataIndex: "name", key: "name", width: 100 },
        { title: "类别", dataIndex: "type", key: "type" },
        { title: "风险积分", dataIndex: "score", key: "score", width: 90, align: "right" },
        { title: "等级", dataIndex: "level", key: "level", width: 110 },
        { title: "最后出现", dataIndex: "lastSeen", key: "lastSeen", width: 150 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("重点人员积分预警");
    api.provinces().then((ps) => (this.provinces = ps));
  },
  methods: {
    onCityChange(val: number | undefined) {
      this.city = val;
      this.load();
    },
    async onProvince(adcode: number) {
      this.city = undefined;
      this.persons = [];
      this.cities = adcode ? await api.cities(adcode) : [];
    },
    async load() {
      if (!this.city) return;
      const res = await api.persons({ city: this.city });
      this.persons = res.persons || [];
      this.store.setMapConfig({
        mode: "persons",
        province: this.province,
        city: this.city,
        data: res
      });
    },
    countBy(level: string) {
      return this.persons.filter((p: any) => p.level === level).length;
    },
    levelText(lv: string) {
      return lv === "red" ? "高风险" : lv === "orange" ? "中高风险" : lv === "yellow" ? "关注" : "一般";
    },
    levelTag(lv: string) {
      return lv === "red" ? "red" : lv === "orange" ? "orange" : lv === "yellow" ? "gold" : "green";
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
</style>
