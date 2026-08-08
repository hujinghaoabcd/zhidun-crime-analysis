'use strict';

/**
 * 全国犯罪时空预测模型
 *
 * 方法（STL-Lite + 空间平滑）：
 *  1. 对每个省/市按 2000-01 ~ 2019-12 构造月度序列
 *  2. 趋势项：12 个月滑动平均（Trailing MA）
 *  3. 季节项：月度比例（相对趋势）的多年均值
 *  4. 趋势外推：近 24 个月线性回归，按 1..months 步长衰减外推
 *  5. 空间平滑：邻近省份/城市近 3 个月残差的距离加权修正
 *  6. 四色分级：相对历史均值的风险倍数 + 趋势方向
 */

const data = require('./national-data');

const START_YEAR = 2000;
const END_YEAR = 2019;
const N_MONTHS = (END_YEAR - START_YEAR + 1) * 12;

const LEVELS = {
  red: { label: '红色预警', color: '#d4380d' },
  orange: { label: '橙色预警', color: '#fa8c16' },
  yellow: { label: '黄色预警', color: '#fadb14' },
  green: { label: '正常', color: '#52c41a' }
};

function monthIndex(year, month) {
  return (year - START_YEAR) * 12 + (month - 1);
}

function monthAt(idx) {
  return {
    year: START_YEAR + Math.floor(idx / 12),
    month: (idx % 12) + 1
  };
}

function buildMonthlySeries(records, idField) {
  // records: [{id, year, month, total}]
  const map = new Map();
  for (const r of records) {
    if (!map.has(r[idField])) map.set(r[idField], new Array(N_MONTHS).fill(0));
    const arr = map.get(r[idField]);
    const idx = monthIndex(r.year, r.month);
    if (idx >= 0 && idx < N_MONTHS) arr[idx] += r.total;
  }
  return map;
}

function movingTrend(series, win = 12) {
  const t = new Array(series.length).fill(0);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= win) sum -= series[i - win];
    t[i] = i >= win - 1 ? sum / win : (i + 1 > 0 ? sum / (i + 1) : 0);
  }
  return t;
}

function seasonalIndices(series, trend) {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (let i = 0; i < series.length; i++) {
    const m = i % 12;
    if (trend[i] > 0) {
      sums[m] += series[i] / trend[i];
      counts[m] += 1;
    }
  }
  const idx = new Array(12);
  const mean = sums.reduce((a, b, i) => a + (counts[i] ? b / counts[i] : 0), 0) / 12;
  for (let m = 0; m < 12; m++) {
    const v = counts[m] ? sums[m] / counts[m] : 1;
    idx[m] = mean > 0 ? v / mean : 1;
  }
  return idx;
}

