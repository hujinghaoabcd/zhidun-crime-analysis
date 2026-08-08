'use strict';

/**
 * 全国犯罪数据加载与查询
 * 数据来源: server/data/*.json（由 generate-placeholder.js 或 build-from-csv.js 生成）
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USER_CASES_FILE = path.join(DATA_DIR, 'user-cases.json');
const CONTROLLED_FILE = path.join(DATA_DIR, 'controlled-regions.json');

function loadJson(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[national-data] 无法加载 ${name}: ${e.message}`);
    return fallback;
  }
}

const regions = loadJson('regions.json', { provinces: [], cities: [] });
const aggregates = loadJson('aggregates.json', { byYear: [], byMonth: [], byType: [], byProvince: [], byCity: [] });
const meta = loadJson('meta.json', { source: 'unknown' });
const sample = loadJson('sample.json', []);

const provinceByAdcode = new Map();
for (const p of regions.provinces || []) provinceByAdcode.set(p.adcode, p);

const cityByAdcode = new Map();
for (const c of regions.cities || []) cityByAdcode.set(c.adcode, c);

const cityByProvince = new Map();
for (const c of regions.cities || []) {
  if (!cityByProvince.has(c.provinceAdcode)) cityByProvince.set(c.provinceAdcode, []);
  cityByProvince.get(c.provinceAdcode).push(c);
}
// 直辖市兜底：省即市
for (const p of regions.provinces || []) {
  if (!cityByProvince.has(p.adcode) && [110000, 120000, 310000, 500000].includes(p.adcode)) {
    const c = {
      adcode: p.adcode,
      name: p.name,
      province: p.name,
      provinceAdcode: p.adcode,
      center: p.center
    };
    cityByProvince.set(p.adcode, [c]);
    cityByAdcode.set(p.adcode, c);
  }
}

// 用户录入案件（持久化到本地文件，重启不丢失）
let userCases = [];
try {
  if (fs.existsSync(USER_CASES_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(USER_CASES_FILE, 'utf8'));
    if (Array.isArray(loaded)) userCases = loaded;
  }
} catch (e) {
  console.warn('[national-data] 用户案件文件读取失败:', e.message);
}

function saveUserCases() {
  try {
    fs.writeFileSync(USER_CASES_FILE, JSON.stringify(userCases));
  } catch (e) {
    console.warn('[national-data] 用户案件保存失败:', e.message);
  }
}

// 重点区域布控（持久化到本地文件）
let controlledRegions = [];
try {
  if (fs.existsSync(CONTROLLED_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(CONTROLLED_FILE, 'utf8'));
    if (Array.isArray(loaded)) controlledRegions = loaded;
  }
} catch (e) {
  console.warn('[national-data] 布控文件读取失败:', e.message);
}

function saveControlled() {
  try {
    fs.writeFileSync(CONTROLLED_FILE, JSON.stringify(controlledRegions));
  } catch (e) {
    console.warn('[national-data] 布控保存失败:', e.message);
  }
}

function listControlled() {
  return controlledRegions;
}

function addControlled(region) {
  if (!region || !region.id) return null;
  if (!controlledRegions.some((r) => String(r.id) === String(region.id))) {
    controlledRegions.push(region);
    saveControlled();
  }
  return region;
}

function removeControlled(id) {
  const i = controlledRegions.findIndex((r) => String(r.id) === String(id));
  if (i === -1) return false;
  controlledRegions.splice(i, 1);
  saveControlled();
  return true;
}

function deleteCase(id) {
  const idx = userCases.findIndex((c) => c.id === Number(id));
  if (idx === -1) return false;
  userCases.splice(idx, 1);
  saveUserCases();
  return true;
}

// 省份邻接关系（简化：仅用于模型的空间平滑）
const PROVINCE_NEIGHBORS = {
  110000: [130000, 120000],
  120000: [110000, 130000],
  130000: [110000, 120000, 140000, 150000, 210000, 220000, 370000, 410000],
  140000: [130000, 150000, 410000, 610000],
  150000: [130000, 140000, 210000, 230000, 610000, 620000],
  210000: [130000, 150000, 220000],
  220000: [130000, 210000, 230000],
  230000: [150000, 220000],
  310000: [320000, 330000],
  320000: [310000, 330000, 340000, 370000],
  330000: [310000, 320000, 340000, 350000],
  340000: [320000, 330000, 350000, 360000, 370000, 410000, 420000],
  350000: [330000, 340000, 360000, 440000],
  360000: [330000, 340000, 350000, 370000, 420000, 430000, 440000],
  370000: [130000, 320000, 340000, 360000, 410000],
  410000: [130000, 140000, 340000, 370000, 420000, 610000],
  420000: [340000, 360000, 410000, 430000, 500000, 610000],
  430000: [360000, 420000, 440000, 450000],
  440000: [350000, 360000, 430000, 450000],
  450000: [430000, 440000, 460000],
  460000: [440000, 450000],
  500000: [420000, 510000, 520000],
  510000: [500000, 520000, 530000, 540000, 610000],
  520000: [500000, 510000, 530000, 540000],
  530000: [510000, 520000, 540000],
  540000: [510000, 520000, 530000, 620000],
  610000: [140000, 150000, 410000, 420000, 500000, 510000, 620000, 640000],
  620000: [150000, 540000, 610000, 630000, 640000],
  630000: [620000, 640000],
  640000: [610000, 620000, 630000],
  650000: [540000, 620000, 630000]
};

// 合成警力站点（按城市确定性生成）
function stationsForCity(adcode) {
  const city = cityByAdcode.get(adcode);
  if (!city) return [];
  const [clng, clat] = city.center;
  const seed = (adcode * 2654435761) >>> 0;
  const n = 4 + (seed % 5);
  const stations = [];
  const names = ['中心派出所', '城东派出所', '城西派出所', '城北派出所', '城南派出所', '开发区派出所', '高新区派出所', '火车站派出所'];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (seed % 17) / 17;
    const dist = 0.05 + ((seed >> (i % 8)) % 10) * 0.018;
    stations.push({
      id: `${adcode}-s${i + 1}`,
      name: `${city.name}${names[i % names.length]}`,
      address: `${city.name}${names[i % names.length]}街${1 + ((seed + i * 97) % 200)}号`,
      lng: Number((clng + Math.cos(ang) * dist).toFixed(6)),
      lat: Number((clat + Math.sin(ang) * dist * 0.85).toFixed(6))
    });
  }
  return stations;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestStation(lat, lng, adcode) {
  const stations = stationsForCity(adcode);
  if (!stations.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = haversineKm({ lat, lng }, s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { station: best, distance: Number(bestD.toFixed(2)) };
}

function routePath(fromLat, fromLng, station) {
  // 简单折线：起点 -> 中点 -> 站点
  const mid = {
    lng: (fromLng + station.lng) / 2 + (station.lng - fromLng) * 0.1,
    lat: (fromLat + station.lat) / 2 + (station.lat - fromLat) * 0.15
  };
  return [
    { lat: fromLat, lng: fromLng },
    { lat: Number(mid.lat.toFixed(6)), lng: Number(mid.lng.toFixed(6)) },
    { lat: station.lat, lng: station.lng }
  ];
}

function filterPoints(opts = {}) {
  const start = opts.start || '2000-01-01';
  const end = opts.end || '2019-12-31';
  const type = opts.type || '';
  const province = opts.province ? Number(opts.province) : null;
  const city = opts.city ? Number(opts.city) : null;
  const bbox = opts.bbox || null;
  const limit = opts.limit || Infinity;
  const out = [];
  for (const p of sample) {
    if (p.date < start || p.date > end) continue;
    if (type && p.type !== type) continue;
    if (province && p.provinceAdcode !== province) continue;
    if (city && p.cityAdcode !== city) continue;
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      if (p.lng < minLng || p.lng > maxLng || p.lat < minLat || p.lat > maxLat) continue;
    }
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function heatCells(opts = {}) {
  const grid = opts.grid || 0.5;
  const cells = new Map();
  const start = opts.start || '2000-01-01';
  const end = opts.end || '2019-12-31';
  const type = opts.type || '';
  const province = opts.province ? Number(opts.province) : null;
  const city = opts.city ? Number(opts.city) : null;
  for (const p of sample) {
    if (p.date < start || p.date > end) continue;
    if (type && p.type !== type) continue;
    if (province && p.provinceAdcode !== province) continue;
    if (city && p.cityAdcode !== city) continue;
    const lng = Math.round(p.lng / grid) * grid;
    const lat = Math.round(p.lat / grid) * grid;
    const key = `${lng},${lat}`;
    const cell = cells.get(key) || { lng, lat, count: 0 };
    cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => b.count - a.count);
}

function filterAggregates(agg, opts = {}) {
  const start = opts.start || '';
  const end = opts.end || '';
  const type = opts.type || '';
  const province = opts.province ? Number(opts.province) : null;
  const city = opts.city ? Number(opts.city) : null;
  return agg.filter((x) => {
    if (province && x.provinceAdcode !== undefined && x.provinceAdcode !== province) return false;
    if (province && x.adcode !== undefined && !city && x.provinceAdcode === undefined && !String(x.adcode).startsWith(String(province).slice(0, 2))) return false;
    if (city && x.adcode !== undefined && x.adcode !== city) return false;
    if (type && x.type !== type) return false;
    if (start && x.year && x.year < Number(start.slice(0, 4))) return false;
    if (end && x.year && x.year > Number(end.slice(0, 4))) return false;
    return true;
  });
}

function trendSeries(opts = {}) {
  const dimension = opts.dimension || 'month';
  const type = opts.type || '';
  const province = opts.province ? Number(opts.province) : null;
  const city = opts.city ? Number(opts.city) : null;
  const start = opts.start || '';
  const end = opts.end || '';

  if (dimension === 'year') {
    let rows = aggregates.byYear.map((x) => ({ label: String(x.year), total: x.total }));
    return filterByTime(rows, start, end);
  }
  if (dimension === 'month') {
    if (type || province || city) {
      const pts = filterPoints({ start, end, type, province, city });
      const map = new Map();
      for (const p of pts) {
        const label = `${p.year}-${String(p.month).padStart(2, '0')}`;
        map.set(label, (map.get(label) || 0) + 1);
      }
      return [...map.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([label, total]) => ({
          label,
          total,
          year: Number(label.slice(0, 4)),
          month: Number(label.slice(5, 7))
        }));
    }
    const rows = aggregates.byMonth.map((x) => ({
      label: `${x.year}-${String(x.month).padStart(2, '0')}`,
      total: x.total,
      year: x.year,
      month: x.month
    }));
    return filterByTime(rows, start, end);
  }
  if (dimension === 'type') {
    return aggregates.byType.map((x) => ({ label: x.type, total: x.total }));
  }
  if (dimension === 'province') {
    return aggregates.byProvince
      .filter((x) => !province || x.adcode === province)
      .map((x) => ({ label: x.name, adcode: x.adcode, total: x.total }));
  }
  if (dimension === 'city') {
    let rows = aggregates.byCity;
    if (province) rows = rows.filter((x) => x.provinceAdcode === province);
    if (city) rows = rows.filter((x) => x.adcode === city);
    return rows.map((x) => ({ label: x.name, adcode: x.adcode, total: x.total }));
  }
  return [];
}

function filterByTime(rows, start, end) {
  if (!start && !end) return rows;
  const sy = start ? Number(start.slice(0, 4)) : 0;
  const ey = end ? Number(end.slice(0, 4)) : 9999;
  return rows.filter((r) => {
    const y = r.year || Number(r.label.slice(0, 4));
    return y >= sy && y <= ey;
  });
}

function rankBy(opts = {}) {
  const by = opts.by || 'province';
  const limit = Number(opts.limit || 10);
  const start = opts.start || '';
  const end = opts.end || '';
  const type = opts.type || '';
  const province = opts.province ? Number(opts.province) : null;
  const hasFilter = !!(start || end || type || province);

  if (by === 'province') {
    if (hasFilter) {
      const pts = filterPoints({ start, end, type, province: '' });
      const agg = new Map();
      for (const p of pts) {
        agg.set(p.provinceAdcode, (agg.get(p.provinceAdcode) || 0) + 1);
      }
      return [...agg.entries()]
        .map(([adcode, total]) => ({
          adcode,
          name: (provinceByAdcode.get(adcode) || {}).name || '未知',
          total
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit)
        .map((x, i) => ({ rank: i + 1, ...x }));
    }
    return aggregates.byProvince
      .filter((x) => (!type ? true : true))
      .slice(0, limit)
      .map((x, i) => ({ rank: i + 1, ...x }));
  }
  if (by === 'city') {
    if (hasFilter) {
      const pts = filterPoints({ start, end, type, province });
      const agg = new Map();
      for (const p of pts) {
        const key = `${p.provinceAdcode}|${p.cityAdcode}`;
        const cur = agg.get(key) || {
          adcode: p.cityAdcode,
          provinceAdcode: p.provinceAdcode,
          name: p.city,
          province: p.province,
          total: 0
        };
        cur.total += 1;
        agg.set(key, cur);
      }
      return [...agg.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, limit)
        .map((x, i) => ({ rank: i + 1, ...x }));
    }
    return aggregates.byCity
      .filter((x) => !province || x.provinceAdcode === province)
      .slice(0, limit)
      .map((x, i) => ({ rank: i + 1, ...x }));
  }
  if (by === 'type') {
    return aggregates.byType
      .slice(0, limit)
      .map((x, i) => ({ rank: i + 1, ...x }));
  }
  return [];
}

function searchCases(opts = {}) {
  const keyword = (opts.keyword || '').toLowerCase();
  const type = opts.type || '';
  const start = opts.start || '';
  const end = opts.end || '';
  const province = opts.province ? Number(opts.province) : null;
  const city = opts.city ? Number(opts.city) : null;
  const page = Math.max(1, Number(opts.page || 1));
  const size = Math.min(200, Math.max(1, Number(opts.size || 20)));

  const all = [...userCases, ...sample];
  const filtered = all.filter((c) => {
    if (keyword && !(
      c.caseNo.toLowerCase().includes(keyword) ||
      c.address.toLowerCase().includes(keyword) ||
      c.court.toLowerCase().includes(keyword) ||
      c.city.toLowerCase().includes(keyword)
    )) return false;
    if (type && type !== 'allCrime' && c.type !== type) return false;
    if (start && c.date < start) return false;
    if (end && c.date > end) return false;
    if (province && c.provinceAdcode !== province) return false;
    if (city && c.cityAdcode !== city) return false;
    return true;
  });

  const total = filtered.length;
  const rows = filtered
    .slice((page - 1) * size, page * size)
    .map((c, i) => ({
      key: String((page - 1) * size + i + 1),
      id: c.id,
      caseNo: c.caseNo,
      date: c.date,
      time: c.time,
      type: c.type,
      province: c.province,
      provinceAdcode: c.provinceAdcode,
      city: c.city,
      cityAdcode: c.cityAdcode,
      court: c.court,
      address: c.address,
      lng: c.lng,
      lat: c.lat,
      source: c.id > 100000000 ? '录入' : '裁判文书'
    }));
  return { total, page, size, rows };
}

function addCase(body = {}) {
  const now = new Date();
  const row = {
    id: 100000000 + userCases.length + 1,
    caseNo: body.caseNo || `（${now.getFullYear()}）录${String(1000 + userCases.length)}号`,
    date: body.date || now.toISOString().slice(0, 10),
    time: body.time || now.toTimeString().slice(0, 5),
    year: Number((body.date || now.toISOString().slice(0, 10)).slice(0, 4)),
    month: Number((body.date || now.toISOString().slice(0, 10)).slice(5, 7)),
    day: Number((body.date || now.toISOString().slice(0, 10)).slice(8, 10)),
    hour: Number((body.time || '12:00').slice(0, 2)),
    weekday: new Date(body.date + 'T00:00:00').getDay() || 7,
    type: body.type || '其他',
    province: body.province || '未知',
    provinceAdcode: Number(body.provinceAdcode || 0),
    city: body.city || '未知',
    cityAdcode: Number(body.cityAdcode || 0),
    court: body.court || '',
    lng: Number(body.lng || 0),
    lat: Number(body.lat || 0),
    address: body.address || '',
    description: body.description || ''
  };
  userCases.unshift(row);
  saveUserCases();
  return row;
}

// 合成重点人员（演示）
function personsForCity(adcode) {
  const city = cityByAdcode.get(adcode);
  if (!city) return [];
  const [clng, clat] = city.center;
  const seed = (adcode * 40503) >>> 0;
  const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
  const types = ['盗窃前科', '抢劫前科', '诈骗前科', '寻衅滋事前科', '吸毒管控', '涉黑关注'];
  const persons = [];
  const n = 8 + (seed % 6);
  for (let i = 0; i < n; i++) {
    const ang = ((i * 73) % 360) * (Math.PI / 180);
    const dist = 0.06 + ((seed >> (i % 5)) % 20) * 0.02;
    const score = 50 + ((seed * (i + 3)) % 500) / 10;
    const type = types[(seed + i * 7) % types.length];
    persons.push({
      id: `${adcode}-p${i + 1}`,
      name: `${surnames[(seed + i) % surnames.length]}某`,
      type,
      score: Number(score.toFixed(1)),
      level: score >= 85 ? 'red' : score >= 70 ? 'orange' : score >= 55 ? 'yellow' : 'green',
      lastSeen: `2020-01-${String(1 + ((seed + i * 3) % 28)).padStart(2, '0')} ${String(8 + ((seed + i) % 14)).padStart(2, '0')}:${String((seed * i) % 60).padStart(2, '0')}`,
      lng: Number((clng + Math.cos(ang) * dist).toFixed(6)),
      lat: Number((clat + Math.sin(ang) * dist * 0.85).toFixed(6))
    });
  }
  return persons;
}

// 合成卡口
function checkpointsForCity(adcode) {
  const city = cityByAdcode.get(adcode);
  if (!city) return [];
  const [clng, clat] = city.center;
  const seed = (adcode * 2654435761) >>> 0;
  const points = [];
  const names = ['东郊卡口', '西郊卡口', '南郊卡口', '北郊卡口', '高速入口卡口', '国道检查站', '火车站卡口', '客运站卡口'];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.2;
    const dist = 0.18 + ((seed + i * 131) % 15) * 0.025;
    points.push({
      id: `${adcode}-c${i + 1}`,
      name: `${city.name}${names[i]}`,
      status: (seed + i) % 4 === 0 ? '繁忙' : '正常',
      lng: Number((clng + Math.cos(ang) * dist).toFixed(6)),
      lat: Number((clat + Math.sin(ang) * dist * 0.85).toFixed(6))
    });
  }
  return points;
}

// 出警规划：热点聚类 + 推荐巡逻路线
function patrolPlan(adcode, opts = {}) {
  const city = cityByAdcode.get(adcode);
  if (!city) return null;
  const points = filterPoints({ city: adcode, start: opts.start, end: opts.end, type: opts.type, limit: 20000 });
  if (!points.length) {
    return { city: city.name, clusters: [], route: [], stations: stationsForCity(adcode), total: 0 };
  }
  const grid = opts.grid || 0.03;
  const cells = new Map();
  for (const p of points) {
    const lng = Math.round(p.lng / grid) * grid;
    const lat = Math.round(p.lat / grid) * grid;
    const key = `${lng},${lat}`;
    const c = cells.get(key) || { lng, lat, count: 0 };
    c.count += 1;
    cells.set(key, c);
  }
  const clusters = [...cells.values()]
    .filter((c) => c.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((c, i) => ({
      id: i + 1,
      lng: Number(c.lng.toFixed(6)),
      lat: Number(c.lat.toFixed(6)),
      count: c.count,
      level: c.count >= 30 ? 'red' : c.count >= 15 ? 'orange' : 'yellow'
    }));

  // 蛇形连接热点（简化巡逻路线）
  const route = [];
  for (const c of clusters) route.push({ lat: c.lat, lng: c.lng });
  return {
    city: city.name,
    total: points.length,
    clusters,
    route,
    stations: stationsForCity(adcode)
  };
}

module.exports = {
  regions,
  aggregates,
  meta,
  sample,
  userCases,
  provinceByAdcode,
  cityByAdcode,
  cityByProvince,
  PROVINCE_NEIGHBORS,
  filterPoints,
  heatCells,
  trendSeries,
  rankBy,
  searchCases,
  addCase,
  deleteCase,
  listControlled,
  addControlled,
  removeControlled,
  stationsForCity,
  nearestStation,
  routePath,
  personsForCity,
  checkpointsForCity,
  patrolPlan
};
