'use strict';

/**
 * 智盾全国版后端（Node.js 原生 HTTP）
 *
 * 默认安全边界：
 *  - 仅监听 127.0.0.1，适合作为本地演示服务器。
 *  - 若显式设置 HOST=0.0.0.0 对外提供只读访问，POST/DELETE 写操作仍默认拒绝。
 *  - 对外写入必须设置 ZHIDUN_WRITE_TOKEN，并使用 Authorization: Bearer <token>。
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
const HOST = process.env.HOST || '127.0.0.1';
const WRITE_TOKEN = process.env.ZHIDUN_WRITE_TOKEN || '';
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'web', 'dist');

const DEFAULT_ORIGINS = [
  'http://127.0.0.1:8081',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
];
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, obj, cacheSec = 0) {
  const req = res.req;
  const body = JSON.stringify(obj);
  const etag = '"' + crypto.createHash('md5').update(body).digest('hex').slice(0, 16) + '"';
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req) setCors(req, res);
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (cacheSec > 0) res.setHeader('Cache-Control', `public, max-age=${cacheSec}`);
  else res.setHeader('Cache-Control', 'no-store');

  if (req && req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    return res.end();
  }

  const acceptsGzip = req && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (acceptsGzip && Buffer.byteLength(body) > 1024) {
    return zlib.gzip(body, (err, buf) => {
      if (err) return res.end(body);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });
  }

  res.setHeader('Content-Length', Buffer.byteLength(body));
  return res.end(body);
}

function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve) => {
    let raw = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) {
        tooLarge = true;
        raw = '';
      }
    });
    req.on('end', () => {
      if (tooLarge) return resolve({ ok: false, error: 'request body too large' });
      try {
        resolve({ ok: true, value: raw ? JSON.parse(raw) : {} });
      } catch (error) {
        resolve({ ok: false, error: 'invalid JSON body' });
      }
    });
    req.on('error', () => resolve({ ok: false, error: 'request body read failed' }));
  });
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function canWrite(req) {
  if (isLoopback(req)) return true;
  if (!WRITE_TOKEN) return false;
  const auth = String(req.headers.authorization || '');
  const prefix = 'Bearer ';
  if (!auth.startsWith(prefix)) return false;
  const supplied = Buffer.from(auth.slice(prefix.length));
  const expected = Buffer.from(WRITE_TOKEN);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function requireWriteAccess(req, res) {
  if (canWrite(req)) return true;
  sendJson(res, 403, {
    error: 'write access denied',
    hint: 'Remote writes require ZHIDUN_WRITE_TOKEN and Authorization: Bearer <token>.'
  });
  return false;
}

function validateCaseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请求体必须是对象';
  if (body.lng !== undefined && !Number.isFinite(Number(body.lng))) return 'lng 必须是数字';
  if (body.lat !== undefined && !Number.isFinite(Number(body.lat))) return 'lat 必须是数字';
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return 'date 格式必须为 YYYY-MM-DD';
  return null;
}

function validateControlledBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请求体必须是对象';
  if (body.id === undefined || body.id === null || body.id === '') return '缺少区域 id';
  return null;
}

function handleApi(req, res, seg, q) {
  if (seg[1] === 'health') {
    return sendJson(res, 200, {
      ok: true,
      name: '智盾 · 全国犯罪时空分析预警系统后端',
      mode: HOST === '127.0.0.1' ? 'local-demo' : 'network',
      remoteWritesEnabled: Boolean(WRITE_TOKEN),
      time: new Date().toISOString()
    });
  }

  if (seg[1] === 'meta') {
    const pred = model.predict({ months: 1 });
    return sendJson(res, 200, {
      name: '智盾 · 全国犯罪时空分析预警系统',
      scope: '全国 31 省',
      data: data.meta,
      regions: {
        provinces: data.regions.provinces.length,
        cities: data.regions.cities.length
      },
      model: pred.model,
      trainingThrough: pred.trainingThrough,
      forecastFrom: pred.forecastFrom
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
      modelTrainingThrough: pred.trainingThrough,
      forecastFrom: pred.forecastFrom,
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
    return sendJson(res, 200, data.trendSeries({
      dimension: q.get('dimension') || 'month',
      type: q.get('type') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      start: q.get('start') || '',
      end: q.get('end') || ''
    }), 30);
  }

  if (seg[1] === 'types') return sendJson(res, 200, data.aggregates.byType, 3600);
  if (seg[1] === 'provinces') return sendJson(res, 200, data.regions.provinces, 3600);

  if (seg[1] === 'cities') {
    const province = q.get('province');
    const list = province ? (data.cityByProvince.get(Number(province)) || []) : data.regions.cities;
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
      limit: Math.min(5000, Math.max(1, num(q.get('limit'), 3000)))
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
      grid: Math.max(0.005, num(q.get('grid'), 0.5))
    }).slice(0, 1200);
    return sendJson(res, 200, cells, 10);
  }

  if (seg[1] === 'rank') {
    return sendJson(res, 200, data.rankBy({
      by: q.get('by') || 'province',
      province: q.get('province') || '',
      limit: Math.min(500, Math.max(1, num(q.get('limit'), 10))),
      start: q.get('start') || '',
      end: q.get('end') || '',
      type: q.get('type') || ''
    }), 30);
  }

  if (seg[1] === 'social') {
    const indicator = q.get('indicator') || 'composite';
    const allowed = new Set(['population', 'house', 'poi', 'composite']);
    const safeIndicator = allowed.has(indicator) ? indicator : 'composite';
    const units = { population: '万人', house: '万元/㎡', poi: '指数', composite: '指数' };
    const items = social
      .socialValues(data.regions.provinces)
      .map((v) => ({ adcode: v.adcode, name: v.name, value: v[safeIndicator] }));
    return sendJson(res, 200, { indicator: safeIndicator, unit: units[safeIndicator], items }, 300);
  }

  if (seg[1] === 'predict') {
    if (seg[2] === 'series') {
      const s = model.seriesForRegion(q.get('level') || 'province', q.get('id'));
      if (!s) return sendJson(res, 404, { error: 'region not found' });
      return sendJson(res, 200, s, 60);
    }
    return sendJson(res, 200, model.predict({
      level: q.get('level') || 'province',
      months: num(q.get('months'), 3),
      top: num(q.get('top'), 0)
    }), 60);
  }

  if (seg[1] === 'models') {
    const level = q.get('level') === 'city' ? 'city' : 'province';
    const t0 = Date.now();
    const result = forecastModels.runAllModels(level);
    const primary = model.predict({ level, months: 1 });
    const avgNext = Math.round(
      primary.items.reduce((s, x) => s + x.forecast[0].value, 0) / Math.max(1, primary.items.length)
    );
    result.models.unshift({
      key: 'stl',
      name: level === 'city'
        ? '主模型（Seasonal-Trend Lite，城市月度估算）'
        : '主模型（Seasonal-Trend Lite）',
      mape: primary.quality.mape,
      next: avgNext,
      accuracy: primary.quality.accuracy
    });
    result.itemsByModel.stl = primary.items;
    result.stlSummary = primary.summary;
    result.stlForecastFrom = primary.forecastFrom;
    result.elapsedMs = Date.now() - t0;
    return sendJson(res, 200, result, 60);
  }

  if (seg[1] === 'cases') {
    if (req.method === 'POST') {
      if (!requireWriteAccess(req, res)) return;
      return readBody(req).then((parsed) => {
        if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
        const error = validateCaseBody(parsed.value);
        if (error) return sendJson(res, 400, { error });
        return sendJson(res, 200, { ok: true, data: data.addCase(parsed.value) });
      });
    }
    if (req.method === 'DELETE' && seg[2]) {
      if (!requireWriteAccess(req, res)) return;
      const ok = data.deleteCase(Number(seg[2]));
      return sendJson(res, ok ? 200 : 404, { ok, error: ok ? undefined : '案件不存在或不可删除' });
    }
    return sendJson(res, 200, data.searchCases({
      keyword: q.get('keyword') || '',
      type: q.get('type') || '',
      start: q.get('start') || '',
      end: q.get('end') || '',
      province: q.get('province') || '',
      city: q.get('city') || '',
      page: q.get('page') || '1',
      size: q.get('size') || '20'
    }), 10);
  }

  if (seg[1] === 'controlled') {
    if (req.method === 'POST') {
      if (!requireWriteAccess(req, res)) return;
      return readBody(req).then((parsed) => {
        if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
        const error = validateControlledBody(parsed.value);
        if (error) return sendJson(res, 400, { error });
        const row = data.addControlled(parsed.value);
        return sendJson(res, row ? 200 : 400, { ok: Boolean(row), data: row });
      });
    }
    if (req.method === 'DELETE' && seg[2]) {
      if (!requireWriteAccess(req, res)) return;
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
      grid: Math.max(0.005, num(q.get('grid'), 0.03))
    });
    if (!plan) return sendJson(res, 404, { error: '城市不存在' });
    return sendJson(res, 200, plan, 30);
  }

  if (seg[1] === 'checkpoints') {
    const city = Number(q.get('city') || 0);
    if (!city) return sendJson(res, 400, { error: '需要 city' });
    return sendJson(res, 200, { city, points: data.checkpointsForCity(city) }, 30);
  }

  if (seg[1] === 'persons') {
    const city = Number(q.get('city') || 0);
    if (!city) return sendJson(res, 400, { error: '需要 city' });
    return sendJson(res, 200, { city, persons: data.personsForCity(city) }, 30);
  }

  if (seg[1] === 'analysis') {
    const by = q.get('by') || 'province';
    const pred = model.predict({ level: by === 'city' ? 'city' : 'province', months: 1 });
    const top = (pred.items || []).slice(0, 15).map((x) => ({
      name: x.name,
      value: x.forecast[0].value,
      level: x.forecast[0].level,
      trendPct: x.trendPct
    }));
    return sendJson(res, 200, { hotspots: top, prediction: pred.summary, quality: pred.quality }, 30);
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
    if (f === 'geojson') return sendJson(res, 200, { type: 'FeatureCollection', features: [] });
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

function safeFile(rootDir, relPath) {
  const root = path.resolve(rootDir);
  const file = path.resolve(root, relPath);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

function serveStatic(res, relPath) {
  for (const rootDir of [DIST_DIR, PUBLIC_DIR]) {
    const file = safeFile(rootDir, relPath);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache, must-revalidate';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  res.req = req;
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.statusCode = 204;
    return res.end();
  }

  let urlPath;
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    urlPath = decodeURIComponent(url.pathname);
  } catch (error) {
    res.writeHead(400);
    return res.end('bad request');
  }

  if (urlPath.startsWith('/arcgis/')) return handleArcGIS(req, res, urlPath, url);
  if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath.split('/').filter(Boolean), url.searchParams);

  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (serveStatic(res, rel)) return;

  if (!path.extname(urlPath) && serveStatic(res, 'index.html')) return;

  if (urlPath === '/') {
    return sendJson(res, 200, {
      name: '智盾 · 全国犯罪时空分析预警系统后端',
      mode: '历史数据教学/演示',
      tip: '开发: npm run dev；生产构建: npm run build && npm run server',
      api: [
        '/api/health', '/api/meta', '/api/overview', '/api/trend', '/api/points',
        '/api/heatmap', '/api/rank', '/api/predict', '/api/cases', '/api/patrol'
      ]
    });
  }

  return sendJson(res, 404, { error: 'not found', path: urlPath });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`智盾后端已启动: http://${HOST}:${PORT}`);
    console.log(`运行模式: ${HOST === '127.0.0.1' ? '本地演示（默认）' : '网络监听（远程写入默认关闭）'}`);
    console.log(`数据: ${data.meta.label || data.meta.source}，样本 ${data.sample.length} 条`);
    console.log(`覆盖: ${data.aggregates.byProvince.filter((x) => x.total > 0).length} 省 / ${data.aggregates.byCity.filter((x) => x.total > 0).length} 市`);
    console.log(`模型训练截止: 2018-12；预测演示起始: ${model.predict({ months: 1 }).forecastFrom}`);
  });
}

module.exports = { server, canWrite, safeFile };