function linreg(y) {
  // 简单线性回归 y = a + b*x
  const n = y.length;
  if (n < 2) return { a: y[0] || 0, b: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += y[i];
    sxx += i * i;
    sxy += i * y[i];
  }
  const denom = n * sxx - sx * sx;
  const b = denom ? (n * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / n;
  return { a, b };
}

function distKm(a, b) {
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

function regionInfo(level, id) {
  if (level === 'province') return data.provinceByAdcode.get(id) || null;
  return data.cityByAdcode.get(id) || null;
}

function regionCenter(level, id) {
  const info = regionInfo(level, id);
  return info ? { lat: info.center[1], lng: info.center[0] } : null;
}

function spatialAdjust(level, id, series, trend, monthsBack = 3) {
  const info = regionInfo(level, id);
  if (!info) return 0;
  const center = regionCenter(level, id);
  // 候选邻居：邻接省，或同省其它城市
  let neighborIds = [];
  if (level === 'province') {
    neighborIds = data.PROVINCE_NEIGHBORS[id] || [];
  } else {
    const city = data.cityByAdcode.get(id);
    if (city) {
      neighborIds = (data.cityByProvince.get(city.provinceAdcode) || [])
        .filter((c) => c.adcode !== id)
        .slice(0, 6)
        .map((c) => c.adcode);
    }
  }
  if (!neighborIds.length || !center) return 0;

  const neighborSeriesMap = level === 'province'
    ? buildMonthlySeries(data.aggregates.byProvinceMonth, 'adcode')
    : buildMonthlySeries(
        data.aggregates.byCityYear.map((r) => ({ adcode: r.adcode, year: r.year, month: 1, total: r.total })),
        'adcode'
      );

  let wsum = 0;
  let wtotal = 0;
  for (const nid of neighborIds) {
    const nCenter = regionCenter(level, nid);
    if (!nCenter) continue;
    const nSeries = neighborSeriesMap.get(nid);
    if (!nSeries || nSeries.reduce((a, b) => a + b, 0) < 3) continue;
    const nTrend = movingTrend(nSeries, level === 'province' ? 12 : 3);
    const nSeasonal = seasonalIndices(nSeries, nTrend);
    // 邻居最近 12 个月实际/期望偏差率
    const periods = 12;
    let actual = 0;
    let expected = 0;
    for (let k = 1; k <= periods; k++) {
      const idx = nSeries.length - k;
      if (idx < 0) continue;
      actual += nSeries[idx];
      expected += Math.max(0.1, nTrend[idx]) * nSeasonal[idx % 12];
    }
    const ratio = expected > 0 ? actual / expected : 1;
    const d = Math.max(30, distKm(center, nCenter));
    const w = 1 / (d * d);
    wsum += w * ratio;
    wtotal += w;
  }
  if (!wtotal) return 0;
  const factor = wsum / wtotal;
  return (factor - 1) * Math.max(series[series.length - 1] || 0, 1);
}

function riskLevel(value, history, slope, strict) {
  if (history.length === 0) return 'green';
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = Math.sqrt(
    history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length
  ) || 1;
  const ratio = value / Math.max(mean, 0.5);
  const percentile = history.filter((x) => x <= value).length / history.length;
  let lv;
  if (strict) {
    if (ratio >= 2.4 || value >= mean + 3.2 * std) lv = 'red';
    else if (ratio >= 1.7 || value >= mean + 2.2 * std) lv = 'orange';
    else if (ratio >= 1.25) lv = 'yellow';
    else lv = 'green';
  } else if (ratio >= 2.0 || percentile >= 0.93 || value >= mean + 2.4 * std) lv = 'red';
  else if (ratio >= 1.45 || percentile >= 0.78 || value >= mean + 1.4 * std) lv = 'orange';
  else if (ratio >= 1.1 || percentile >= 0.55) lv = 'yellow';
  else lv = 'green';
  // 趋势上行升一级，下行降一级
  if (slope > 0.02 && lv !== 'red') lv = lv === 'green' ? 'yellow' : lv === 'yellow' ? 'orange' : 'red';
  if (slope < -0.02 && lv !== 'green') lv = lv === 'red' ? 'orange' : lv === 'orange' ? 'yellow' : 'green';
  return lv;
}

function forecastRegion(level, id, months) {
  const info = regionInfo(level, id);
  const name = info ? info.name : String(id);
  const center = regionCenter(level, id);

  let annual = null;
  if (level === 'city') {
    // 地市级：使用年度序列
    const records = data.aggregates.byCityYear
      .filter((r) => r.adcode === id && r.year >= 2000 && r.year <= 2019)
      .sort((a, b) => a.year - b.year);
    if (!records.length) return null;
    const values = records.map((r) => r.total);
    if (values.reduce((a, b) => a + b, 0) === 0) return null;
    const trend = movingTrend(values, 3);
    const lastBaseline = values.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, values.slice(-3).length);
    const trendRecent = trend.slice(-8);
    const { b } = linreg(trendRecent);
    const slopePerYear = b / Math.max(trend[trend.length - 1] || lastBaseline, 1);
    const lastYear = records[records.length - 1].year;
    const forecast = [];
    const recentVals = values.slice(-5);
    const meanRecent = recentVals.length
      ? recentVals.reduce((a, b) => a + b, 0) / recentVals.length
      : lastBaseline;
    for (let k = 1; k <= months; k++) {
      const base = Math.max(lastBaseline, 1) * (1 + slopePerYear * k * 0.8);
      const value = Math.min(
        Math.max(0, Math.round(base)),
        Math.max(5, Math.round(Math.max(lastBaseline, 1) * 3.2))
      );
      const ratio = value / Math.max(meanRecent, 1);
      let lv = ratio >= 1.35 ? 'red' : ratio >= 1.18 ? 'orange' : ratio >= 1.06 ? 'yellow' : 'green';
      if (slopePerYear > 0.05 && lv !== 'red') lv = lv === 'orange' ? 'red' : lv === 'yellow' ? 'orange' : lv;
      if (slopePerYear < -0.03 && lv !== 'green') lv = lv === 'red' ? 'orange' : lv === 'orange' ? 'yellow' : 'green';
      forecast.push({
        year: lastYear + k,
        month: 1,
        value,
        changePct: lastBaseline > 0 ? Math.round(((value - lastBaseline) / lastBaseline) * 100) : 100,
        level: lv,
        color: LEVELS[lv].color,
        label: LEVELS[lv].label
      });
    }
    return {
      id,
      name,
      provinceAdcode: records[0].provinceAdcode,
      center,
      historyTotal: values.reduce((a, b) => a + b, 0),
      lastValue: Math.round(lastBaseline),
      trendPct: Math.round(slopePerYear * 100),
      forecast
    };
  }

  const records = data.aggregates.byProvinceMonth.filter((r) => r.adcode === id);
  if (!records.length) return null;

  const seriesMap = buildMonthlySeries(records, 'adcode');
  const series = seriesMap.get(id);
  if (!series || series.reduce((a, b) => a + b, 0) === 0) return null;

  const trend = movingTrend(series, 12);
  const seasonal = seasonalIndices(series, trend);
  const lastTrend = trend[N_MONTHS - 1] || series[N_MONTHS - 1] || 1;
  // 近期基准：近 12 个月均值（避免数据收集截止导致的尾部缺失失真）
  const recent = series.slice(-12);
  const lastBaseline = recent.length
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : series[N_MONTHS - 1] || 0;

  // 近 24 个月趋势回归
  const trendRecent = [];
  for (let i = Math.max(0, N_MONTHS - 24); i < N_MONTHS; i++) trendRecent.push(trend[i] || 0);
  const { b } = linreg(trendRecent);
  const slopePerMonth = b / Math.max(lastTrend, 1);

  const forecast = [];
  for (let k = 1; k <= months; k++) {
    const targetIdx = N_MONTHS - 1 + k;
    const m = targetIdx % 12;
    let base = Math.max(lastBaseline, 1) * seasonal[m] * (1 + slopePerMonth * k * 0.5);
    base = Math.max(0, base);
    // 空间修正（小幅）
    const adjust = spatialAdjust(level, id, series, trend);
    const value = Math.min(
      Math.max(0, Math.round(base + adjust * 0.15)),
      Math.max(5, Math.round(Math.max(lastBaseline, 1) * 4))
    );
    const last = Math.round(lastBaseline);
    const changePct = last > 0 ? Math.round(((value - last) / last) * 100) : 100;
    const lv = riskLevel(value, series.filter((x) => x > 0 || true), slopePerMonth);
    const tm = monthAt(targetIdx);
    forecast.push({
      year: tm.year,
      month: tm.month,
      value,
      changePct,
      level: lv,
      color: LEVELS[lv].color,
      label: LEVELS[lv].label
    });
  }

    return {
      id,
      name,
      provinceAdcode: id,
      center,
    historyTotal: series.reduce((a, b) => a + b, 0),
    lastValue: Math.round(lastBaseline),
    trendPct: Math.round(slopePerMonth * 1200), // 年化趋势%
    forecast
  };
}

function holdoutQuality(level) {
  // 用 2018-01 ~ 2018-12（数据完整年份）做滚动回测
  let totalErr = 0;
  let totalObs = 0;
  let n = 0;
  const records = level === 'province'
    ? data.aggregates.byProvinceMonth
    : data.aggregates.byCityYear.map((r) => ({ adcode: r.adcode, year: r.year, month: 1, total: r.total }));
  const ids = [...new Set(records.map((r) => r.adcode))].slice(0, level === 'province' ? 31 : 80);
  const map = buildMonthlySeries(records, 'adcode');
  for (const id of ids) {
    const series = map.get(id);
    if (!series) continue;
    const start = monthIndex(2018, 1);
    const end = monthIndex(2018, 12);
    for (let t = start; t <= end; t++) {
      const hist = series.slice(0, t);
      if (hist.reduce((a, b) => a + b, 0) < 5) continue;
      const trend = movingTrend(hist, 12);
      const seasonal = seasonalIndices(hist, trend);
      const lastT = trend[t - 1] || hist[t - 1] || 0;
      const pred = lastT * seasonal[t % 12];
      const obs = series[t];
      totalErr += Math.abs(obs - pred);
      totalObs += Math.abs(obs);
      n += 1;
    }
  }
  const mape = totalObs > 0 ? (totalErr / totalObs) * 100 : null;
  const acc = mape === null ? null : Math.max(0, 100 - mape);
  return {
    window: '2018-01 ~ 2018-12 滚动回测',
    samples: n,
    mape: mape === null ? null : Number(mape.toFixed(1)),
    accuracy: acc === null ? null : Number(acc.toFixed(1))
  };
}

function predict(opts = {}) {
  const level = opts.level || 'province';
  const months = Math.min(6, Math.max(1, Number(opts.months || 3)));
  const top = Number(opts.top || 0);
  const ids = level === 'province'
    ? data.aggregates.byProvince.map((x) => x.adcode)
    : [...new Set(data.aggregates.byCity.filter((x) => x.adcode > 0).map((x) => x.adcode))];

  let items = ids
    .map((id) => forecastRegion(level, id, months))
    .filter(Boolean)
    .sort((a, b) => b.forecast[0].value - a.forecast[0].value);

  if (top > 0) items = items.slice(0, top);

  const firstMonth = monthAt(N_MONTHS);
  const totalForecast = items.reduce((s, x) => s + (x.forecast[0] ? x.forecast[0].value : 0), 0);
  const totalLast = items.reduce((s, x) => s + x.lastValue, 0);
  const redCount = items.filter((x) => x.forecast[0].level === 'red').length;
  const orangeCount = items.filter((x) => x.forecast[0].level === 'orange').length;
  const yellowCount = items.filter((x) => x.forecast[0].level === 'yellow').length;

  return {
    generatedAt: new Date().toISOString(),
    model: 'STL-Lite + 空间邻域平滑 + 趋势外推',
    level,
    months,
    forecastFrom: `${firstMonth.year}-${String(firstMonth.month).padStart(2, '0')}`,
    quality: holdoutQuality(level),
    summary: {
      totalForecast,
      changePct: totalLast > 0 ? Math.round(((totalForecast - totalLast) / totalLast) * 100) : 0,
      redCount,
      orangeCount,
      yellowCount,
      normalCount: items.length - redCount - orangeCount - yellowCount,
      regions: items.length
    },
    items
  };
}

function seriesForRegion(level, id) {
  if (Number(id) === 0) return null;
  if (level === 'city') {
    const rows = data.aggregates.byCityYear
      .filter((r) => r.adcode === Number(id) && r.year >= 2000 && r.year <= 2019)
      .sort((a, b) => a.year - b.year);
    const fc = forecastRegion(level, Number(id), 3);
    return {
      labels: rows.map((r) => String(r.year)),
      values: rows.map((r) => r.total),
      forecast: fc ? fc.forecast : []
    };
  }
  let records;
  records = data.aggregates.byProvinceMonth.filter((r) => r.adcode === Number(id));
  const map = buildMonthlySeries(records, 'adcode');
  const series = map.get(Number(id));
  if (!series) return null;
  const labels = [];
  const values = [];
  for (let i = 0; i < N_MONTHS; i++) {
    const m = monthAt(i);
    labels.push(`${m.year}-${String(m.month).padStart(2, '0')}`);
    values.push(series[i]);
  }
  const fc = forecastRegion(level, Number(id), 3);
  return { labels, values, forecast: fc ? fc.forecast : [] };
}

module.exports = { predict, seriesForRegion, holdoutQuality, LEVELS };
