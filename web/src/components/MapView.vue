<template>
  <div class="national-map">
    <div id="map"></div>
    <div class="map-legend" v-if="legendItems.length">
      <div class="legend-title">{{ legendTitle }}</div>
      <div v-for="(item, i) in legendItems" :key="i" class="legend-row">
        <span class="legend-color" :style="{ background: item.color }"></span>
        <span>{{ item.label }}</span>
      </div>
    </div>
    <div class="map-tip" v-if="tip">{{ tip }}</div>
    <div class="palette-control" v-if="store.mapConfig.mode === 'social'">
      <button class="palette-btn" @click="paletteOpen = !paletteOpen">
        <a-icon type="bg-colors" /> 配色
      </button>
      <div class="palette-menu" v-if="paletteOpen">
        <div
          v-for="p in PALETTES"
          :key="p.key"
          class="palette-item"
          :class="{ on: p.key === paletteKey }"
          @click="choosePalette(p.key)"
        >
          <span class="palette-bar" :style="paletteBarStyle(p)"></span>
          <span>{{ p.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import api, { type FeatureCollection, type PredictResult } from "@/api";
import { useAppStore, type MapConfig } from "@/store";

const store = useAppStore();
let heatReady: Promise<unknown> | null = null;

async function ensureHeat() {
  if (!heatReady) {
    (window as any).L = L;
    // @ts-ignore leaflet.heat 为无类型声明的老式插件
    heatReady = import("leaflet.heat");
  }
  await heatReady;
}

const CHINA_BOUNDS: L.LatLngBoundsExpression = [
  [17.5, 73],
  [54.5, 135.2]
];

const MUNI_ADCODES = [110000, 120000, 310000, 500000];

const LEVEL_COLORS: Record<string, string> = {
  red: "#d4380d",
  orange: "#fa8c16",
  yellow: "#fadb14",
  green: "#52c41a"
};

const TYPE_COLORS: Record<string, string> = {
  盗窃: "#3498db",
  抢劫: "#9b59b6",
  抢夺: "#1abc9c",
  诈骗: "#f1c40f",
  故意伤害: "#e67e22",
  寻衅滋事: "#2ecc71",
  贩毒吸毒: "#8e44ad",
  掩饰隐瞒犯罪所得: "#d35400",
  危险驾驶: "#00bcd4",
  交通肇事: "#27ae60",
  敲诈勒索: "#5c6bc0",
  非法拘禁: "#16a085",
  其他: "#95a5a6"
};

const PALETTES = [
  { key: "teal", name: "青绿", stops: [[0, [224, 242, 241]], [0.3, [128, 203, 196]], [0.6, [38, 166, 154]], [0.85, [0, 105, 92]], [1, [0, 61, 51]]] },
  { key: "blue", name: "蓝", stops: [[0, [232, 240, 254]], [0.3, [144, 202, 249]], [0.6, [66, 133, 244]], [0.85, [30, 111, 217]], [1, [11, 42, 91]]] },
  { key: "bluepurple", name: "蓝紫", stops: [[0, [237, 231, 246]], [0.3, [179, 157, 219]], [0.6, [124, 77, 185]], [0.85, [94, 53, 177]], [1, [49, 27, 146]]] },
  { key: "purple", name: "紫", stops: [[0, [243, 229, 245]], [0.3, [206, 147, 216]], [0.6, [156, 39, 176]], [0.85, [106, 27, 154]], [1, [74, 20, 140]]] },
  { key: "orange", name: "暖橙", stops: [[0, [255, 248, 225]], [0.3, [255, 224, 130]], [0.6, [255, 152, 0]], [0.85, [230, 81, 0]], [1, [139, 42, 0]]] },
  { key: "redyellow", name: "红黄", stops: [[0, [255, 251, 204]], [0.3, [255, 235, 59]], [0.6, [255, 152, 0]], [0.85, [244, 67, 54]], [1, [183, 28, 28]]] },
  { key: "grayblue", name: "冷灰蓝", stops: [[0, [236, 240, 245]], [0.3, [176, 190, 197]], [0.6, [120, 144, 156]], [0.85, [69, 90, 100]], [1, [38, 50, 56]]] },
  { key: "pinkpurple", name: "粉紫", stops: [[0, [252, 228, 236]], [0.3, [244, 143, 177]], [0.6, [233, 30, 99]], [0.85, [173, 20, 87]], [1, [74, 20, 140]]] }
];

const SOCIAL_LABELS: Record<string, string> = {
  composite: "综合社会指数",
  population: "常住人口",
  house: "房价",
  poi: "POI 繁华度指数"
};

function colorScale(v: number, min: number, max: number): string {
  if (max <= min) return "#e8e8e8";
  const t = Math.log(1 + v - min) / Math.log(1 + max - min);
  const stops: [number, [number, number, number]][] = [
    [0, [232, 245, 233]],
    [0.25, [255, 251, 204]],
    [0.5, [255, 217, 102]],
    [0.75, [255, 152, 0]],
    [1, [211, 47, 47]]
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const p = a[0] === b[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * p));
  return `rgb(${c.join(",")})`;
}

function socialColorScale(v: number, min: number, max: number): string {
  if (max <= min) return "#e8f0fe";
  const t = Math.log(1 + v - min) / Math.log(1 + max - min);
  const stops = activePalette.value.stops as [number, [number, number, number]][];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const p = a[0] === b[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * p));
  return `rgb(${c.join(",")})`;
}

interface LegendItem {
  color: string;
  label: string;
}

const map = ref<L.Map | null>(null);
const layerGroup = ref<L.LayerGroup | null>(null);
const provinceGeo = ref<Record<string, any> | null>(null);
const legendItems = ref<LegendItem[]>([]);
const legendTitle = ref("");
const tip = ref("");
const paletteKey = ref("pinkpurple");
const paletteOpen = ref(false);
const activePalette = computed(
  () => PALETTES.find((p) => p.key === paletteKey.value) || PALETTES[0]
);

function paletteBarStyle(p: (typeof PALETTES)[number]) {
  const colors = p.stops.map((s) => `rgb(${s[1][0]}, ${s[1][1]}, ${s[1][2]})`);
  return { background: `linear-gradient(90deg, ${colors.join(", ")})` };
}

function choosePalette(key: string) {
  paletteKey.value = key;
  paletteOpen.value = false;
  render();
}

async function getProvinceGeo(): Promise<Record<string, any>> {
  if (provinceGeo.value) return provinceGeo.value;
  const res = await fetch("/geojson/china_provinces.json");
  provinceGeo.value = await res.json();
  return provinceGeo.value;
}

async function getCityGeo(adcode: number): Promise<Record<string, any> | null> {
  const res = await fetch(`/geojson/cities_${adcode}.json`);
  if (!res.ok) return null;
  return await res.json();
}

function initMap() {
  if (map.value) return;
  const gaode = L.tileLayer(
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    { subdomains: "1234", maxZoom: 18 }
  );
  const gaodeImg = L.tileLayer(
    "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
    { subdomains: "1234", maxZoom: 18 }
  );
  const terrain = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  });
  const m = L.map("map", {
    center: [35.5, 104.5],
    zoom: 4,
    layers: [gaode],
    zoomControl: false,
    attributionControl: false,
    minZoom: 3,
    maxZoom: 18
  });
  m.fitBounds(CHINA_BOUNDS);
  L.control
    .layers({
      "高德矢量（中文标注）": gaode,
      "高德影像（卫星图）": gaodeImg,
      "OSM（备用）": terrain
    })
    .addTo(m);
  L.control.zoom({ position: "topright" }).addTo(m);
  map.value = m;
  layerGroup.value = L.layerGroup().addTo(m);
  render();
}

