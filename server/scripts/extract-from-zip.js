'use strict';

/**
 * 从 ChinaCrimeDatasets.zip 中抽取 ChinaCrimeDatas.csv（存储式，无压缩），
 * 生成全国版演示数据：
 *  - sample.json      Reservoir 抽样约 12 万条（仅保留非敏感字段）
 *  - aggregates.json  全量聚合（省/市/年/月/类型/小时/星期）
 *  - meta.json        数据来源信息
 *
 * 用法: node server/scripts/extract-from-zip.js
 */

const fs = require('fs');
const path = require('path');
const { CsvParser } = require('./csv-stream');

const ROOT = path.resolve(__dirname, '..', '..');
const ZIP = path.join(ROOT, 'server', 'data', 'raw', 'ChinaCrimeDatasets.zip');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const regions = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'regions.json'), 'utf8')
);

// ---------- 名称 -> adcode 映射 ----------
const provinceByName = new Map();
for (const p of regions.provinces || []) {
  provinceByName.set(p.name, p.adcode);
  provinceByName.set(p.name.replace(/省|市|自治区|特别行政区/g, ''), p.adcode);
}
const cityByName = new Map();
for (const c of regions.cities || []) {
  const key = `${c.provinceAdcode}|${c.name}`;
  cityByName.set(key, c.adcode);
  cityByName.set(`${c.provinceAdcode}|${c.name.replace(/市|地区|自治州|盟/g, '')}`, c.adcode);
}
// 直辖市：省即市
const MUNI = [110000, 120000, 310000, 500000];
for (const p of regions.provinces || []) {
  if (MUNI.includes(p.adcode)) {
    cityByName.set(`${p.adcode}|${p.name}`, p.adcode);
    cityByName.set(`${p.adcode}|${p.name.replace(/市/g, '')}`, p.adcode);
  }
}
// 城市名 -> 省/市信息（用于 incident_province/incident_city 缺失时回填）
const cityInfoByName = new Map();
for (const c of regions.cities || []) {
  const p = (regions.provinces || []).find((x) => x.adcode === c.provinceAdcode);
  const rec = { provinceAdcode: c.provinceAdcode, provinceName: p ? p.name : '', cityAdcode: c.adcode, cityName: c.name };
  cityInfoByName.set(c.name, rec);
  cityInfoByName.set(c.name.replace(/市|地区|自治州|盟/g, ''), rec);
}
for (const p of regions.provinces || []) {
  if (MUNI.includes(p.adcode)) {
    const rec = { provinceAdcode: p.adcode, provinceName: p.name, cityAdcode: p.adcode, cityName: p.name };
    cityInfoByName.set(p.name, rec);
    cityInfoByName.set(p.name.replace(/市/g, ''), rec);
  }
}

function resolveProvince(name) {
  if (!name) return 0;
  return provinceByName.get(name) || provinceByName.get(name.replace(/省|市|自治区|特别行政区/g, '')) || 0;
}

function resolveCity(provinceAdcode, name) {
  if (!name || !provinceAdcode) return 0;
  if (MUNI.includes(provinceAdcode)) return provinceAdcode;
  let ad = cityByName.get(`${provinceAdcode}|${name}`);
  if (ad) return ad;
  const plain = name.replace(/市|地区|自治州|盟/g, '');
  ad = cityByName.get(`${provinceAdcode}|${plain}`);
  if (ad) return ad;
  // 兜底：同省名字包含匹配
  for (const c of regions.cities || []) {
    if (c.provinceAdcode !== provinceAdcode) continue;
    if (c.name.includes(plain) || plain.includes(c.name.replace(/市|地区|自治州|盟/g, ''))) {
      return c.adcode;
    }
  }
  return 0;
}

const CN_NUM = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function cnNumber(s) {
  if (!s) return 0;
  if (s === '十') return 10;
  let n = 0;
  for (const ch of s) {
    if (ch === '十') n = n === 0 ? 10 : n * 10;
    else n += CN_NUM[ch] || 0;
  }
  return n;
}

function parseChineseDate(raw) {
  // 支持 2013年12月10日 / 2013年二月二十七日 / 2012年9月份
  if (!raw) return null;
  let m = /(\d{4})年(\d{1,2})月(\d{1,2})日?/.exec(raw);
  if (m) {
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: m[3] ? Number(m[3]) : 1
    };
  }
  m = /(\d{4})年([一二三四五六七八九十两]+)月([一二三四五六七八九十两]+)日/.exec(raw);
  if (m) {
    return {
      year: Number(m[1]),
      month: cnNumber(m[2]),
      day: cnNumber(m[3])
    };
  }
  m = /(\d{4})年([一二三四五六七八九十两]+)月/.exec(raw);
  if (m) {
    return { year: Number(m[1]), month: cnNumber(m[2]), day: 1 };
  }
  return null;
}

