'use strict';

/**
 * 多模型预测引擎（演示用 Lite 实现）
 *
 * 注意：这些模型是为了浏览器/Node 演示而实现的轻量近似版本，
 * 并不是 statsmodels SARIMA、Meta Prophet 或官方 XGBoost 的封装。
 *
 *  - Seasonal Naive：季节朴素基准
 *  - SARIMA-Lite：季节差分 + 自回归
 *  - STARMA-Lite：时间滞后 + 邻域滞后回归
 *  - Prophet-Lite：线性趋势 + 傅里叶季节项
 *  - XGBoost-Lite：自实现梯度提升回归树
 *  - Ensemble：按 2018 年留出集 MAPE 的倒数加权
 */

const data = require('./national-data');

const START_YEAR = 2000;
const END_YEAR = 2019;
const N = (END_YEAR - START_YEAR + 1) * 12;
const HOLDOUT_YEAR = 2018;
const HOLDOUT_START = (HOLDOUT_YEAR - START_YEAR) * 12;
const HOLDOUT_END = HOLDOUT_START + 12;

const LEVELS = {
  red: { label: '红色预警', color: '#d4380d' },
  orange: { label: '橙色预警', color: '#fa8c16' },
  yellow: { label: '黄色预警', color: '#fadb14' },
  green: { label: '正常', color: '#52c41a' }
};

function seriesForProvince(adcode) {
  const arr = new Array(N).fill(0);
  for (const r of data.aggregates.byProvinceMonth || []) {
    if (r.adcode !== adcode) continue;
    const idx = (r.year - START_YEAR) * 12 + (r.month - 1);
    if (idx >= 0 && idx < N) arr[idx] += Number(r.total) || 0;
  }
  return arr;
}

