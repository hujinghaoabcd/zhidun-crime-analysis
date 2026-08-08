<template>
  <div style="padding: 16px 20px">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="提交后写入本地服务端文件，重启不丢失；本系统为测试演示用途。"
    />
    <a-card title="案情录入（全国）" :bordered="false">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="案件编号">
              <a-input v-model:value="form.caseNo" placeholder="如：（2020）皖0502刑初123号" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="案件类型" required>
              <a-select v-model:value="form.type" placeholder="请选择类型">
                <a-select-option v-for="t in types" :key="t.type" :value="t.type">{{ t.type }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="发案日期" required>
              <a-date-picker v-model:value="form.date" style="width: 100%" format="YYYY-MM-DD" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="发案时间">
              <a-time-picker v-model:value="form.time" style="width: 100%" format="HH:mm" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="承办法院">
              <a-input v-model:value="form.court" placeholder="如：广州市人民法院" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="省份" required>
              <a-select v-model:value="form.provinceAdcode" placeholder="请选择省份" @change="onProvince">
                <a-select-option v-for="p in provinces" :key="p.adcode" :value="p.adcode">{{ p.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="地市" required>
              <a-select v-model:value="form.cityAdcode" placeholder="请选择地市">
                <a-select-option v-for="c in cities" :key="c.adcode" :value="c.adcode">{{ c.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="录入警员">
              <a-input v-model:value="form.officer" :placeholder="store.user.name" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="案发地点" required>
              <a-input v-model:value="form.address" placeholder="街道 / 门牌 / 小区，将自动匹配到地市中心坐标" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="案件描述">
              <a-textarea v-model:value="form.description" :rows="3" placeholder="简要描述案情" />
            </a-form-item>
          </a-col>
        </a-row>
        <div style="text-align: center">
          <a-button type="primary" :loading="submitting" @click="submit">
            <a-icon type="check" />提交
          </a-button>
          <a-button style="margin-left: 8px" @click="reset">重置</a-button>
        </div>
      </a-form>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import dayjs, { type Dayjs } from "dayjs";
import { message } from "ant-design-vue";
import api from "@/api";
import { useAppStore } from "@/store";

export default defineComponent({
  data() {
    return {
      provinces: [] as any[],
      cities: [] as any[],
      types: [] as any[],
      submitting: false,
      form: {
        caseNo: "",
        type: undefined as string | undefined,
        date: dayjs() as Dayjs,
        time: dayjs("12:00", "HH:mm") as Dayjs,
        court: "",
        provinceAdcode: undefined as number | undefined,
        cityAdcode: undefined as number | undefined,
        address: "",
        description: "",
        officer: ""
      }
    };
  },
  setup() {
    return { store: useAppStore() };
  },
  mounted() {
    Promise.all([api.provinces(), api.types()]).then(([ps, ts]) => {
      this.provinces = ps;
      this.types = ts;
    });
  },
  methods: {
    async onProvince(adcode: number) {
      this.form.cityAdcode = undefined;
      this.cities = adcode ? await api.cities(adcode) : [];
    },
    async submit() {
      const f = this.form;
      if (!f.type || !f.date || !f.provinceAdcode || !f.cityAdcode || !f.address) {
        message.warning("请填写类型、日期、省份、地市和案发地点");
        return;
      }
      const city = this.cities.find((c) => c.adcode === f.cityAdcode);
      const province = this.provinces.find((p) => p.adcode === f.provinceAdcode);
      this.submitting = true;
      try {
        const res = await api.addCase({
          caseNo: f.caseNo,
          type: f.type,
          date: f.date.format("YYYY-MM-DD"),
          time: f.time.format("HH:mm"),
          court: f.court,
          province: province ? province.name : "",
          provinceAdcode: f.provinceAdcode,
          city: city ? city.name : "",
          cityAdcode: f.cityAdcode,
          address: f.address,
          description: f.description,
          lng: city ? city.center[0] : 0,
          lat: city ? city.center[1] : 0
        });
        message.success(`录入成功：${res.data.caseNo}（${res.data.type}）`);
        this.reset();
      } catch (e) {
        message.error("录入失败，请确认后端已启动");
      } finally {
        this.submitting = false;
      }
    },
    reset() {
      this.form = {
        caseNo: "",
        type: undefined,
        date: dayjs(),
        time: dayjs("12:00", "HH:mm"),
        court: "",
        provinceAdcode: undefined,
        cityAdcode: undefined,
        address: "",
        description: "",
        officer: ""
      };
      this.cities = [];
    }
  }
});
</script>