function buildTime(y, month, day, hour, minute) {
  if (!y || !month || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(y, month - 1, Math.min(day || 1, 28)));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return {
    date: `${y}-${String(month).padStart(2, '0')}-${String(Math.min(day || 1, 28)).padStart(2, '0')}`,
    time: `${String(hour || 0).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`,
    year: y,
    month,
    day: Math.min(day || 1, 28),
    hour: hour || 0,
    weekday
  };
}

const SAMPLE_SIZE = 120000;

// ---------- 类型关键词分类 ----------
const TYPE_RULES = [
  { name: '盗窃', keys: ['盗窃', '偷窃', '扒窃', '入户盗窃'] },
  { name: '抢劫', keys: ['抢劫'] },
  { name: '抢夺', keys: ['抢夺'] },
  { name: '诈骗', keys: ['诈骗', '电信网络诈骗', '合同诈骗'] },
  { name: '故意伤害', keys: ['故意伤害', '伤害罪'] },
  { name: '寻衅滋事', keys: ['寻衅滋事'] },
  { name: '掩饰隐瞒犯罪所得', keys: ['掩饰、隐瞒犯罪所得', '隐瞒犯罪所得', '掩饰隐瞒'] },
  { name: '敲诈勒索', keys: ['敲诈勒索'] },
  { name: '贩毒吸毒', keys: ['贩卖毒品', '毒品', '容留他人吸毒'] },
  { name: '危险驾驶', keys: ['危险驾驶', '醉驾', '酒驾'] },
  { name: '交通肇事', keys: ['交通肇事'] },
  { name: '非法拘禁', keys: ['非法拘禁'] },
  { name: '其他', keys: [] }
];

function classifyType(text) {
  if (!text) return '其他';
  for (const rule of TYPE_RULES) {
    if (rule.keys.length === 0) continue;
    for (const k of rule.keys) {
      if (text.includes(k)) return rule.name;
    }
  }
  return '其他';
}

function parseTime(ts) {
  // formatted_datetime: 2017-08-20 17:00:00
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (year < 1900 || year > 2030 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    weekday
  };
}

function parseIncidentTime(raw) {
  if (!raw) return null;
  const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(raw);
  if (!m) return null;
  const hm = /(\d{1,2})[时:点](\d{0,2})/.exec(raw);
  const hour = hm ? Number(hm[1]) : 0;
  const minute = hm && hm[2] ? Number(hm[2]) : 0;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    weekday
  };
}

// ---------- Reservoir 抽样 ----------
class Reservoir {
  constructor(size) {
    this.size = size;
    this.items = [];
    this.seen = 0;
  }
  push(item) {
    this.seen += 1;
    if (this.items.length < this.size) {
      this.items.push(item);
      return;
    }
    const j = Math.floor(Math.random() * this.seen);
    if (j < this.size) this.items[j] = item;
  }
}

// ---------- 主流程 ----------
function findCsvOffset(fd) {
  // 从文件头扫描前 2MB 找本地文件头，定位 ChinaCrimeDatas.csv
  const head = Buffer.alloc(2 * 1024 * 1024);
  const read = fs.readSync(fd, head, 0, head.length, 0);
  let off = 0;
  while (off + 30 <= read) {
    if (head.readUInt32LE(off) !== 0x04034b50) {
      off += 1;
      continue;
    }
    const nameLen = head.readUInt16LE(off + 26);
    const extraLen = head.readUInt16LE(off + 28);
    const name = head.slice(off + 30, off + 30 + nameLen).toString('utf8');
    if (name === 'ChinaCrimeDatas.csv') {
      const dataStart = off + 30 + nameLen + extraLen;
      // 解析 ZIP64 extra（id=0x0001）：uncompressed size + compressed size
      let size = 0;
      let p = off + 30 + nameLen;
      const end = p + extraLen;
      while (p + 4 <= end) {
        const id = head.readUInt16LE(p);
        const sz = head.readUInt16LE(p + 2);
        if (id === 0x0001 && sz >= 16) {
          size = Number(head.readBigUInt64LE(p + 4 + 8));
        }
        p += 4 + sz;
      }
      return { start: dataStart, size };
    }
    off += 1;
  }
  throw new Error('未找到 ChinaCrimeDatas.csv');
}