function bindChinaLabel(l: L.Layer, name: string) {
  if ("bindTooltip" in l && typeof (l as any).bindTooltip === "function") {
    (l as any).bindTooltip(name, {
      permanent: true,
      direction: "center",
      className: "china-label",
      opacity: 0.95
    });
  }
}

async function renderStats(cfg: MapConfig) {
  const focusCase = cfg.data && cfg.data.focusCase;
  if (focusCase) {
    renderFocusCase(cfg, focusCase);
    return;
  }
  const geo = await getProvinceGeo();
  const level = cfg.province ? "city" : cfg.level || "province";
  let values: any[] = [];
  let geoData = geo;
  let title = "各省案件总量";
  if (level === "city") {
    values = await api.rank({
      by: "city",
      province: cfg.province,
      limit: 500,
      start: cfg.start,
      end: cfg.end,
      type: cfg.type || ""
    });
    const cityGeo = await getCityGeo(cfg.province as number);
    if (cityGeo) {
      geoData = cityGeo;
      map.value?.flyToBounds(L.geoJSON(cityGeo).getBounds().pad(0.05), { duration: 0.8 });
    }
    title = `${values[0] ? values[0].province : ""}各地市案件总量`;
  } else {
    values = await api.rank({
      by: "province",
      limit: 500,
      start: cfg.start,
      end: cfg.end,
      type: cfg.type || ""
    });
    map.value?.flyToBounds(CHINA_BOUNDS, { duration: 0.8 });
  }
  const byAdcode = new Map<number, number>(values.map((x) => [x.adcode, x.total]));
  const isMuni = level === "city" && cfg.province && MUNI_ADCODES.includes(Number(cfg.province));
  const totals = values.map((x) => x.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);

  L.geoJSON(geoData, {
    style: (f) => {
      const ad = (f.properties as any).adcode as number;
      const v = byAdcode.get(ad) || (isMuni ? byAdcode.get(Number(cfg.province)) || 0 : 0);
      return {
        color: "#ffffff",
        weight: 1,
        fillColor: v > 0 ? colorScale(v, min, max) : "#f0f0f0",
        fillOpacity: 0.75
      };
    },
    onEachFeature: (f, l) => {
      const ad = (f.properties as any).adcode as number;
      const v = byAdcode.get(ad) || (isMuni ? byAdcode.get(Number(cfg.province)) || 0 : 0);
      bindChinaLabel(l, (f.properties as any).name);
      l.bindPopup(
        `<b>${(f.properties as any).name}</b><br>案件数: ${v}<br><span style="color:#999">点击下钻到地市</span>`
      );
      l.on("click", () => {
        if (level === "province") {
          store.setMapConfig({
            mode: "stats",
            province: ad,
            city: null,
            start: store.mapConfig.start,
            end: store.mapConfig.end,
            type: store.mapConfig.type
          });
        } else if (ad) {
          store.patchMapConfig({ city: ad });
        }
      });
    }
  }).addTo(layerGroup.value!);

  legendTitle.value = title;
  legendItems.value = [
    { color: colorScale(min, min, max), label: `低（${min}）` },
    { color: colorScale((min + max) / 2, min, max), label: "中" },
    { color: colorScale(max, min, max), label: `高（${max}）` },
    { color: "#f0f0f0", label: "无数据" }
  ];

  if (cfg.city) {
    const pts = await api.points({
      start: cfg.start,
      end: cfg.end,
      type: cfg.type || "",
      city: cfg.city,
      limit: 2000
    });
    L.geoJSON(pts, {
      pointToLayer: (f, latlng) =>
        L.circleMarker(latlng, {
          radius: 2.5,
          color: "#d4380d",
          weight: 1,
          fillOpacity: 0.55
        }),
      onEachFeature: (f, l) => {
        const p = f.properties || {};
        l.bindPopup(`${p.date} ${p.time}<br>${p.type}<br>${p.address}`);
      }
    }).addTo(layerGroup.value!);
    const cityName = values.find((x) => x.adcode === cfg.city);
    tip.value = `${cityName ? cityName.name : "当前城市"}：显示案件点位`;
  }

}

