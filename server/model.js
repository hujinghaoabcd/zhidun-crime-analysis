'use strict';

/**
 * 全国犯罪时空预测模型（演示用 Lite 实现）
 *
 * 数据口径：
 *  - 省级：直接使用 2000-01 ~ 2018-12 的月度聚合数据。
 *  - 地市级：原始聚合仅有年度总量，因此按所在省份当年的月度季节分布
 *    将地市年度总量分配为“估算月度序列”，只用于演示月尺度下钻。
 *  - 2019 年原始数据明显不完整，不参与模型拟合；预测演示从 2019-01 开始。
 *
 * 方法：季节指数 + 趋势外推 + 轻量空间邻域平滑。
 * 该模型用于教学/演示，不用于真实警务决策。
 */

const data = require('./national-data');

const START_YEAR = 2000;
const MODEL_END_YEAR = 2018;
const N_MONTHS = (MODEL_END_YEAR - START_YEAR + 1) * 12;
const FORECAST_START_INDEX = N_MONTHS;

const LEVELS = {
  red: { label: '红色预警', color: '#d4380d' },
  orange: { label: '橙色预警', color: '#fa8c16' },
  yellow: { label: '黄色预警', color: '#fadb14' },
  green: { label: '正常', color: '#52c41a' }
};

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function monthIndex(year, month) {
  return (year - START_YEAR) * 12 + (month - 1);
}

function monthAt(idx) {
  return {
    year: START_YEAR + Math.floor(idx / 12),
    month: (idx % 12) + 1
  };
}

function provinceMonthlySeries(adcode, endYear = MODEL_END_YEAR) {
  const n = (endYear - START_YEAR + 1) * 12;
  const out = new Array(n).fill(0);
  for (const row of data.aggregates.byProvinceMonth || []) {
    if (row.adcode !== adcode || row.year < START_YEAR || row.year > endYear) continue;
    const idx = monthIndex(row.year, row.month);
    if (idx >= 0 && idx < n) out[idx] += Number(row.total) || 0;
  }
  return out;
}

function nationalMonthlyShares(year) {
  const rows = (data.aggregates.byMonth || []).filter((r) => r.year === year);
  const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  if (!total) return new Array(12).fill(1 / 12);
  const byMonth = new Array(12).fill(0);
  for (const row of rows) byMonth[row.month - 1] = (Number(row.total) || 0) / total;
  return byMonth;
}

function provinceMonthlyShares(adcode, year) {
  const rows = (data.aggregates.byProvinceMonth || []).filter(
    (r) => r.adcode === adcode && r.year === year
  );
  const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  if (!total) return nationalMonthlyShares(year);
  const shares = new Array(12).fill(0);
  for (const row of rows) shares[row.month - 1] = (Number(row.total) || 0) / total;
  return shares;
}

function cityMonthlySeries(adcode, endYear = MODEL_END_YEAR) {
  const city = data.cityByAdcode.get(adcode);
  if (!city) return null;

  const annualRows = (data.aggregates.byCityYear || [])
    .filter((r) => r.adcode === adcode && r.year >= START_YEAR && r.year <= endYear)
    .sort((a, b) => a.year - b.year);
  if (!annualRows.length) return null;

  const annual = new Map(annualRows.map((r) => [r.year, Number(r.total) || 0]));
  const out = [];
  for (let year = START_YEAR; year <= endYear; year++) {
    const total = annual.get(year) || 0;
    const shares = provinceMonthlyShares(city.provinceAdcode, year);
    for (let month = 0; month < 12; month++) out.push(total * shares[month]);
  }
  return out;
}

function seriesFor(level, id, endYear = MODEL_END_YEAR) {
  return level === 'city'
    ? cityMonthlySeries(id, endYear)
    : provinceMonthlySeries(id, endYear);
}

function regionInfo(level, id) {
  return level === 'city'
    ? data.cityByAdcode.get(id) || null
    : data.provinceByAdcode.get(id) || null;
}

function regionCenter(level, id) {
  const info = regionInfo(level, id);
  return info && Array.isArray(info.center)
    ? { lng: info.center[0], lat: info.center[1] }
    : null;
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

function movingTrend(series, win = 12) {
  const out = new Array(series.length).fill(0);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= win) sum -= series[i - win];
    out[i] = sum / Math.min(win, i + 1);
  }
  return out;
}