function main() {
  if (!fs.existsSync(ZIP)) {
    console.error('压缩包不存在，请先下载:', ZIP);
    process.exit(1);
  }
  const stat = fs.statSync(ZIP);
  if (fs.existsSync(ZIP + '.done') === false && stat.size < 7000000000) {
    console.error('压缩包尚未下载完成（' + stat.size + '），请等待下载完成后再抽取');
    process.exit(1);
  }

  const fd = fs.openSync(ZIP, 'r');
  const { start: csvStart, size: csvSize } = findCsvOffset(fd);
  if (!csvSize) {
    throw new Error('无法从 ZIP64 扩展字段解析 CSV 大小');
  }
  console.log('CSV 数据偏移:', csvStart, '大小:', csvSize, '文件大小:', stat.size);

  const reservoir = new Reservoir(SAMPLE_SIZE);
  const byYear = {};
  const byMonth = {};
  const byType = {};
  const byHour = {};
  const byWeekday = {};
  const byProvince = {};
  const byCity = {};
  const byProvinceYear = {};
  const byProvinceMonth = {};
  const byCityYear = {};
  let total = 0;
  let skipped = 0;
  let badLoc = 0;

  const parser = new CsvParser({
    onRow: (values, header) => {
      const get = (name) => {
        const idx = header.indexOf(name);
        return idx >= 0 ? values[idx] || '' : '';
      };
      total += 1;
      const lat = Number(get('latitude'));
      const lng = Number(get('longitude'));
      let t = parseTime(get('formatted_datetime'));
      let cd;
      if (!t) {
        cd = parseChineseDate(get('incident_time')) || parseChineseDate(get('judgment_date'));
        if (cd) {
          const hm = /(\d{1,2})[时:点](\d{0,2})/.exec(get('incident_time') || '');
          t = buildTime(cd.year, cd.month, cd.day, hm ? Number(hm[1]) : 0, hm && hm[2] ? Number(hm[2]) : 0);
        }
      }
      if (!t) t = parseTime(get('judgment_date') + ' 00:00:00');
      if (t && (t.year < 2000 || t.year > 2019)) return;
      let province = get('incident_province');
      let city = get('incident_city');
      if (!city) city = get('city');
      let provinceAdcode = resolveProvince(province);
      let cityAdcode = resolveCity(provinceAdcode, city);
      if ((!provinceAdcode || !cityAdcode) && city) {
        const hit = cityInfoByName.get(city) || cityInfoByName.get(city.replace(/市|地区|自治州|盟/g, ''));
        if (hit) {
          if (!provinceAdcode) {
            provinceAdcode = hit.provinceAdcode;
            province = hit.provinceName;
          }
          if (!cityAdcode) {
            cityAdcode = hit.cityAdcode;
            city = hit.cityName;
          }
        }
      }
      if (!province) province = '未知';
      if (process.env.DEBUG_SKIP && skipped < 20 && (!t || !Number.isFinite(lat) || !Number.isFinite(lng) || !province || !city)) {
        console.log(
          'SKIP', JSON.stringify({
            caseNo: get('case_number'),
            t: get('formatted_datetime'),
            it: get('incident_time').slice(0, 40),
            jd: get('judgment_date'),
            lat: get('latitude'),
            lng: get('longitude'),
            prov: get('incident_province'),
            city: get('incident_city'),
            cityCol: get('city')
          })
        );
      }
      if (!t || !Number.isFinite(lat) || !Number.isFinite(lng) || !province || !city) {
        skipped += 1;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) badLoc += 1;
        return;
      }

      const type = classifyType(get('case_type') + ' ' + get('judgment') + ' ' + get('details'));
      byYear[t.year] = (byYear[t.year] || 0) + 1;
      const mk = `${t.year}-${String(t.month).padStart(2, '0')}`;
      byMonth[mk] = (byMonth[mk] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
      byHour[t.hour] = (byHour[t.hour] || 0) + 1;
      byWeekday[t.weekday] = (byWeekday[t.weekday] || 0) + 1;
      byProvince[provinceAdcode] = (byProvince[provinceAdcode] || 0) + 1;
      const cityKey = `${provinceAdcode}|${cityAdcode}|${city}`;
      byCity[cityKey] = (byCity[cityKey] || 0) + 1;
      if (provinceAdcode > 0) {
        const py = `${provinceAdcode}-${t.year}`;
        byProvinceYear[py] = (byProvinceYear[py] || 0) + 1;
        const pm = `${provinceAdcode}-${t.year}-${t.month}`;
        byProvinceMonth[pm] = (byProvinceMonth[pm] || 0) + 1;
      }
      if (cityAdcode > 0) {
        const cy = `${cityKey}|${t.year}`;
        byCityYear[cy] = (byCityYear[cy] || 0) + 1;
      }

      reservoir.push({
        id: total,
        caseNo: get('case_number'),
        date: t.date,
        time: t.time,
        year: t.year,
        month: t.month,
        day: t.day,
        hour: t.hour,
        weekday: t.weekday,
        type,
        province,
        provinceAdcode,
        city,
        cityAdcode,
        county: get('incident_county'),
        court: get('court_name'),
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        address: get('incident_location')
      });

      if (total % 100000 === 0) {
        console.log(`已处理 ${total} 行...`);
      }
    }
  });

  const stream = fs.createReadStream(ZIP, {
    start: csvStart,
    end: csvSize ? csvStart + csvSize - 1 : undefined
  });
  const t0 = Date.now();
  stream.on('data', (chunk) => parser.write(chunk));
  stream.on('end', () => {
    parser.end();
    fs.closeSync(fd);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `完成：共 ${total} 行，跳过 ${skipped}（无坐标 ${badLoc}），耗时 ${elapsed}s`
    );

    // ---------- 写聚合 ----------
    const years = Object.keys(byYear)
      .map(Number)
      .sort((a, b) => a - b);
    const totalInRange = years.reduce((s, y) => s + byYear[y], 0);
    const aggregates = {
      total: totalInRange,
      yearStart: years[0] || 2000,
      yearEnd: years[years.length - 1] || 2019,
      byYear: years.map((y) => ({ year: y, total: byYear[y] })),
      byMonth: Object.keys(byMonth)
        .sort()
        .map((m) => {
          const [year, month] = m.split('-').map(Number);
          return { year, month, total: byMonth[m] };
        }),
      byType: Object.keys(byType).map((t) => ({ type: t, total: byType[t] })),
      byHour: Object.keys(byHour)
        .map(Number)
        .sort((a, b) => a - b)
        .map((h) => ({ hour: h, total: byHour[h] })),
      byWeekday: Object.keys(byWeekday)
        .map(Number)
        .sort((a, b) => a - b)
        .map((w) => ({ weekday: w, total: byWeekday[w] })),
      byProvince: Object.keys(byProvince)
        .map((adcode) => {
          const p = (regions.provinces || []).find((x) => x.adcode === Number(adcode));
          return {
            adcode: Number(adcode),
            name: p ? p.name : '未知',
            total: byProvince[adcode]
          };
        })
        .sort((a, b) => b.total - a.total),
      byCity: Object.keys(byCity)
        .map((key) => {
          const [provinceAdcode, adcode, name] = key.split('|');
          const p = (regions.provinces || []).find((x) => x.adcode === Number(provinceAdcode));
          return {
            adcode: Number(adcode),
            name,
            province: p ? p.name : '未知',
            provinceAdcode: Number(provinceAdcode),
            total: byCity[key]
          };
        })
        .sort((a, b) => b.total - a.total),
      byProvinceYear: Object.keys(byProvinceYear).map((k) => {
        const [adcode, year] = k.split('-');
        return { adcode: Number(adcode), year: Number(year), total: byProvinceYear[k] };
      }),
      byProvinceMonth: Object.keys(byProvinceMonth).map((k) => {
        const [adcode, year, month] = k.split('-');
        return {
          adcode: Number(adcode),
          year: Number(year),
          month: Number(month),
          total: byProvinceMonth[k]
        };
      }),
      byCityYear: Object.keys(byCityYear).map((k) => {
        const [provinceAdcode, adcode, city, year] = k.split('|');
        return {
          adcode: Number(adcode),
          provinceAdcode: Number(provinceAdcode),
          city,
          year: Number(year),
          total: byCityYear[k]
        };
      })
    };

    const meta = {
      source: 'china-crime-paper',
      label: '论文真实数据（裁判文书整理，全国 2000-2019）',
      article: 'Zhang, Y., Kwan, M.P. & Fang, L. An LLM driven dataset on the spatiotemporal distributions of street and neighborhood crime in China. Sci Data 12, 467 (2025).',
      articleUrl: 'https://doi.org/10.1038/s41597-025-04757-8',
      dataUrl: 'https://figshare.com/articles/dataset/_b_A_dataset_on_the_spatiotemporal_distributions_of_street_and_neighborhood_crime_in_China_b_/28106939',
      records: totalInRange,
      sampleRecords: reservoir.items.length,
      provinces: Object.keys(byProvince).length,
      cities: Object.keys(byCity).length,
      years: [years[0], years[years.length - 1]],
      privacy: '已移除被告/被害人姓名与判决全文等敏感字段',
      generatedAt: new Date().toISOString()
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DATA_DIR, 'sample.json'),
      JSON.stringify(reservoir.items)
    );
    fs.writeFileSync(
      path.join(DATA_DIR, 'aggregates.json'),
      JSON.stringify(aggregates)
    );
    fs.writeFileSync(
      path.join(DATA_DIR, 'meta.json'),
      JSON.stringify(meta, null, 2)
    );
    console.log(
      `已写出 sample.json(${reservoir.items.length}) / aggregates.json / meta.json`
    );
  });
}

main();