function renderFocusCase(cfg: MapConfig, fc: Record<string, any>) {
  const lat = Number(fc.lat);
  const lng = Number(fc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const marker = L.circleMarker([lat, lng], {
    radius: 9,
    color: "#fff",
    weight: 2,
    fillColor: "#d4380d",
    fillOpacity: 0.9
  }).addTo(layerGroup.value!);
  marker
    .bindPopup(
      `<b>${fc.caseNo || "案件"}</b><br>` +
        `${fc.date || ""} ${fc.time || ""}<br>` +
        `${fc.type || ""}<br>` +
        `${fc.province || ""} / ${fc.city || ""}<br>` +
        `${fc.address || ""}`
    )
    .openPopup();
  map.value?.flyTo([lat, lng], 13, { duration: 1 });
  tip.value = `定位到案件：${fc.caseNo || ""}`;
  legendItems.value = [];
  legendTitle.value = "";
}

async function renderHeat(cfg: MapConfig) {
  await ensureHeat();
  const cells = await api.heatmap({
    start: cfg.start,
    end: cfg.end,
    type: cfg.type || "",
    province: cfg.province || "",
    city: cfg.city || "",
    grid: cfg.grid || 0.5
  });
  if (!cells.length) {
    tip.value = "当前条件下无热力数据";
    return;
  }
  const maxCount = Math.max(...cells.map((c) => c.count));
  const points = cells.map(
    (c) =>
      [
        c.lat,
        c.lng,
        maxCount > 0 ? Math.log(1 + c.count) / Math.log(1 + maxCount) : 0
      ] as [number, number, number]
  );
  L.heatLayer(points, {
    radius: 20,
    blur: 9,
    maxZoom: 14,
    minOpacity: 0.3,
    gradient: {
      0.12: "#2196f3",
      0.35: "#00bcd4",
      0.6: "#4caf50",
      0.8: "#ffeb3b",
      0.92: "#ff9800",
      1: "#f44336"
    }
  }).addTo(layerGroup.value!);
  legendTitle.value = "犯罪热力";
  legendItems.value = [
    { color: "#2196f3", label: "低" },
    { color: "#00bcd4", label: "较低" },
    { color: "#4caf50", label: "中" },
    { color: "#ffeb3b", label: "较高" },
    { color: "#ff9800", label: "高" },
    { color: "#f44336", label: "极高" }
  ];
  if (!cfg.province) map.value?.flyToBounds(CHINA_BOUNDS, { duration: 0.6 });
}

async function renderPredict(cfg: MapConfig) {
  const level = cfg.level || "province";
  let pred: PredictResult;
  if (cfg.data && cfg.data.predictItems) {
    pred = {
      items: cfg.data.predictItems,
      forecastFrom: cfg.data.forecastFrom || "2020-01",
      summary: cfg.data.summary || {},
      model: "多模型集成",
      level,
      months: 1,
      quality: { window: "", samples: 0, mape: null, accuracy: null }
    } as PredictResult;
  } else {
    pred = await api.predict({ level, months: 1 });
  }
  const geo = await getProvinceGeo();
  let geoData = geo;
  if (level === "city") {
    const cityGeo = await getCityGeo(cfg.province as number);
    if (cityGeo) {
      geoData = cityGeo;
      map.value?.flyToBounds(L.geoJSON(cityGeo).getBounds().pad(0.05), { duration: 0.8 });
    }
  } else {
    map.value?.flyToBounds(CHINA_BOUNDS, { duration: 0.6 });
  }
  const byId = new Map(pred.items.map((x) => [x.id, x]));
  const isMuni = level === "city" && cfg.province && MUNI_ADCODES.includes(Number(cfg.province));
  L.geoJSON(geoData, {
    style: (f) => {
      const item =
        byId.get((f.properties as any).adcode as number) ||
        (isMuni ? byId.get(Number(cfg.province)) : undefined);
      const lv = item ? item.forecast[0].level : "green";
      return {
        color: "#ffffff",
        weight: 1,
        fillColor: LEVEL_COLORS[lv] || "#52c41a",
        fillOpacity: 0.72
      };
    },
    onEachFeature: (f, l) => {
      const item =
        byId.get((f.properties as any).adcode as number) ||
        (isMuni ? byId.get(Number(cfg.province)) : undefined);
      if (!item) return;
      const fc = item.forecast[0];
      bindChinaLabel(l, item.name);
      l.bindPopup(
        `<b>${item.name}</b><br>` +
          `基准值: ${item.lastValue}<br>` +
          `预测 ${fc.year}-${fc.month}: <b>${fc.value}</b>（${fc.changePct >= 0 ? "+" : ""}${fc.changePct}%）<br>` +
          `<span style="color:${fc.color}">● ${fc.label}</span><br>` +
          `趋势: ${item.trendPct >= 0 ? "+" : ""}${item.trendPct}%`
      );
    }
  }).addTo(layerGroup.value!);
  const controlled = (cfg.data && cfg.data.controlledRegions) || [];
  if (controlled.length) {
    for (const c of controlled) {
      const item = byId.get(Number(c.id));
      const center = c.center || (item && item.center);
      if (center) {
        L.circleMarker([center.lat, center.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#1668dc",
          fillOpacity: 0.95,
          className: "controlled-marker"
        })
          .bindPopup(`<b>${c.name}</b><br>已布控 · ${c.label || "重点区域"}`)
          .addTo(layerGroup.value!);
      }
    }
    legendItems.value.push({ color: "#1668dc", label: "已布控区域" });
  }
  const focusId = cfg.data && cfg.data.focusRegion;
  if (focusId) {
    const item = byId.get(Number(focusId));
    if (item && item.center) {
      map.value?.flyTo([item.center.lat, item.center.lng], level === "city" ? 9 : 6, {
        duration: 1
      });
    }
  }
  const s = pred.summary || {};
  legendTitle.value = `${pred.forecastFrom} 预测（${level === "city" ? "地市级" : "省级"}·四色预警）`;
  legendItems.value = [
    { color: "#d4380d", label: `红色预警 ${s.redCount || 0}` },
    { color: "#fa8c16", label: `橙色预警 ${s.orangeCount || 0}` },
    { color: "#fadb14", label: `黄色预警 ${s.yellowCount || 0}` },
    { color: "#52c41a", label: `正常 ${s.normalCount || 0}` }
  ];
}

async function renderPatrol(cfg: MapConfig) {
  const plan = await api.patrol({ city: cfg.city, start: cfg.start, end: cfg.end, type: cfg.type || "" });
  if (!plan) {
    tip.value = "请先选择城市";
    return;
  }
  if (cfg.province) {
    const cityGeo = await getCityGeo(cfg.province);
    if (cityGeo) {
      L.geoJSON(cityGeo, {
        style: { color: "#999", weight: 1, fill: false, dashArray: "4 4" }
      }).addTo(layerGroup.value!);
    }
  }
  for (const c of plan.clusters) {
    L.circleMarker([c.lat, c.lng], {
      radius: 6 + Math.min(16, c.count / 8),
      color: "#fff",
      weight: 2,
      fillColor: LEVEL_COLORS[c.level] || "#fadb14",
      fillOpacity: 0.85
    }).bindPopup(`热点 ${c.id}：${c.count} 起案件`).addTo(layerGroup.value!);
  }
  if (plan.route.length > 1) {
    L.polyline(
      plan.route.map((p) => [p.lat, p.lng] as [number, number]),
      { color: "#1677ff", weight: 4, opacity: 0.9, dashArray: "8 8" }
    ).bindPopup(`推荐巡逻路线（连接 ${plan.clusters.length} 个热点）`).addTo(layerGroup.value!);
  }
  for (const s of plan.stations) {
    L.circleMarker([s.lat, s.lng], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#2f54eb",
      fillOpacity: 1
    }).bindPopup(`派出所：${s.name}<br>${s.address}`).addTo(layerGroup.value!);
  }
  if (plan.clusters.length) {
    map.value?.flyToBounds(
      L.featureGroup(plan.clusters.map((c) => L.circleMarker([c.lat, c.lng]))).getBounds().pad(0.2),
      { duration: 0.8 }
    );
  }
  legendTitle.value = `${plan.city} 出警规划`;
  legendItems.value = [
    { color: "#d4380d", label: "一级热点（≥30起）" },
    { color: "#fa8c16", label: "二级热点（≥15起）" },
    { color: "#fadb14", label: "三级热点（≥3起）" },
    { color: "#2f54eb", label: "派出所" },
    { color: "#1677ff", label: "推荐巡逻路线" }
  ];
}