function monthAt(idx) {
  return {
    year: START_YEAR + Math.floor(idx / 12),
    month: (idx % 12) + 1
  };
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ---------- 线性代数 ----------
function ols(X, y, lambda = 0.1) {
  if (!X.length || !X[0].length) return [];
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
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = Math.abs(M[col][col]) < 1e-12 ? 1e-12 : M[col][col];
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
  const work = series.slice();
  const out = [];
  for (let k = 0; k < h; k++) {
    const t = work.length;
    const value = t >= 12 ? Math.max(0, Number(work[t - 12]) || 0) : Math.max(0, work[t - 1] || 0);
    work.push(value);
    out.push(value);
  }
  return out;
}

function sarimaLiteForecast(series, h) {
  if (series.length < 26) return seasonalNaiveForecast(series, h);
  const X = [];
  const y = [];
  for (let t = 24; t < series.length; t++) {
    const d1 = series[t - 1] - series[t - 13];
    const d12 = series[t - 12] - series[t - 24];
    X.push([1, d1, d12]);
    y.push(series[t] - series[t - 12]);
  }
  const beta = X.length >= 6 ? ols(X, y) : [0, 0.6, 0.2];
  const work = series.slice();
  const out = [];
  for (let k = 0; k < h; k++) {
    const t = work.length;
    const d1 = work[t - 1] - work[t - 13];
    const d12 = work[t - 12] - work[t - 24];
    const predDiff = beta[0] + beta[1] * d1 + beta[2] * d12;
    const value = Math.max(0, work[t - 12] + predDiff);
    work.push(value);
    out.push(value);
  }
  return out;
}

function starmaLiteForecast(series, h, neighborSeries) {
  const nb = Array.isArray(neighborSeries) ? neighborSeries.slice() : new Array(series.length).fill(0);
  if (series.length < 14) return seasonalNaiveForecast(series, h);
  const X = [];
  const y = [];
  for (let t = 12; t < series.length; t++) {
    X.push([1, series[t - 1], series[t - 12], nb[t - 1] || 0]);
    y.push(series[t]);
  }
  const beta = X.length >= 8 ? ols(X, y) : [0, 0.6, 0.3, 0.1];
  const work = series.slice();
  const nbFuture = seasonalNaiveForecast(nb, h);
  const nbWork = nb.concat(nbFuture);
  const out = [];
  for (let k = 0; k < h; k++) {
    const t = work.length;
    const value = Math.max(
      0,
      beta[0] +
        beta[1] * (work[t - 1] || 0) +
        beta[2] * (work[t - 12] || 0) +
        beta[3] * (nbWork[t - 1] || 0)
    );
    work.push(value);
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
    const value = f.reduce((s, x, i) => s + x * (beta[i] || 0), 0);
    out.push(Math.max(0, value));
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
    Math.floor(t / 12) + START_YEAR
  ];
}

function fitTree(X, y, depth, minLeaf) {
  const n = X.length;
  if (!n) return { value: 0 };
  const nodeMean = mean(y);
  if (n < minLeaf * 2 || depth <= 0) return { value: nodeMean };
  const parentSse = y.reduce((a, b) => a + (b - nodeMean) ** 2, 0);
  let best = null;

  for (let f = 0; f < X[0].length; f++) {
    const sorted = [...new Set(X.map((r) => r[f]))].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const thr = (sorted[i] + sorted[i + 1]) / 2;
      const left = [];
      const right = [];
      for (let j = 0; j < n; j++) (X[j][f] <= thr ? left : right).push(j);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const lm = mean(left.map((j) => y[j]));
      const rm = mean(right.map((j) => y[j]));
      let sse = 0;
      for (const j of left) sse += (y[j] - lm) ** 2;
      for (const j of right) sse += (y[j] - rm) ** 2;
      if (sse < parentSse && (!best || sse < best.sse)) best = { f, thr, sse, left, right };
    }
  }

  if (!best) return { value: nodeMean };
  return {
    f: best.f,
    thr: best.thr,
    left: fitTree(best.left.map((j) => X[j]), best.left.map((j) => y[j]), depth - 1, minLeaf),
    right: fitTree(best.right.map((j) => X[j]), best.right.map((j) => y[j]), depth - 1, minLeaf)
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

  const base = mean(y);
  const pred = new Array(X.length).fill(base);
  const trees = [];
  const lr = 0.08;
  for (let it = 0; it < 60; it++) {
    const resid = y.map((v, i) => v - pred[i]);
    const tree = fitTree(X, resid, 3, 5);
    trees.push(tree);
    for (let i = 0; i < X.length; i++) pred[i] += lr * treePredict(tree, X[i]);
  }

  const work = series.slice();
  const out = [];
  for (let k = 0; k < h; k++) {
    const fx = buildFeatures(work, work.length);
    let value = base;
    for (const tree of trees) value += lr * treePredict(tree, fx);
    value = Math.max(0, value);
    work.push(value);
    out.push(value);
  }
  return out;
}

// ---------- 评估与集成 ----------
function mape(preds, actuals) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < Math.min(preds.length, actuals.length); i++) {
    const actual = Number(actuals[i]) || 0;
    if (actual === 0) continue;
    sum += Math.abs((preds[i] - actual) / actual);
    n += 1;
  }
  return n ? (sum / n) * 100 : null;
}

function runModel(name, fn, series) {
  // 2018 年为完整留出集：训练截至 2017-12，预测 2018-01 ~ 2018-12。
  const train = series.slice(0, HOLDOUT_START);
  const actuals = series.slice(HOLDOUT_START, HOLDOUT_END);
  const preds = fn(train, 12);
  const score = mape(preds, actuals);
  const next3 = fn(series, 3);
  return { name, mape: score, next3 };
}

