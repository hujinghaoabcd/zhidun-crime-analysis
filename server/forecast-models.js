'use strict';

/**
 * 多模型预测引擎（演示用 Lite 实现）
 *  - Seasonal Naive（基准）
 *  - Holt-Winters 指数平滑
 *  - SARIMA-Lite（季节差分 + 自回归）
 *  - STARMA-Lite（空间-时间自回归，邻域滞后）
 *  - Prophet-Lite（线性趋势 + 傅里叶季节）
 *  - XGBoost-Lite（梯度提升回归树）
 *  - 加权集成（按 2018 回测 MAPE 加权）
 */

const data = require('./national-data');

const START_YEAR = 2000;
const END_YEAR = 2019;
const N = (END_YEAR - START_YEAR + 1) * 12;

const LEVELS = {
  red: { label: '红色预警', color: '#d4380d' },
  orange: { label: '橙色预警', color: '#fa8c16' },
  yellow: { label: '黄色预警', color: '#fadb14' },
  green: { label: '正常', color: '#52c41a' }
};

function seriesForProvince(adcode) {
  const arr = new Array(N).fill(0);
  for (const r of data.aggregates.byProvinceMonth) {
    if (r.adcode !== adcode) continue;
    const idx = (r.year - START_YEAR) * 12 + (r.month - 1);
    if (idx >= 0 && idx < N) arr[idx] += r.total;
  }
  return arr;
}