function renderAnimation(cfg: MapConfig) {
  const data = (cfg.data && (cfg.data.features as FeatureCollection["features"])) || [];
  if (cfg.data && cfg.data.firstFrame) {
    if (cfg.city && data.length) {
      const bounds = L.featureGroup(
        data.map((f) => L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]]))
      ).getBounds().pad(0.15);
      map.value?.flyToBounds(bounds, { duration: 0.8 });
    } else {
      map.value?.flyToBounds(CHINA_BOUNDS, { duration: 0.6 });
    }
  }
  for (const f of data) {
    const p = f.properties || {};
    L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
      radius: 5,
      color: "#fff7d6",
      weight: 1.2,
      fillColor: "#f6c343",
      fillOpacity: 0.95,
      className: "crime-point"
    }).bindPopup(`${p.date} ${p.time}<br>${p.type}<br>${p.city}<br>${p.address}`).addTo(layerGroup.value!);
  }
  legendTitle.value = "犯罪动态播放";
  legendItems.value = [{ color: "#f6c343", label: "当月案件点" }];
  tip.value = (cfg.data && cfg.data.label) || "";
}

function renderPersons(cfg: MapConfig) {
  const list = (cfg.data && (cfg.data.persons as any[])) || [];
  if (!list.length) {
    tip.value = "当前城市暂无重点人员";
    return;
  }
  for (const p of list) {
    L.circleMarker([p.lat, p.lng], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: LEVEL_COLORS[p.level] || "#52c41a",
      fillOpacity: 0.9
    }).bindPopup(`<b>${p.name}</b><br>类别: ${p.type}<br>积分: ${p.score}<br>最后出现: ${p.lastSeen}`).addTo(layerGroup.value!);
  }
  map.value?.flyToBounds(
    L.featureGroup(list.map((p) => L.circleMarker([p.lat, p.lng]))).getBounds().pad(0.3),
    { duration: 0.7 }
  );
  legendTitle.value = "重点人员";
  legendItems.value = [
    { color: "#d4380d", label: "高风险 ≥85" },
    { color: "#fa8c16", label: "中高风险 ≥70" },
    { color: "#fadb14", label: "关注 ≥55" },
    { color: "#52c41a", label: "一般 <55" }
  ];
}

