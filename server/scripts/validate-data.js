'use strict';

/**
 * Repository data sanity checks.
 *
 * This intentionally stays dependency-free so CI can catch malformed downloads
 * before installing the frontend toolchain.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GEO_DIR = path.join(ROOT, 'public', 'geojson');
const DATA_DIR = path.join(ROOT, 'server', 'data');

const errors = [];
let checked = 0;

function fail(file, message) {
  errors.push(`${path.relative(ROOT, file)}: ${message}`);
}

function parseJson(file) {
  checked += 1;
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    fail(file, `read failed: ${error.message}`);
    return null;
  }

  const trimmed = raw.trimStart();
  if (trimmed.startsWith('<')) {
    fail(file, 'looks like XML/HTML instead of JSON (possibly a failed download)');
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    return null;
  }
}

function validateGeoJson(file, value) {
  if (!value) return;
  if (value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    fail(file, 'expected GeoJSON FeatureCollection');
    return;
  }

  for (let i = 0; i < value.features.length; i++) {
    const feature = value.features[i];
    if (!feature || feature.type !== 'Feature' || !feature.geometry) {
      fail(file, `feature ${i} is not a valid GeoJSON Feature`);
      break;
    }
  }
}

if (!fs.existsSync(GEO_DIR)) {
  errors.push('public/geojson: directory missing');
} else {
  for (const name of fs.readdirSync(GEO_DIR).filter((x) => x.endsWith('.json')).sort()) {
    const file = path.join(GEO_DIR, name);
    const value = parseJson(file);
    if (name === 'china_provinces.json' || name.startsWith('cities_')) {
      validateGeoJson(file, value);
    }
  }
}

const requiredData = ['aggregates.json', 'regions.json', 'meta.json', 'sample.json'];
const parsedData = {};
for (const name of requiredData) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) {
    fail(file, 'required data file missing');
    continue;
  }
  parsedData[name] = parseJson(file);
}

const regions = parsedData['regions.json'];
if (regions) {
  if (!Array.isArray(regions.provinces) || regions.provinces.length < 31) {
    fail(path.join(DATA_DIR, 'regions.json'), 'province list is incomplete');
  }
  if (!Array.isArray(regions.cities) || regions.cities.length < 300) {
    fail(path.join(DATA_DIR, 'regions.json'), 'city list is unexpectedly small');
  }
}

const aggregates = parsedData['aggregates.json'];
if (aggregates) {
  for (const key of ['byYear', 'byMonth', 'byProvince', 'byCity']) {
    if (!Array.isArray(aggregates[key])) {
      fail(path.join(DATA_DIR, 'aggregates.json'), `missing array: ${key}`);
    }
  }
}

const sample = parsedData['sample.json'];
if (sample && !Array.isArray(sample)) {
  fail(path.join(DATA_DIR, 'sample.json'), 'expected an array');
}

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Data validation passed: ${checked} JSON/GeoJSON files checked.`);
}
