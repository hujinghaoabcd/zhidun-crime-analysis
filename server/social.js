'use strict';

/**
 * 社会信息指标（演示用近似值）
 * - population: 第七次人口普查各省常住人口（万人）
 * - house: 各省公开房价均价近似（万元/㎡）
 * - poi: POI 繁华度指数（0-100，综合人口与城市规模）
 */

const POP_10K = {
  110000: 2189, 120000: 1387, 130000: 7461, 140000: 3492, 150000: 2405,
  210000: 4259, 220000: 2407, 230000: 3751, 310000: 2487, 320000: 8475,
  330000: 6457, 340000: 6103, 350000: 4154, 360000: 4519, 370000: 10153,
  410000: 9937, 420000: 5775, 430000: 6644, 440000: 12601, 450000: 5013,
  460000: 1008, 500000: 3205, 510000: 8367, 520000: 3856, 530000: 4721,
  540000: 365, 610000: 3953, 620000: 2502, 630000: 720, 640000: 620,
  650000: 2585
};

const HOUSE_PRICE = {
  110000: 6.0, 120000: 1.8, 130000: 1.0, 140000: 0.9, 150000: 0.9,
  210000: 0.9, 220000: 0.9, 230000: 0.8, 310000: 5.4, 320000: 1.9,
  330000: 2.3, 340000: 0.9, 350000: 1.9, 360000: 0.9, 370000: 1.0,
  410000: 0.8, 420000: 0.9, 430000: 0.8, 440000: 1.6, 450000: 0.7,
  460000: 1.8, 500000: 1.0, 510000: 0.9, 520000: 0.7, 530000: 0.9,
  540000: 0.8, 610000: 0.9, 620000: 0.7, 630000: 0.7, 640000: 0.7,
  650000: 0.6
};

function poiIndex(adcode) {
  const h = ((adcode * 2654435761) >>> 0) % 1000;
  const pop = POP_10K[adcode] || 1000;
  const price = HOUSE_PRICE[adcode] || 0.8;
  const base = Math.log10(pop) * 18 + price * 6;
  return Math.min(100, Math.round(base + (h / 1000) * 12));
}

function normalize(v, min, max) {
  return max > min ? ((v - min) / (max - min)) * 100 : 50;
}

function socialValues(regions) {
  const pops = Object.values(POP_10K);
  const prices = Object.values(HOUSE_PRICE);
  const pois = regions
    .filter((p) => POP_10K[p.adcode])
    .map((p) => poiIndex(p.adcode));
  const popMin = Math.min(...pops);
  const popMax = Math.max(...pops);
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const poiMin = Math.min(...pois);
  const poiMax = Math.max(...pois);

  return regions
    .filter((p) => POP_10K[p.adcode])
    .map((p) => {
      const pop = POP_10K[p.adcode];
      const house = HOUSE_PRICE[p.adcode];
      const poi = poiIndex(p.adcode);
      const composite = Math.round(
        normalize(pop, popMin, popMax) * 0.45 +
          normalize(house, priceMin, priceMax) * 0.3 +
          normalize(poi, poiMin, poiMax) * 0.25
      );
      return {
        adcode: p.adcode,
        name: p.name,
        population: pop,
        house,
        poi,
        composite
      };
    });
}

module.exports = { socialValues, POP_10K, HOUSE_PRICE, poiIndex };