function renderTrajectory(cfg: MapConfig) {
  const persons = (cfg.data && (cfg.data.persons as any[])) || [];
  let count = 0;
  for (const p of persons) {
    if (!p.trajectory || !p.trajectory.length) continue;
    const pts = p.trajectory.map((t: any) => [t.lat, t.lng] as [number, number]);
    L.polyline(pts, {
      color: LEVEL_COLORS[p.level] || "#fa8c16",
      weight: 3,
      opacity: 0.85
    }).bindPopup(`${p.name}（${p.type}）异常轨迹`).addTo(layerGroup.value!);
    L.circleMarker(pts[pts.length - 1], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: LEVEL_COLORS[p.level] || "#fa8c16",
      fillOpacity: 0.9
    }).bindPopup(`最后位置: ${p.name}`).addTo(layerGroup.value!);
    count += 1;
  }
  legendTitle.value = "重点人员异常轨迹";
  legendItems.value = [
    { color: "#d4380d", label: "高风险" },
    { color: "#fa8c16", label: "中高风险" },
    { color: "#fadb14", label: "关注" },
    { color: "#52c41a", label: "一般" }
  ];
  if (!count) tip.value = "当前城市暂无轨迹数据";
}

function renderCheckpoints(cfg: MapConfig) {
  const points = (cfg.data && (cfg.data.points as any[])) || [];
  if (!points.length) {
    tip.value = "当前城市暂无卡口";
    return;
  }
  for (const c of points) {
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: "cp-icon",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${c.status === "繁忙" ? "#d4380d" : "#1677ff"};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18]
      })
    }).bindPopup(`${c.name}<br>状态: ${c.status}`).addTo(layerGroup.value!);
  }
  map.value?.flyToBounds(
    L.featureGroup(points.map((p) => L.marker([p.lat, p.lng]))).getBounds().pad(0.4),
    { duration: 0.7 }
  );
  legendTitle.value = "卡口拦截点位";
  legendItems.value = [
    { color: "#d4380d", label: "繁忙" },
    { color: "#1677ff", label: "正常" }
  ];
}

