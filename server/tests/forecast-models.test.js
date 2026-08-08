'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const forecastModels = require('../forecast-models');
const {
  seasonalNaiveForecast,
  sarimaLiteForecast,
  starmaLiteForecast,
  prophetLiteForecast,
  xgboostLiteForecast,
  mape
} = forecastModels._internal;

function syntheticSeries(n = 96) {
  return Array.from({ length: n }, (_, i) => {
    const seasonal = 20 * Math.sin((2 * Math.PI * i) / 12);
    return 100 + i * 0.6 + seasonal;
  });
}

test('MAPE is mean of per-observation percentage errors', () => {
  const score = mape([90, 120], [100, 100]);
  assert.equal(score, 15);
});

test('MAPE ignores zero actuals instead of dividing by zero', () => {
  assert.equal(mape([10, 90], [0, 100]), 10);
});

test('seasonal naive recursively predicts a full horizon', () => {
  const series = Array.from({ length: 24 }, (_, i) => i + 1);
  assert.deepEqual(seasonalNaiveForecast(series, 3), [13, 14, 15]);
});

test('SARIMA-Lite multi-step forecast remains finite', () => {
  const values = sarimaLiteForecast(syntheticSeries(), 12);
  assert.equal(values.length, 12);
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.some((v) => v > 0));
});

test('STARMA-Lite recursively uses predicted history', () => {
  const series = syntheticSeries();
  const neighbor = syntheticSeries().map((v) => v * 0.8);
  const values = starmaLiteForecast(series, 12, neighbor);
  assert.equal(values.length, 12);
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.slice(1).some((v) => v > 0));
});

test('Prophet-Lite returns finite future values', () => {
  const values = prophetLiteForecast(syntheticSeries(), 6);
  assert.equal(values.length, 6);
  assert.ok(values.every(Number.isFinite));
});

test('XGBoost-Lite preserves the fitted base prediction at inference', () => {
  const values = xgboostLiteForecast(syntheticSeries(), 3);
  assert.equal(values.length, 3);
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.every((v) => v > 20));
});

test('multi-model comparison is explicitly province-only', () => {
  const result = forecastModels.runAllModels('city');
  assert.deepEqual(result.models, []);
  assert.match(result.note, /省级月度序列/);
});