function riskLevel(value, history) {
  const valid = history.filter((x) => Number.isFinite(x));
  const avg = mean(valid);
  const std = Math.sqrt(mean(valid.map((x) => (x - avg) ** 2))) || 1;
  const ratio = value / Math.max(avg, 0.5);
  if (ratio >= 2.0 || value >= avg + 2.4 * std) return 'red';
  if (ratio >= 1.45 || value >= avg + 1.4 * std) return 'orange';
  if (ratio >= 1.1) return 'yellow';
  return 'green';
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
  // 当前 Lite 多模型仅对省级月序列做严格同尺度比较。
  if (level !== 'province') {
    return {
      models: [],
      ensemble: [],
      itemsByModel: {},
      ensembleSummary: {
        totalForecast: 0,
        changePct: 0,
        redCount: 0,
        orangeCount: 0,
        yellowCount: 0,
        normalCount: 0,
        regions: 0
      },
      note: 'Lite 多模型比较当前仅支持省级月度序列。'
    };
  }

  const ids = data.aggregates.byProvince.filter((x) => x.adcode > 0).map((x) => x.adcode);
  const models = [
    { key: 'sarima', name: 'SARIMA-Lite' },
    { key: 'starma', name: 'STARMA-Lite' },
    { key: 'prophet', name: 'Prophet-Lite' },
    { key: 'xgboost', name: 'XGBoost-Lite' }
  ];
  const modelResults = models.map((m) => ({ ...m, mape: 0, next: 0, samples: 0 }));
  const ensemble = [];
  const itemsByModel = Object.fromEntries(models.map((m) => [m.key, []]));

  for (const adcode of ids) {
    const series = seriesForProvince(adcode);
    if (!series.some((v) => v > 0)) continue;
    const nb = neighborSeries(adcode);
    const fns = {
      sarima: (s, h) => sarimaLiteForecast(s, h),
      starma: (s, h) => starmaLiteForecast(s, h, nb.slice(0, s.length)),
      prophet: (s, h) => prophetLiteForecast(s, h),
      xgboost: (s, h) => xgboostLiteForecast(s, h)
    };

    const results = models.map((m) => runModel(m.key, fns[m.key], series));
    results.forEach((r, i) => {
      const mr = modelResults[i];
      if (r.mape !== null && Number.isFinite(r.mape)) {
        mr.mape += r.mape;
        mr.samples += 1;
      }
      mr.next += r.next3[0] || 0;
    });

    const weights = results.map((r) => (r.mape && r.mape > 0 ? 1 / r.mape : 0));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const fallback = mean(results.map((r) => r.next3[0] || 0));
    const ensNext = wsum
      ? results.reduce((s, r, i) => s + (r.next3[0] || 0) * weights[i], 0) / wsum
      : fallback;

    const info = data.provinceByAdcode.get(adcode);
    const last = mean(series.slice(-12));
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
        forecast: [{
          year: tm.year,
          month: tm.month,
          value: Math.round(val),
          changePct: last > 0 ? Math.round(((val - last) / last) * 100) : 0,
          level: lv,
          color: LEVELS[lv].color,
          label: LEVELS[lv].label
        }]
      };
    };

    results.forEach((r, i) => itemsByModel[models[i].key].push(makeItem(r.next3[0] || 0)));
    ensemble.push(makeItem(ensNext));
  }

  for (const m of modelResults) {
    m.mape = m.samples ? Number((m.mape / m.samples).toFixed(1)) : null;
    m.next = Math.round(m.next / Math.max(1, ensemble.length));
    m.accuracy = m.mape === null ? null : Number(Math.max(0, 100 - m.mape).toFixed(1));
    delete m.samples;
  }

  const totalForecast = ensemble.reduce((s, x) => s + x.forecast[0].value, 0);
  const totalLast = ensemble.reduce((s, x) => s + x.lastValue, 0);
  const count = (lv) => ensemble.filter((x) => x.forecast[0].level === lv).length;
  return {
    models: modelResults,
    ensemble,
    itemsByModel,
    ensembleSummary: {
      totalForecast,
      changePct: totalLast > 0 ? Math.round(((totalForecast - totalLast) / totalLast) * 100) : 0,
      redCount: count('red'),
      orangeCount: count('orange'),
      yellowCount: count('yellow'),
      normalCount: count('green'),
      regions: ensemble.length
    },
    backtestWindow: '2018-01 ~ 2018-12',
    metric: 'MAPE (zero actuals excluded)'
  };
}

module.exports = {
  runAllModels,
  _internal: {
    seasonalNaiveForecast,
    sarimaLiteForecast,
    starmaLiteForecast,
    prophetLiteForecast,
    xgboostLiteForecast,
    mape
  }
};