async function render() {
  if (!map.value || !layerGroup.value) return;
  const version = store.mapConfig.version;
  const cfg = store.mapConfig;
  layerGroup.value.clearLayers();
  legendItems.value = [];
  legendTitle.value = "";
  tip.value = "";
  try {
    if (cfg.mode === "stats") await renderStats(cfg);
    else if (cfg.mode === "heat") await renderHeat(cfg);
    else if (cfg.mode === "predict") await renderPredict(cfg);
    else if (cfg.mode === "patrol") await renderPatrol(cfg);
    else if (cfg.mode === "animation") renderAnimation(cfg);
    else if (cfg.mode === "social") await renderSocial(cfg);
    else if (cfg.mode === "persons") renderPersons(cfg);
    else if (cfg.mode === "trajectory") renderTrajectory(cfg);
    else if (cfg.mode === "checkpoints") renderCheckpoints(cfg);
  } catch (e) {
    console.error("map render error", e);
    tip.value = "地图数据加载失败，请刷新重试";
  }
  // 渲染期间配置已变化：本次结果过期，丢弃并重绘
  if (store.mapConfig.version !== version) {
    render();
  }
}

async function renderSocial(cfg: MapConfig) {
  const geo = await getProvinceGeo();
  const indicator = cfg.indicator || "composite";
  const res = await api.social({ indicator });
  const byAdcode = new Map(res.items.map((x) => [x.adcode, x.value]));
  const vals = res.items.map((x) => x.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  L.geoJSON(geo, {
    style: (f) => {
      const ad = (f.properties as any).adcode as number;
      const v = byAdcode.get(ad);
      return {
        color: "#ffffff",
        weight: 1,
        fillColor: v === undefined ? "#f0f0f0" : socialColorScale(v, min, max),
        fillOpacity: 0.78
      };
    },
    onEachFeature: (f, l) => {
      const ad = (f.properties as any).adcode as number;
      const v = byAdcode.get(ad);
      bindChinaLabel(l, (f.properties as any).name);
      l.bindPopup(
        `<b>${(f.properties as any).name}</b><br>` +
          `${SOCIAL_LABELS[indicator] || "社会指数"}: ${v === undefined ? "--" : v} ${res.unit}`
      );
    }
  }).addTo(layerGroup.value!);
  map.value?.flyToBounds(CHINA_BOUNDS, { duration: 0.6 });
  legendTitle.value = `${SOCIAL_LABELS[indicator] || "社会指数"}（${res.unit}）`;
  legendItems.value = [
    { color: socialColorScale(min, min, max), label: `低（${min}）` },
    { color: socialColorScale((min + max) / 2, min, max), label: "中" },
    { color: socialColorScale(max, min, max), label: `高（${max}）` },
    { color: "#f0f0f0", label: "无数据" }
  ];
}

watch(
  () => store.mapConfig.version,
  () => render()
);

onMounted(() => {
  setTimeout(() => initMap(), 50);
});

onBeforeUnmount(() => {
  map.value?.remove();
  map.value = null;
});
</script>

<style scoped>
.national-map {
  position: relative;
  width: 100%;
  height: 100%;
}
#map {
  height: calc(100vh - 64px);
  width: 100%;
}
.national-map :deep(.china-label) {
  background: rgba(255, 255, 255, 0.78);
  border: none;
  border-radius: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  color: #333;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 5px;
}
.national-map :deep(.crime-point) {
  filter: drop-shadow(0 0 6px rgba(246, 195, 67, 0.85));
}
.national-map :deep(.controlled-marker) {
  filter: drop-shadow(0 0 5px rgba(22, 104, 220, 0.9));
}
.map-legend {
  position: absolute;
  right: 12px;
  bottom: 28px;
  z-index: 900;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 0;
  padding: 10px 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  min-width: 130px;
}
.legend-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: #333;
}
.legend-row {
  display: flex;
  align-items: center;
  margin: 3px 0;
  color: #555;
}
.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 0;
  margin-right: 8px;
  display: inline-block;
}
.map-tip {
  position: absolute;
  left: 12px;
  bottom: 28px;
  z-index: 900;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 0;
  padding: 8px 12px;
  font-size: 12px;
  max-width: 360px;
}
.palette-control {
  position: absolute;
  right: 12px;
  bottom: 150px;
  z-index: 902;
}
.palette-btn {
  background: #1668dc;
  color: #fff;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.palette-btn:hover {
  background: #0d4fad;
}
.palette-menu {
  margin-top: 4px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  padding: 4px;
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 12px;
  color: #333;
}
.palette-item:hover {
  background: #f0f5ff;
}
.palette-item.on {
  background: #e6f0ff;
}
.palette-bar {
  width: 44px;
  height: 10px;
  display: inline-block;
}
</style>
