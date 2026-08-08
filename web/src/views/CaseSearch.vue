<template>
  <div style="padding: 16px 20px">
    <a-card title="案情检索（全国裁判文书样本 + 本地录入）" :bordered="false">
      <div class="search-filters" style="margin-bottom: 12px">
        <a-input
          v-model:value="query.keyword"
          class="f-kw"
          placeholder="案号/地点/法院/城市"
          allowClear
          @pressEnter="doSearch"
        />
        <a-select v-model:value="query.type" class="f-type" placeholder="类型" allowClear>
          <a-select-option v-for="t in types" :key="t.type" :value="t.type">{{ t.type }}</a-select-option>
        </a-select>
        <a-select v-model:value="query.province" class="f-prov" placeholder="省份" allowClear @change="onProvince">
          <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
        </a-select>
        <a-select v-model:value="query.city" class="f-city" placeholder="地市" allowClear :disabled="!query.province">
          <a-select-option v-for="c in cities" :key="c.adcode" :value="c.adcode">{{ c.name }}</a-select-option>
        </a-select>
        <a-range-picker
          v-model:value="dateRange"
          class="f-time"
          format="YYYY-MM-DD"
          @change="onDateChange"
        />
        <a-button type="primary" class="f-btn" @click="doSearch"><a-icon type="search" />查询</a-button>
        <a-button class="f-reset" @click="reset"><a-icon type="reload" /></a-button>
      </div>

      <a-table
        :columns="columns"
        :dataSource="rows"
        :loading="loading"
        rowKey="key"
        size="small"
        :pagination="pagination"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'operation'">
            <a @click="showDetail(record)">详情</a>
            <a-popconfirm
              v-if="record.source === '录入'"
              title="确定删除这条录入案件吗？"
              @confirm="deleteCase(record)"
            >
              <a style="margin-left: 8px; color: #d4380d">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal title="案件详情" v-model:open="detailVisible" :footer="null">
      <table class="detail-table" v-if="current">
        <tbody>
          <tr><td class="label">案号</td><td>{{ current.caseNo }}</td></tr>
          <tr><td class="label">类型</td><td>{{ current.type }}</td></tr>
          <tr><td class="label">时间</td><td>{{ current.date }} {{ current.time }}</td></tr>
          <tr><td class="label">地区</td><td>{{ current.province }} / {{ current.city }}</td></tr>
          <tr><td class="label">法院</td><td>{{ current.court || "--" }}</td></tr>
          <tr><td class="label">地点</td><td>{{ current.address }}</td></tr>
          <tr><td class="label">坐标</td><td>{{ current.lng }}, {{ current.lat }}</td></tr>
          <tr><td class="label">数据来源</td><td>{{ current.source }}</td></tr>
        </tbody>
      </table>
      <div style="text-align: center; margin-top: 16px">
        <a-button type="primary" @click="gotoMap">在地图上查看</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import dayjs, { type Dayjs } from "dayjs";
import api from "@/api";
import { message } from "ant-design-vue";
import { useAppStore } from "@/store";

export default defineComponent({
  data() {
    return {
      provinces: [] as any[],
      cities: [] as any[],
      types: [] as any[],
      rows: [] as any[],
      loading: false,
      total: 0,
      page: 1,
      size: 20,
      query: {
        keyword: "",
        type: undefined as string | undefined,
        province: undefined as number | undefined,
        city: undefined as number | undefined,
        start: "",
        end: ""
      },
      dateRange: [] as Dayjs[],
      detailVisible: false,
      current: null as any,
      columns: [
        { title: "案号", dataIndex: "caseNo", key: "caseNo", width: 170 },
        { title: "类型", dataIndex: "type", key: "type", width: 90 },
        { title: "发案时间", dataIndex: "date", key: "date", width: 100 },
        { title: "地区", dataIndex: "city", key: "city", width: 100 },
        { title: "法院", dataIndex: "court", key: "court", ellipsis: true },
        { title: "来源", dataIndex: "source", key: "source", width: 80 },
        { title: "操作", dataIndex: "operation", key: "operation", width: 120 }
      ]
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  computed: {
    pagination() {
      return {
        current: this.page,
        pageSize: this.size,
        total: this.total,
        showSizeChanger: true,
        pageSizeOptions: ["10", "20", "50", "100"]
      };
    }
  },
  mounted() {
    Promise.all([api.provinces(), api.types()]).then(([ps, ts]) => {
      this.provinces = ps;
      this.types = ts;
    });
    this.doSearch();
  },
  methods: {
    onDateChange(dates: Dayjs[] | null, strings: [string, string]) {
      this.dateRange = dates || [];
      this.query.start = strings[0] || "";
      this.query.end = strings[1] || "";
    },
    async onProvince(adcode: number) {
      this.query.city = undefined;
      this.cities = adcode ? await api.cities(adcode) : [];
    },
    onTableChange(pg: any) {
      this.page = pg.current;
      this.size = pg.pageSize;
      this.doSearch();
    },
    async doSearch() {
      this.loading = true;
      try {
        const res = await api.cases({
          keyword: this.query.keyword || "",
          type: this.query.type || "",
          start: this.query.start || "",
          end: this.query.end || "",
          province: this.query.province || "",
          city: this.query.city || "",
          page: this.page,
          size: this.size
        });
        this.rows = res.rows || [];
        this.total = res.total || 0;
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },
    reset() {
      this.query = { keyword: "", type: undefined, province: undefined, city: undefined, start: "", end: "" };
      this.dateRange = [];
      this.page = 1;
      this.cities = [];
      this.doSearch();
    },
    showDetail(record: any) {
      this.current = record;
      this.detailVisible = true;
    },
    async deleteCase(record: any) {
      try {
        await api.deleteCase(record.id);
        message.success("已删除该录入案件");
        this.doSearch();
      } catch (e) {
        message.error("删除失败");
      }
    },
    gotoMap() {
      const c = this.current;
      if (!c) return;
      this.detailVisible = false;
      this.store.setShowSlide(false);
      this.store.setMapConfig({
        mode: "stats",
        province: c.provinceAdcode || null,
        city: c.cityAdcode || null,
        start: "2000-01-01",
        end: "2019-12-31",
        data: { focusCase: c }
      });
      this.$router.push("/general/DataStatistics");
    }
  }
});
</script>

<style scoped>
.search-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.search-filters .f-kw {
  flex: 0 0 250px;
  width: 250px;
}
.search-filters .f-type,
.search-filters .f-prov,
.search-filters .f-city {
  flex: 0 0 105px;
  width: 105px;
}
.search-filters .f-time {
  flex: 0 0 170px;
  width: 170px;
}
.search-filters .f-reset {
  flex: 0 0 34px;
  width: 34px;
  padding: 0;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
}
.detail-table td {
  border: 1px solid #e8e8e8;
  padding: 8px 10px;
  font-size: 13px;
}
.detail-table td.label {
  width: 80px;
  background: #fafafa;
  color: #666;
}
</style>
