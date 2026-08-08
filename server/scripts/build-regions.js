'use strict';

/**
 * 从 public/geojson 的省级/市级边界文件中提取行政区划索引。
 * 输出: server/data/regions.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GEO_DIR = path.join(ROOT, 'public', 'geojson');
const OUT = path.join(ROOT, 'server', 'data', 'regions.json');

const provinces = [];
const cities = [];
const cityByAdcode = new Map();

const provinceGeo = JSON.parse(
  fs.readFileSync(path.join(GEO_DIR, 'china_provinces.json'), 'utf8')
);

for (const f of provinceGeo.features) {
  const p = f.properties;
  provinces.push({
    adcode: p.adcode,
    name: p.name,
    center: p.center || p.centroid || [0, 0],
    level: p.level || 'province'
  });
}

for (const p of provinces) {
  const file = path.join(GEO_DIR, `cities_${p.adcode}.json`);
  if (!fs.existsSync(file)) continue;
  let geo;
  try {
    geo = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    continue;
  }
  for (const f of geo.features || []) {
    const c = f.properties;
    if (c.level !== 'city') continue;
    const rec = {
      adcode: c.adcode,
      name: c.name,
      province: p.name,
      provinceAdcode: p.adcode,
      center: c.center || c.centroid || [0, 0]
    };
    cities.push(rec);
    cityByAdcode.set(rec.adcode, rec);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  provinces,
  cities,
  special: provinces.filter((p) => ![110000,120000,130000,140000,150000,210000,220000,230000,310000,320000,330000,340000,350000,360000,370000,410000,420000,430000,440000,450000,460000,500000,510000,520000,530000,540000,610000,620000,630000,640000,650000].includes(p.adcode))
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(
  `regions: ${out.provinces.length} provinces, ${out.cities.length} cities -> ${OUT}`
);