function seasonalIndices(series, trend) {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (let i = 12; i < series.length; i++) {
    const baseline = trend[i];
    if (!(baseline > 0)) continue;
    const m = i % 12;
    sums[m] += series[i] / baseline;
    counts[m] += 1;
  }
  const raw = sums.map((v, m) => (counts[m] ? v / counts[m] : 1));
  const avg = mean(raw) || 1;
  return raw.map((v) => v / avg);
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den ? num / den : 0;
}

function neighborIds(level, id) {
  if (level === 'province') return data.PROVINCE_NEIGHBORS[id] || [];
  const city = data.cityByAdcode.get(id);
  if (!city) return [];
  const center = regionCenter(level, id);
  const peers = (data.cityByProvince.get(city.provinceAdcode) || [])
    .filter((c) => c.adcode !== id)
    .map((c) => {
      const cCenter = regionCenter('city', c.adcode);
      return {
        id: c.adcode,
        distance: center && cCenter ? haversineKm(center, cCenter) : Infinity
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
  return peers.map((x) => x.id);
}

function spatialFactor(level, id) {
  const center = regionCenter(level, id);
  if (!center) return 1;
  let weighted = 0;
  let weights = 0;

  for (const nid of neighborIds(level, id)) {
    const s = seriesFor(level, nid);
    const nCenter = regionCenter(level, nid);
    if (!s || !nCenter || s.length < 12) continue;
    const recent = mean(s.slice(-6));
    const prior = mean(s.slice(-12, -6));
    if (!(prior > 0)) continue;
    const growth = clamp(recent / prior, 0.6, 1.4);
    const distance = Math.max(30, haversineKm(center, nCenter));
    const w = 1 / (distance * distance);
    weighted += growth * w;
    weights += w;
  }
  return weights ? clamp(weighted / weights, 0.8, 1.2) : 1;
}

function coreForecast(series, months, spatial = 1) {
  if (!series || !series.length) return [];
  const trend = movingTrend(series, 12);
  const seasonal = seasonalIndices(series, trend);
  const recentTrend = trend.slice(-24);
  const lastTrend = trend[trend.length - 1] || mean(series.slice(-12)) || 1;
  const slopeAbs = linearSlope(recentTrend);
  const slopePerMonth = clamp(slopeAbs / Math.max(lastTrend, 1), -0.025, 0.025);
  const out = [];

  for (let k = 1; k <= months; k++) {
    const targetIdx = series.length - 1 + k;
    const month = targetIdx % 12;
    const trendValue = Math.max(0, lastTrend * (1 + slopePerMonth * k));
    const spatialAdjustment = 1 + (spatial - 1) * 0.15;
    out.push(Math.max(0, trendValue * seasonal[month] * spatialAdjustment));
  }
  return { values: out, slopePerMonth };
}

function riskLevel(value, series, targetMonth) {
  const comparable = [];
  for (let i = targetMonth; i < series.length; i += 12) {
    if (series[i] > 0) comparable.push(series[i]);
  }
  const history = comparable.length >= 3 ? comparable : series.filter((x) => x > 0);
  if (!history.length) return 'green';
  const avg = mean(history);
  const std = Math.sqrt(mean(history.map((x) => (x - avg) ** 2))) || 1;
  const ratio = value / Math.max(avg, 0.5);
  if (ratio >= 1.8 || value >= avg + 2.5 * std) return 'red';
  if (ratio >= 1.4 || value >= avg + 1.6 * std) return 'orange';
  if (ratio >= 1.12 || value >= avg + 0.8 * std) return 'yellow';
  return 'green';
}

function forecastRegion(level, id, months) {
  const info = regionInfo(level, id);
  const series = seriesFor(level, id);
  if (!info || !series || !series.some((x) => x > 0)) return null;

  const result = coreForecast(series, months, spatialFactor(level, id));
  const forecast = result.values.map((raw, i) => {
    const targetIdx = FORECAST_START_INDEX + i;
    const tm = monthAt(targetIdx);
    const value = Math.round(raw);
    const previousYear = series[targetIdx - 12] || 0;
    const lv = riskLevel(value, series, targetIdx % 12);
    return {
      year: tm.year,
      month: tm.month,
      value,
      changePct: previousYear > 0 ? Math.round(((value - previousYear) / previousYear) * 100) : 0,
      level: lv,
      color: LEVELS[lv].color,
      label: LEVELS[lv].label
    };
  });

  return {
    id,
    name: info.name,
    provinceAdcode: level === 'city' ? info.provinceAdcode : id,
    center: regionCenter(level, id),
    historyTotal: Math.round(series.reduce((a, b) => a + b, 0)),
    lastValue: Math.round(series[series.length - 1] || 0),
    trendPct: Math.round(result.slopePerMonth * 1200),
    estimatedMonthly: level === 'city',
    forecast
  };
}

function mape(pred, actual) {
  let total = 0;
  let n = 0;
  for (let i = 0; i < Math.min(pred.length, actual.length); i++) {
    if (!(actual[i] > 0)) continue;
    total += Math.abs((pred[i] - actual[i]) / actual[i]);
    n += 1;
  }
  return n ? (total / n) * 100 : null;
}

function holdoutQuality(level) {
  if (level === 'city') {
    return {
      window: '地市月度序列由年度总量按省级月度分布估算，不提供独立月度回测精度',
      samples: 0,
      mape: null,
      accuracy: null
    };
  }

  const holdoutYear = 2018;
  const trainEndYear = holdoutYear - 1;
  let sum = 0;
  let samples = 0;

  for (const row of data.aggregates.byProvince || []) {
    if (!(row.adcode > 0)) continue;
    const full = provinceMonthlySeries(row.adcode, holdoutYear);
    const train = provinceMonthlySeries(row.adcode, trainEndYear);
    const actual = full.slice(-12);
    if (!train.some((x) => x > 0) || !actual.some((x) => x > 0)) continue;
    const pred = coreForecast(train, 12, 1).values;
    const score = mape(pred, actual);
    if (score === null || !Number.isFinite(score)) continue;
    sum += score;
    samples += 1;
  }

  const score = samples ? sum / samples : null;
  return {
    window: '2018-01 ~ 2018-12 留出回测（训练截至 2017-12）',
    samples,
    mape: score === null ? null : Number(score.toFixed(1)),
    accuracy: score === null ? null : Number(Math.max(0, 100 - score).toFixed(1))
  };
}

function predict(opts = {}) {
  const level = opts.level === 'city' ? 'city' : 'province';
  const months = Math.min(6, Math.max(1, Number(opts.months || 3)));
  const top = Math.max(0, Number(opts.top || 0));
  const ids = level === 'province'
    ? (data.aggregates.byProvince || []).filter((x) => x.adcode > 0).map((x) => x.adcode)
    : [...new Set((data.aggregates.byCity || []).filter((x) => x.adcode > 0).map((x) => x.adcode))];

  let items = ids
    .map((id) => forecastRegion(level, id, months))
    .filter(Boolean)
    .sort((a, b) => b.forecast[0].value - a.forecast[0].value);
  if (top > 0) items = items.slice(0, top);

  const totalForecast = items.reduce((s, x) => s + (x.forecast[0]?.value || 0), 0);
  const totalLast = items.reduce((s, x) => s + x.lastValue, 0);
  const count = (lv) => items.filter((x) => x.forecast[0]?.level === lv).length;
  const firstMonth = monthAt(FORECAST_START_INDEX);

  return {
    generatedAt: new Date().toISOString(),
    model: 'Seasonal-Trend Lite + 空间邻域平滑',
    level,
    timeScale: 'month',
    months,
    trainingThrough: `${MODEL_END_YEAR}-12`,
    forecastFrom: `${firstMonth.year}-${String(firstMonth.month).padStart(2, '0')}`,
    cityMonthlyEstimated: level === 'city',
    quality: holdoutQuality(level),
    summary: {
      totalForecast,
      changePct: totalLast > 0 ? Math.round(((totalForecast - totalLast) / totalLast) * 100) : 0,
      redCount: count('red'),
      orangeCount: count('orange'),
      yellowCount: count('yellow'),
      normalCount: count('green'),
      regions: items.length
    },
    items
  };
}

function seriesForRegion(level, id) {
  const numericId = Number(id);
  if (!numericId) return null;
  const actualLevel = level === 'city' ? 'city' : 'province';
  const series = seriesFor(actualLevel, numericId);
  if (!series) return null;

  const labels = series.map((_, i) => {
    const tm = monthAt(i);
    return `${tm.year}-${String(tm.month).padStart(2, '0')}`;
  });
  const fc = forecastRegion(actualLevel, numericId, 3);
  return {
    labels,
    values: series.map((x) => Math.round(x)),
    estimatedMonthly: actualLevel === 'city',
    forecast: fc ? fc.forecast : []
  };
}

module.exports = {
  predict,
  seriesForRegion,
  holdoutQuality,
  LEVELS,
  _internal: {
    provinceMonthlySeries,
    cityMonthlySeries,
    coreForecast,
    mape,
    monthAt
  }
};