function monthAt(idx) {
  return { year: START_YEAR + Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// ---------- 线性代数 ----------
function ols(X, y, lambda = 0.1) {
  const n = X.length;
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 0; a < p; a++) XtX[a][a] += lambda;
  return gauss(XtX, Xty);
}

function gauss(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// ---------- 模型 ----------
function seasonalNaiveForecast(series, h) {
  const out = [];
  for (let k = 1; k <= h; k++) {
    const idx = series.length - 1 + k - 12;
    out.push(idx >= 0 ? Math.max(0, series[idx] || 0) : 0);
  }
  return out;
}

function holtWintersForecast(series, h) {
  const m = 12;
  if (series.length < m * 2) return seasonalNaiveForecast(series, h);
  let best = null;
  let bestSse = Infinity;
  const alphas = [0.1, 0.2, 0.3, 0.4, 0.6];
  const betas = [0.01, 0.05, 0.1];
  const gammas = [0.1, 0.2, 0.4, 0.6];
  for (const alpha of alphas) {
    for (const beta of betas) {
      for (const gamma of gammas) {
        const s = m;
        let level = series.slice(0, s).reduce((a, b) => a + b, 0) / s;
        let trend = (series[s] - series[0]) / s;
        const season = new Array(m).fill(1);
        for (let i = 0; i < s; i++) season[i] = Math.max(series[i] / level, 0.01);
        let sse = 0;
        for (let t = s; t < series.length; t++) {
          const prevLevel = level;
          const pred = (level + trend) * season[t % m];
          const err = series[t] - pred;
          sse += err * err;
          const ratio = series[t] / Math.max(prevLevel, 1);
          level = alpha * series[t] + (1 - alpha) * (level + trend);
          trend = beta * (level - prevLevel) + (1 - beta) * trend;
          season[t % m] = gamma * ratio + (1 - gamma) * season[t % m];
        }
        if (sse < bestSse) {
          bestSse = sse;
          best = { alpha, beta, gamma, level, trend, season };
        }
      }
    }
  }
  if (!best) return seasonalNaiveForecast(series, h);
  const out = [];
  let { level, trend, season } = best;
  for (let k = 1; k <= h; k++) {
    const idx = series.length - 1 + k;
    const v = Math.max(0, (level + trend * k) * season[idx % m]);
    out.push(v);
  }
  return out;
}

function sarimaLiteForecast(series, h) {
  // 季节差分 y'=y-y12，再对 y' 做 AR(1) 线性回归
  const X = [];
  const y = [];
  for (let t = 13; t < series.length; t++) {
    X.push([1, series[t - 1] - series[t - 13], series[t - 12] - series[t - 24] || 0]);
    y.push(series[t] - series[t - 12]);
  }
  const beta = X.length >= 3 ? ols(X, y) : [0, 0.5, 0.1];
  const diff = series[series.length - 1] - (series[series.length - 13] || 0);
  const out = [];
  let lastDiff = diff;
  for (let k = 1; k <= h; k++) {
    const prevY = series[series.length - 1 + (k - 1)] || 0;
    const prevY12 = series[series.length - 13 + (k - 1)] || 0;
    const prevDiff = prevY - prevY12;
    const predDiff = beta[0] + beta[1] * prevDiff + beta[2] * (prevDiff || 0);
    const value = Math.max(0, prevY12 + predDiff);
    out.push(value);
    lastDiff = predDiff;
  }
  return out;
}

function starmaLiteForecast(series, h, neighborSeries) {
  const nb = neighborSeries || new Array(N).fill(0);
  const X = [];
  const y = [];
  for (let t = 13; t < series.length; t++) {
    X.push([1, series[t - 1], series[t - 12], nb[t - 1]]);
    y.push(series[t]);
  }
  const beta = X.length >= 4 ? ols(X, y) : [0, 0.6, 0.3, 0.1];
  const out = [];
  for (let k = 1; k <= h; k++) {
    const t = series.length - 1 + k;
    const prev = series[t - 1] || 0;
    const prev12 = series[t - 12] || 0;
    const prevNb = nb[t - 1] || 0;
    const value = Math.max(0, beta[0] + beta[1] * prev + beta[2] * prev12 + beta[3] * prevNb);
    out.push(value);
  }
  return out;
}

function fourierFeatures(t, kMax) {
  const f = [1, t];
  for (let k = 1; k <= kMax; k++) {
    f.push(Math.sin((2 * Math.PI * k * t) / 12));
    f.push(Math.cos((2 * Math.PI * k * t) / 12));
  }
  return f;
}

function prophetLiteForecast(series, h) {
  const X = [];
  const y = [];
  const kMax = 3;
  for (let t = 0; t < series.length; t++) {
    X.push(fourierFeatures(t, kMax));
    y.push(series[t]);
  }
  const beta = ols(X, y);
  const out = [];
  for (let k = 1; k <= h; k++) {
    const f = fourierFeatures(series.length - 1 + k, kMax);
    const v = Math.max(0, f.reduce((s, x, i) => s + x * beta[i], 0));
    out.push(v);
  }
  return out;
}

// ---------- XGBoost-Lite（梯度提升回归树） ----------
function buildFeatures(series, t) {
  return [
    series[t - 1] || 0,
    series[t - 2] || 0,
    series[t - 3] || 0,
    series[t - 12] || 0,
    series[t - 13] || 0,
    (t % 12) + 1,
    Math.floor(t / 12) + START_YEAR,
    series[Math.max(0, t - 12)] || 0
  ];
}

function fitTree(X, y, depth, minLeaf) {
  const n = X.length;
  if (n < minLeaf || depth <= 0) return { value: n ? y.reduce((a, b) => a + b, 0) / n : 0 };
  const mean = y.reduce((a, b) => a + b, 0) / n;
  const parentSse = y.reduce((a, b) => a + (b - mean) ** 2, 0);
  let best = null;
  for (let f = 0; f < X[0].length; f++) {
    const sorted = [...new Set(X.map((r) => r[f]))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const thr = (sorted[i] + sorted[i + 1]) / 2;
      const left = [];
      const right = [];
      for (let j = 0; j < n; j++) {
        if (X[j][f] <= thr) left.push(j);
        else right.push(j);
      }
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const lm = left.reduce((s, j) => s + y[j], 0) / left.length;
      const rm = right.reduce((s, j) => s + y[j], 0) / right.length;
      let sse = 0;
      for (const j of left) sse += (y[j] - lm) ** 2;
      for (const j of right) sse += (y[j] - rm) ** 2;
      if (sse < parentSse && (!best || sse < best.sse)) {
        best = { f, thr, sse, left: left.slice(), right: right.slice() };
      }
    }
  }
  if (!best) return { value: mean };
  const lx = best.left.map((j) => X[j]);
  const ly = best.left.map((j) => y[j]);
  const rx = best.right.map((j) => X[j]);
  const ry = best.right.map((j) => y[j]);
  return {
    f: best.f,
    thr: best.thr,
    left: fitTree(lx, ly, depth - 1, minLeaf),
    right: fitTree(rx, ry, depth - 1, minLeaf)
  };
}

function treePredict(tree, x) {
  if (tree.value !== undefined) return tree.value;
  return x[tree.f] <= tree.thr ? treePredict(tree.left, x) : treePredict(tree.right, x);
}

function xgboostLiteForecast(series, h) {
  const X = [];
  const y = [];
  for (let t = 13; t < series.length; t++) {
    X.push(buildFeatures(series, t));
    y.push(series[t]);
  }
  if (X.length < 20) return seasonalNaiveForecast(series, h);
  let pred = new Array(X.length).fill(y.reduce((a, b) => a + b, 0) / y.length);
  const trees = [];
  const lr = 0.08;
  for (let it = 0; it < 60; it++) {
    const resid = y.map((v, i) => v - pred[i]);
    const tree = fitTree(X, resid, 3, 5);
    trees.push(tree);
    for (let i = 0; i < X.length; i++) pred[i] += lr * treePredict(tree, X[i]);
  }
  const out = [];
  for (let k = 1; k <= h; k++) {
    let v = 0;
    const fx = buildFeatures(series, series.length - 1 + k);
    for (const tree of trees) v += lr * treePredict(tree, fx);
    out.push(Math.max(0, v));
  }
  return out;
}

// ---------- 评估与集成 ----------
function mape(preds, actuals) {
  let err = 0;
  let obs = 0;
  for (let i = 0; i < actuals.length; i++) {
    err += Math.abs(preds[i] - actuals[i]);
    obs += Math.abs(actuals[i]);
  }
  return obs > 0 ? (err / obs) * 100 : null;
}

function runModel(name, fn, series, neighbor) {
  // 用 2017 年底拟合，预测 2018 全年
  const train = series.slice(0, N - 12);
  const actuals = series.slice(N - 12);
  const preds = fn(train, 12, neighbor);
  const m = mape(preds, actuals);
  const next3 = fn(series, 3, neighbor);
  return { name, mape: m, next3 };
}

function riskLevel(value, history) {
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length) || 1;
  const ratio = value / Math.max(mean, 0.5);
  let lv = ratio >= 2.0 ? 'red' : ratio >= 1.45 ? 'orange' : ratio >= 1.1 ? 'yellow' : 'green';
  return lv;
}

function neighborSeries(adcode) {
  const out = new Array(N).fill(0);
  const ids = data.PROVINCE_NEIGHBORS[adcode] || [];
  if (!ids.length) return out;
  for (const nid of ids) {
    const s = seriesForProvince(nid);
    for (let i = 0; i < N; i++) out[i] += s[i];
  }
  return out.map((v) => v / ids.length);
}

function runAllModels(level) {
  const ids = level === 'province'
    ? data.aggregates.byProvince.filter((x) => x.adcode > 0).map((x) => x.adcode)
    : [];
  const models = [
    { key: 'sarima', name: 'SARIMA-Lite' },
    { key: 'starma', name: 'STARMA-Lite' },
    { key: 'prophet', name: 'Prophet-Lite' },
    { key: 'xgboost', name: 'XGBoost-Lite' }
  ];
  const modelResults = models.map((m) => ({ ...m, mape: 0, next: 0 }));
  const ensemble = [];
  const itemsByModel = {};
  for (const m of models) itemsByModel[m.key] = [];
  for (const adcode of ids) {
    const series = seriesForProvince(adcode);
    if (!series.reduce((a, b) => a + b, 0)) continue;
    const nb = neighborSeries(adcode);
    const fns = {
      sarima: sarimaLiteForecast,
      starma: (s, h) => starmaLiteForecast(s, h, nb),
      prophet: prophetLiteForecast,
      xgboost: xgboostLiteForecast
    };
    const results = [];
    for (const m of models) {
      const r = runModel(m.key, fns[m.key], series, nb);
      results.push(r);
      modelResults.find((x) => x.key === m.key).mape += r.mape || 0;
      modelResults.find((x) => x.key === m.key).next += r.next3[0] || 0;
    }
    // 集成：按 MAPE 倒数加权（无回测结果给 0 权重）
    const weights = results.map((r) => (r.mape && r.mape > 0 ? 1 / r.mape : 0));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const ensNext = results.reduce((s, r, i) => s + (r.next3[0] || 0) * weights[i], 0) / wsum;
    const info = data.provinceByAdcode.get(adcode);
    const last = series.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const tm = monthAt(N);
    const base = {
      id: adcode,
      name: info ? info.name : String(adcode),
      center: info ? { lat: info.center[1], lng: info.center[0] } : null,
      lastValue: Math.round(last),
      trendPct: 0
    };
    const makeItem = (val) => {
      const lv = riskLevel(val, series);
      return {
        ...base,
        forecast: [
          {
            year: tm.year,
            month: tm.month,
            value: Math.round(val),
            changePct: last > 0 ? Math.round(((val - last) / last) * 100) : 0,
            level: lv,
            color: LEVELS[lv].color,
            label: LEVELS[lv].label
          }
        ]
      };
    };
    results.forEach((r, i) => {
      itemsByModel[models[i].key].push(makeItem(r.next3[0] || 0));
    });
    ensemble.push(makeItem(ensNext));
  }
  for (const m of modelResults) {
    m.mape = Number((m.mape / Math.max(1, ids.length)).toFixed(1));
    m.next = Math.round(m.next / Math.max(1, ids.length));
    m.accuracy = m.mape === null ? null : Number(Math.max(0, 100 - m.mape).toFixed(1));
  }
  const totalForecast = ensemble.reduce((s, x) => s + x.forecast[0].value, 0);
  const totalLast = ensemble.reduce((s, x) => s + x.lastValue, 0);
  const count = (lv) => ensemble.filter((x) => x.forecast[0].level === lv).length;
  const ensembleSummary = {
    totalForecast,
    changePct: totalLast > 0 ? Math.round(((totalForecast - totalLast) / totalLast) * 100) : 0,
    redCount: count('red'),
    orangeCount: count('orange'),
    yellowCount: count('yellow'),
    normalCount: count('green'),
    regions: ensemble.length
  };
  return { models: modelResults, ensemble, itemsByModel, ensembleSummary };
}

module.exports = { runAllModels };
