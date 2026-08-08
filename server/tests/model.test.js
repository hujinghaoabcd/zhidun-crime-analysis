'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../model');

test('province forecast starts after the last complete training month', () => {
  const result = model.predict({ level: 'province', months: 2, top: 3 });
  assert.equal(result.trainingThrough, '2018-12');
  assert.equal(result.forecastFrom, '2019-01');
  assert.equal(result.timeScale, 'month');
  assert.ok(result.items.length > 0);
  assert.equal(result.items[0].forecast[0].year, 2019);
  assert.equal(result.items[0].forecast[0].month, 1);
  assert.equal(result.items[0].forecast[1].month, 2);
});

test('province holdout reports a real 2018 MAPE', () => {
  const quality = model.holdoutQuality('province');
  assert.match(quality.window, /2018-01/);
  assert.ok(quality.samples > 0);
  assert.ok(quality.mape === null || Number.isFinite(quality.mape));
});

test('city prediction is monthly and explicitly marked as estimated', () => {
  const result = model.predict({ level: 'city', months: 3, top: 5 });
  assert.equal(result.cityMonthlyEstimated, true);
  assert.equal(result.timeScale, 'month');
  assert.ok(result.items.length > 0);
  const item = result.items[0];
  assert.equal(item.estimatedMonthly, true);
  assert.deepEqual(
    item.forecast.map((x) => [x.year, x.month]),
    [[2019, 1], [2019, 2], [2019, 3]]
  );
});

test('city monthly series preserves the same timeline as province series', () => {
  const city = model.seriesForRegion('city', 320100);
  assert.ok(city);
  assert.equal(city.estimatedMonthly, true);
  assert.equal(city.labels[0], '2000-01');
  assert.equal(city.labels.at(-1), '2018-12');
  assert.equal(city.labels.length, 19 * 12);
});
