'use strict';

/**
 * 生成全国版占位数据（论文数据下载完成前使用）：
 *  - server/data/sample.json      约 12 万条带经纬度/时间/案件类型的样本
 *  - server/data/aggregates.json  省/市/年/月/类型/小时/星期聚合
 *  - server/data/meta.json        数据来源与覆盖说明
 *
 * 真实数据管线（build-from-csv.js）会以相同格式覆盖这些文件。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const regions = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'regions.json'), 'utf8')
);

const MAINLAND = new Set([
  110000, 120000, 130000, 140000, 150000, 210000, 220000, 230000, 310000,
  320000, 330000, 340000, 350000, 360000, 370000, 410000, 420000, 430000,
  440000, 450000, 460000, 500000, 510000, 520000, 530000, 540000, 610000,
  620000, 630000, 640000, 650000
]);

const provinces = regions.provinces.filter((p) => MAINLAND.has(p.adcode));
const cities = regions.cities.filter((c) => MAINLAND.has(c.provinceAdcode));

// 直辖市/无地级市列表的省份：以省本身作为城市
const MUNI = [110000, 120000, 310000, 500000];
for (const ad of MUNI) {
  const p = provinces.find((x) => x.adcode === ad);
  if (p && !cities.some((c) => c.provinceAdcode === ad)) {
    cities.push({
      adcode: ad,
      name: p.name,
      province: p.name,
      provinceAdcode: ad,
      center: p.center
    });
  }
}

// ---------- 确定性伪随机 ----------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260808);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- 人口权重（近似，占位用） ----------
const POP = {
  110000: 2189, 120000: 1387, 130000: 7461, 140000: 3492, 150000: 2405,
  210000: 4259, 220000: 2407, 230000: 3751, 310000: 2487, 320000: 8475,
  330000: 6457, 340000: 6103, 350000: 4154, 360000: 4519, 370000: 10153,
  410000: 9937, 420000: 5775, 430000: 6644, 440000: 12601, 450000: 5013,
  460000: 1008, 500000: 3205, 510000: 8367, 520000: 3856, 530000: 4721,
  540000: 365, 610000: 3953, 620000: 2502, 630000: 720, 640000: 620,
  650000: 2585
};

const TYPES = [
  { name: '盗窃', share: 0.42 },
  { name: '诈骗', share: 0.15 },
  { name: '故意伤害', share: 0.12 },
  { name: '抢劫', share: 0.10 },
  { name: '抢夺', share: 0.08 },
  { name: '寻衅滋事', share: 0.06 },
  { name: '其他', share: 0.07 }
];

const ROADS = [
  '幸福路', '解放路', '人民路', '建设路', '光明街', '朝阳街', '和平路',
  '胜利路', '中山路', '文化路', '长江路', '黄河路', '新城路', '育才路',
  '工业路', '迎宾大道'
];

const YEAR_W = {
  2000: 0.18, 2001: 0.22, 2002: 0.26, 2003: 0.30, 2004: 0.34,
  2005: 0.40, 2006: 0.46, 2007: 0.52, 2008: 0.58, 2009: 0.64,
  2010: 0.72, 2011: 0.80, 2012: 0.90, 2013: 1.00, 2014: 1.05,
  2015: 1.10, 2016: 1.15, 2017: 1.10, 2018: 1.02, 2019: 0.92
};

const MONTH_W = [1.00, 0.80, 0.95, 1.05, 1.15, 1.20, 1.22, 1.18, 1.10, 1.00, 0.95, 1.08];
const HOUR_W = [
  0.30, 0.20, 0.15, 0.10, 0.10, 0.20, 0.35, 0.60, 0.95, 1.20,
  1.00, 0.95, 1.25, 0.90, 1.05, 1.10, 0.90, 0.80, 0.85, 1.10,
  1.30, 1.05, 0.75, 0.50
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function dim(y, m) {
  return m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1];
}

// 每个城市的稳定权重（越大城市案件越多）
const cityWeight = (c) => {
  const h = (c.adcode * 2654435761) >>> 0;
  return 0.4 + ((h % 1000) / 1000) * 2.6;
};

const provWeight = (p) => (POP[p.adcode] || 1000) / 1000;
const weightedCity = (c) => {
  const p = provinces.find((x) => x.adcode === c.provinceAdcode);
  return cityWeight(c) * provWeight(p);
};
const totalCityWeight = cities.reduce((s, c) => s + weightedCity(c), 0);

const TARGET = 120000;
const records = [];
let id = 1;

// 预先按城市权重分配配额
const cityQuota = cities.map((c) => {
  const w = weightedCity(c);
  return { city: c, quota: Math.max(1, Math.round((w / totalCityWeight) * TARGET)) };
});

for (const q of cityQuota) {
  const c = q.city;
  const p = provinces.find((x) => x.adcode === c.provinceAdcode);
  const [clng, clat] = c.center;
  const radius = 0.08 + (c.adcode % 13) * 0.045;
  for (let i = 0; i < q.quota; i++) {
    // 年份
    const years = Object.keys(YEAR_W).map(Number);
    const yearWeights = years.map((y) => YEAR_W[y]);
    const ywSum = yearWeights.reduce((a, b) => a + b, 0);
    let r = rand() * ywSum;
    let year = years[0];
    for (let k = 0; k < years.length; k++) {
      r -= yearWeights[k];
      if (r <= 0) {
        year = years[k];
        break;
      }
    }
    // 月份
    const mwSum = MONTH_W.reduce((a, b) => a + b, 0);
    r = rand() * mwSum;
    let month = 1;
    for (let k = 0; k < 12; k++) {
      r -= MONTH_W[k];
      if (r <= 0) {
        month = k + 1;
        break;
      }
    }
    const day = randInt(1, dim(year, month));
    const hwSum = HOUR_W.reduce((a, b) => a + b, 0);
    r = rand() * hwSum;
    let hour = 0;
    for (let k = 0; k < 24; k++) {
      r -= HOUR_W[k];
      if (r <= 0) {
        hour = k;
        break;
      }
    }
    const minute = randInt(0, 59);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const type = pick(TYPES);

    // 经纬度：围绕市中心偏移
    const ang = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * radius;
    const lng = clng + Math.cos(ang) * dist;
    const lat = clat + Math.sin(ang) * dist * 0.85;

    const dateStr =
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const road = pick(ROADS);

    records.push({
      id: id++,
      caseNo: `（${year}）${String(c.adcode).slice(0, 2)}刑初${100000 + ((id * 37) % 90000)}号`,
      date: dateStr,
      time: timeStr,
      year,
      month,
      day,
      hour,
      weekday,
      type: type.name,
      province: p.name,
      provinceAdcode: p.adcode,
      city: c.name,
      cityAdcode: c.adcode,
      court: `${c.name}人民法院`,
      lng: Number(lng.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      address: `${c.name}${road}${randInt(1, 999)}号${randInt(1, 20)}栋`
    });
  }
}

// ---------- 聚合 ----------
const byYear = {};
const byMonth = {};
const byType = {};
const byHour = {};
const byWeekday = {};
const byProvince = {};
const byCity = {};
const byProvinceYear = {};
const byProvinceMonth = {};
const byCityYear = {};

for (const r of records) {
  byYear[r.year] = (byYear[r.year] || 0) + 1;
  const mk = `${r.year}-${String(r.month).padStart(2, '0')}`;
  byMonth[mk] = (byMonth[mk] || 0) + 1;
  byType[r.type] = (byType[r.type] || 0) + 1;
  byHour[r.hour] = (byHour[r.hour] || 0) + 1;
  byWeekday[r.weekday] = (byWeekday[r.weekday] || 0) + 1;
  byProvince[r.provinceAdcode] = (byProvince[r.provinceAdcode] || 0) + 1;
  byCity[r.cityAdcode] = (byCity[r.cityAdcode] || 0) + 1;
  const py = `${r.provinceAdcode}-${r.year}`;
  byProvinceYear[py] = (byProvinceYear[py] || 0) + 1;
  const pm = `${r.provinceAdcode}-${r.year}-${r.month}`;
  byProvinceMonth[pm] = (byProvinceMonth[pm] || 0) + 1;
  const cy = `${r.cityAdcode}-${r.year}`;
  byCityYear[cy] = (byCityYear[cy] || 0) + 1;
}

const aggregates = {
  total: records.length,
  yearStart: 2000,
  yearEnd: 2019,
  byYear: Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => ({ year, total: byYear[year] })),
  byMonth: Object.keys(byMonth)
    .sort()
    .map((m) => {
      const [year, month] = m.split('-').map(Number);
      return { year, month, total: byMonth[m] };
    }),
  byType: Object.keys(byType).map((t) => ({ type: t, total: byType[t] })),
  byHour: Object.keys(byHour)
    .map(Number)
    .sort((a, b) => a - b)
    .map((h) => ({ hour: h, total: byHour[h] })),
  byWeekday: Object.keys(byWeekday)
    .map(Number)
    .sort((a, b) => a - b)
    .map((w) => ({ weekday: w, total: byWeekday[w] })),
  byProvince: provinces
    .map((p) => ({
      adcode: p.adcode,
      name: p.name,
      total: byProvince[p.adcode] || 0
    }))
    .sort((a, b) => b.total - a.total),
  byCity: cities
    .map((c) => ({
      adcode: c.adcode,
      name: c.name,
      province: c.province,
      provinceAdcode: c.provinceAdcode,
      total: byCity[c.adcode] || 0
    }))
    .sort((a, b) => b.total - a.total),
  byProvinceYear: Object.keys(byProvinceYear).map((k) => {
    const [adcode, year] = k.split('-');
    return { adcode: Number(adcode), year: Number(year), total: byProvinceYear[k] };
  }),
  byProvinceMonth: Object.keys(byProvinceMonth).map((k) => {
    const [adcode, year, month] = k.split('-');
    return {
      adcode: Number(adcode),
      year: Number(year),
      month: Number(month),
      total: byProvinceMonth[k]
    };
  }),
  byCityYear: Object.keys(byCityYear).map((k) => {
    const [adcode, year] = k.split('-');
    return { adcode: Number(adcode), year: Number(year), total: byCityYear[k] };
  })
};

const meta = {
  source: 'placeholder',
  label: '占位模拟数据（论文数据下载完成后自动替换）',
  article: 'Zhang, Y., Kwan, M.P. & Fang, L. An LLM driven dataset on the spatiotemporal distributions of street and neighborhood crime in China. Sci Data 12, 467 (2025).',
  articleUrl: 'https://doi.org/10.1038/s41597-025-04757-8',
  dataUrl: 'https://figshare.com/articles/dataset/_b_A_dataset_on_the_spatiotemporal_distributions_of_street_and_neighborhood_crime_in_China_b_/28106939',
  records: records.length,
  provinces: provinces.length,
  cities: cities.length,
  years: [2000, 2019],
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, 'sample.json'),
  JSON.stringify(records)
);
fs.writeFileSync(
  path.join(DATA_DIR, 'aggregates.json'),
  JSON.stringify(aggregates)
);
fs.writeFileSync(
  path.join(DATA_DIR, 'meta.json'),
  JSON.stringify(meta, null, 2)
);

console.log(
  `placeholder data: ${records.length} records, ${cities.length} cities, ${aggregates.byYear.length} years -> ${DATA_DIR}`
);
