'use strict';

/**
 * CrimeMap 全国版后端（Node.js 原生 HTTP，内置 gzip + 缓存）
 * API: /api/*
 * 静态: public/ 与 dist/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const data = require('./national-data');
const model = require('./model');
const social = require('./social');
const forecastModels = require('./forecast-models');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

// ---------- 工具 ----------
function sendJson(res, status, obj, cacheSec = 0) {
  const body = JSON.stringify(obj);
  const etag = '"' + crypto.createHash('md5').update(body).digest('hex').slice(0, 16) + '"';
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('ETag', etag);
  if (cacheSec > 0) res.setHeader('Cache-Control', `public, max-age=${cacheSec}`);
  else res.setHeader('Cache-Control', 'no-store');

  if (reqNoneMatch(res, etag)) {
    res.statusCode = 304;
    return res.end();
  }
  if (body.length > 1024) {
    zlib.gzip(body, (err, buf) => {
      if (err) return res.end(body);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });
  } else {
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  }
}

function reqNoneMatch(res, etag) {
  const inm = res.req.headers['if-none-match'];
  return inm && inm === etag;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// ---------- API ----------
function handleApi(req, res, seg, q) {
  if (seg[1] === 'health') {
    return sendJson(res, 200, {
      ok: true,
      name: '智盾 · 全国犯罪时空分析预警系统后端',
      time: new Date().toISOString()
    });
  }

  if (seg[1] === 'meta') {
    return sendJson(res, 200, {
      name: '智盾 · 全国犯罪时空分析预警系统',
      scope: '全国 31 省',
      data: data.meta,
      regions: {
        provinces: data.regions.provinces.length,
        cities: data.regions.cities.length
      },
      model: model.predict({ months: 1 }).model,
      forecastFrom: model.predict({ months: 1 }).forecastFrom
    }, 30);
  }

  if (seg[1] === 'overview') {
    const agg = data.aggregates;
    const topProvinces = agg.byProvince.slice(0, 8).map((x, i) => ({ rank: i + 1, ...x }));
    const topCities = agg.byCity.slice(0, 8).map((x, i) => ({ rank: i + 1, ...x }));
    const pred = model.predict({ level: 'province', months: 1 });
    return sendJson(res, 200, {
      total: agg.total,
      provinces: agg.byProvince.filter((x) => x.total > 0 && x.adcode > 0).length,
      cities: agg.byCity.filter((x) => x.total > 0 && x.adcode > 0).length,
      years: `${agg.yearStart} - ${agg.yearEnd}`,
      byType: agg.byType,
      byYear: agg.byYear,
      byHour: agg.byHour,
      byWeekday: agg.byWeekday,
      trend: agg.byMonth.slice(-36),
      topProvinces,
      topCities,
      forecast: pred.summary,
      generatedAt: agg.generatedAt || data.meta.generatedAt
    }, 30);
  }

  if (seg[1] === 'trend') {
    const rows = data.trendSeries({
      dimension: q.get('dimension') || 'month',
      type: q.get('type') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      start: q.get('start') || '',
      end: q.get('end') || ''
    });
    return sendJson(res, 200, rows, 30);
  }

  if (seg[1] === 'types') {
    return sendJson(res, 200, data.aggregates.byType, 3600);
  }

  if (seg[1] === 'provinces') {
    return sendJson(res, 200, data.regions.provinces, 3600);
  }

  if (seg[1] === 'cities') {
    const province = q.get('province');
    const list = province
      ? (data.cityByProvince.get(Number(province)) || [])
      : data.regions.cities;
    return sendJson(res, 200, list, 3600);
  }

  if (seg[1] === 'points') {
    const bbox = q.get('bbox');
    const points = data.filterPoints({
      start: q.get('start') || '',
      end: q.get('end') || '',
      type: q.get('type') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      bbox: bbox ? bbox.split(',').map(Number) : null,
      limit: Math.min(5000, num(q.get('limit'), 3000))
    });
    return sendJson(res, 200, {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          date: p.date,
          time: p.time,
          type: p.type,
          province: p.province,
          city: p.city,
          court: p.court,
          address: p.address
        }
      }))
    }, 10);
  }

  if (seg[1] === 'heatmap') {
    const cells = data.heatCells({
      start: q.get('start') || '',
      end: q.get('end') || '',
      type: q.get('type') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      grid: num(q.get('grid'), 0.5)
    }).slice(0, 1200);
    return sendJson(res, 200, cells, 10);
  }

  if (seg[1] === 'rank') {
    const rows = data.rankBy({
      by: q.get('by') || 'province',
      province: q.get('province') || '',
      limit: num(q.get('limit'), 10),
      start: q.get('start') || '',
      end: q.get('end') || '',
      type: q.get('type') || ''
    });
    return sendJson(res, 200, rows, 30);
  }

  if (seg[1] === 'social') {
    const indicator = q.get('indicator') || 'composite';
    const units = {
      population: '万人',
      house: '万元/㎡',
      poi: '指数',
      composite: '指数'
    };
    const items = social
      .socialValues(data.regions.provinces)
      .map((v) => ({ adcode: v.adcode, name: v.name, value: v[indicator] }));
    return sendJson(
      res,
      200,
      {
        indicator,
        unit: units[indicator] || '指数',
        items
      },
      300
    );
  }

  if (seg[1] === 'predict') {
    const sub = seg[2];
    if (sub === 'series') {
      const s = model.seriesForRegion(q.get('level') || 'province', q.get('id'));
      if (!s) return sendJson(res, 404, { error: 'region not found' });
      return sendJson(res, 200, s, 60);
    }
    const result = model.predict({
      level: q.get('level') || 'province',
      months: num(q.get('months'), 3),
      top: num(q.get('top'), 0)
    });
    return sendJson(res, 200, result, 60);
  }

  if (seg[1] === 'models') {
    const level = q.get('level') || 'province';
    const t0 = Date.now();
    const result = forecastModels.runAllModels(level);
    if (level === 'province') {
      const stl = model.predict({ level: 'province', months: 1 });
      const avgNext = Math.round(
        stl.items.reduce((s, x) => s + x.forecast[0].value, 0) / Math.max(1, stl.items.length)
      );
      result.models.unshift({
        key: 'stl',
        name: '主模型（STL·时空）',
        mape: stl.quality.mape,
        next: avgNext,
        accuracy: stl.quality.accuracy
      });
      result.itemsByModel.stl = stl.items;
      result.stlSummary = stl.summary;
      result.stlForecastFrom = stl.forecastFrom;
    }
    result.elapsedMs = Date.now() - t0;
    return sendJson(res, 200, result, 60);
  }

  if (seg[1] === 'cases') {
    if (req.method === 'POST') {
      return readBody(req).then((body) => {
        const row = data.addCase(body);
        sendJson(res, 200, { ok: true, data: row });
      });
    }
    if (req.method === 'DELETE' && seg[2]) {
      const ok = data.deleteCase(Number(seg[2]));
      return sendJson(res, ok ? 200 : 404, { ok, error: ok ? undefined : '案件不存在或不可删除' });
    }
    const result = data.searchCases({
      keyword: q.get('keyword') || '',
      type: q.get('type') || '',
      start: q.get('start') || '',
      end: q.get('end') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      page: q.get('page') || '1',
      size: q.get('size') || '20'
    });
    return sendJson(res, 200, result, 10);
  }

  if (seg[1] === 'controlled') {
    if (req.method === 'POST') {
      return readBody(req).then((body) => {
        const r = data.addControlled(body);
        return sendJson(res, r ? 200 : 400, { ok: !!r, data: r });
      });
    }
    if (req.method === 'DELETE' && seg[2]) {
      const ok = data.removeControlled(seg[2]);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
    return sendJson(res, 200, data.listControlled());
  }

  if (seg[1] === 'route') {
    const lat = Number(q.get('fromLat'));
    const lng = Number(q.get('fromLng'));
    const city = Number(q.get('city') || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !city) {
      return sendJson(res, 400, { error: '需要 fromLat / fromLng / city' });
    }
    const r = data.nearestStation(lat, lng, city);
    if (!r) return sendJson(res, 404, { error: '城市无警力站点' });
    return sendJson(res, 200, {
      station: r.station,
      distance: r.distance,
      duration: Math.max(1, Math.round((r.distance / 40) * 60)),
      path: data.routePath(lat, lng, r.station)
    });
  }

  if (seg[1] === 'patrol') {
    const city = Number(q.get('city') || 0);
    if (!city) return sendJson(res, 400, { error: '需要 city' });
    const plan = data.patrolPlan(city, {
      start: q.get('start') || '',
      end: q.get('end') || '',
      type: q.get('type') || '',
      grid: num(q.get('grid'), 0.03)
    });
    if (!plan) return sendJson(res, 404, { error: '城市不存在' });
    return sendJson(res, 200, plan, 30);
  }

  if (seg[1] === 'checkpoints') {
    const city = Number(q.get('city') || 0);
    if (!city) return sendJson(res, 400, { error: '需要 city' });
    return sendJson(res, 200, {
      city: city,
      points: data.checkpointsForCity(city)
    }, 30);
  }

  if (seg[1] === 'persons') {
    const city = Number(q.get('city') || 0);
    if (!city) return sendJson(res, 400, { error: '需要 city' });
    return sendJson(res, 200, {
      city,
      persons: data.personsForCity(city)
    }, 30);
  }

  if (seg[1] === 'analysis') {
    const by = q.get('by') || 'province';
    const province = Number(q.get('province') || 0);
    const city = Number(q.get('city') || 0);
    const pred = model.predict({ level: by === 'city' ? 'city' : 'province', months: 1 });
    const top = (pred.items || []).slice(0, 15).map((x) => ({
      name: x.name,
      value: x.forecast[0].value,
      level: x.forecast[0].level,
      trendPct: x.trendPct
    }));
    return sendJson(res, 200, {
      hotspots: top,
      prediction: pred.summary,
      quality: pred.quality
    }, 30);
  }

  return sendJson(res, 404, { error: 'unknown api', path: '/api/' + seg.slice(1).join('/') });
}

// ArcGIS 兼容占位（旧页面过渡用）
function handleArcGIS(req, res, urlPath, url) {
  const m = urlPath.match(/^\/arcgis\/rest\/services\/([^/]+)\/([^/]+)\/MapServer(?:\/(\d+))?(?:\/(query|solveClosestFacility))?/);
  if (!m) return sendJson(res, 404, { error: 'unknown arcgis service' });
  const action = m[4] || '';
  if (action === 'solveClosestFacility') {
    return sendJson(res, 200, { routes: { features: [] }, facilities: { features: [] } });
  }
  if (action === 'query') {
    const f = (url.searchParams.get('f') || 'json').toLowerCase();
    if (f === 'geojson') {
      return sendJson(res, 200, { type: 'FeatureCollection', features: [] });
    }
    return sendJson(res, 200, { features: [], fields: [] });
  }
  return sendJson(res, 200, {
    currentVersion: 10.61,
    type: 'Feature Layer',
    id: 0,
    name: m[2],
    fields: [],
    geometryType: 'esriGeometryPoint',
    maxRecordCount: 5000,
    capabilities: 'Query',
    spatialReference: { wkid: 4326, latestWkid: 4326 }
  });
}

// ---------- 静态资源 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
};

function serveStatic(res, relPath) {
  const candidates = [path.join(DIST_DIR, relPath), path.join(PUBLIC_DIR, relPath)];
  for (const file of candidates) {
    if (!file.startsWith(PUBLIC_DIR) && !file.startsWith(DIST_DIR)) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache, must-revalidate';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

// ---------- 服务器 ----------
const server = http.createServer((req, res) => {
  res.req = req;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  let urlPath;
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    urlPath = decodeURIComponent(url.pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('bad request');
  }

  if (urlPath.startsWith('/arcgis/')) return handleArcGIS(req, res, urlPath, url);
  if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath.split('/').filter(Boolean), url.searchParams);

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (serveStatic(res, rel)) return;

  // 单页应用回退：无扩展名的路径交给前端路由处理
  if (!path.extname(urlPath)) {
    if (serveStatic(res, 'index.html')) return;
  }

  if (urlPath === '/') {
    return sendJson(res, 200, {
      name: '智盾 · 全国犯罪时空分析预警系统后端',
      tip: '前端: npm run serve；生产: npm run build 后直接访问本服务',
      api: [
        '/api/health', '/api/meta', '/api/overview', '/api/trend', '/api/points',
        '/api/heatmap', '/api/rank', '/api/predict', '/api/cases', '/api/patrol'
      ]
    });
  }

  sendJson(res, 404, { error: 'not found', path: urlPath });
});

server.listen(PORT, () => {
  console.log(`全国版后端已启动: http://127.0.0.1:${PORT}`);
  console.log(`数据: ${data.meta.label || data.meta.source}，样本 ${data.sample.length} 条`);
  console.log(`覆盖: ${data.aggregates.byProvince.filter((x) => x.total > 0).length} 省 / ${data.aggregates.byCity.filter((x) => x.total > 0).length} 市`);
  console.log(`预测起始月: ${model.predict({ months: 1 }).forecastFrom}`);
});
