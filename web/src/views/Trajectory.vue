<template>
  <div class="trajectory">
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
        <a-button type="primary" size="small" :disabled="!city" @click="load">分析轨迹</a-button>
      </a-form-item>
    </a-form>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 10px"
      message="轨迹为演示模拟数据；地图上展示近 7 天活动轨迹，颜色随风险等级"
    />

    <div v-if="!persons.length" class="empty-tip">请选择城市进行异常轨迹分析</div>

    <template v-if="persons.length">
      <a-card size="small" title="异常轨迹人员" :bordered="false">
        <a-table size="small" :columns="columns" :dataSource="persons" :pagination="false" rowKey="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'level'">
              <a-tag :color="levelTag(record.level)">{{ levelText(record.level) }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-card>

      <a-card size="small" title="轨迹说明" :bordered="false" style="margin-top: 12px">
        <p style="margin: 0; color: #666; font-size: 12px; line-height: 1.8">
          对高风险人员近 7 天活动轨迹进行时空聚类，若出现夜间跨区频繁移动、出现在高发案区域、短时间内多卡口往返等模式，自动标记为“异常轨迹”。当前城市共发现 {{ persons.length }} 名异常人员。
        </p>
      </a-card>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import api from "@/api";
import { useAppStore } from "@/store";

export default defineComponent({
  name: "Trajectory",
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
        { title: "异常模式", dataIndex: "pattern", key: "pattern", width: 140 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    this.store.setShowSlide(true);
    this.store.setCardTitle("重点人员异常轨迹分析");
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
      const patterns = ["夜间跨区移动", "频繁出入高发案区域", "短时多卡口往返", "夜间异常聚集", "昼伏夜出"];
      const persons = (res.persons || []).map((p, i) => {
        const traj: { lat: number; lng: number }[] = [];
        let lat = p.lat;
        let lng = p.lng;
        const steps = 5 + (i % 4);
        for (let s = 0; s < steps; s++) {
          traj.push({
            lat: Number((lat + (Math.random() - 0.5) * 0.03).toFixed(6)),
            lng: Number((lng + (Math.random() - 0.5) * 0.035).toFixed(6))
          });
          lat = traj[traj.length - 1].lat;
          lng = traj[traj.length - 1].lng;
        }
        return {
          ...p,
          pattern: patterns[(i + 1) % patterns.length],
          trajectory: traj
        };
      });
      this.persons = persons;
      this.store.setMapConfig({
        mode: "trajectory",
        province: this.province,
        city: this.city,
        data: { persons }
      });
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
</style>
