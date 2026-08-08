import axios from "axios";

const http = axios.create({
  baseURL: "/api",
  timeout: 60000
});

export interface Province {
  adcode: number;
  name: string;
  center: [number, number];
  level?: string;
}

export interface City {
  adcode: number;
  name: string;
  province: string;
  provinceAdcode: number;
  center: [number, number];
}

export interface TypeItem {
  type: string;
  total: number;
}

export interface RankItem {
  rank: number;
  adcode: number;
  name: string;
  total: number;
  province?: string;
  provinceAdcode?: number;
}

export interface TrendRow {
  label: string;
  total: number;
  year: number;
  month: number;
}

export interface ForecastSummary {
  totalForecast: number;
  changePct: number;
  redCount: number;
  orangeCount: number;
  yellowCount: number;
  normalCount: number;
  regions: number;
}

export interface Overview {
  total: number;
  provinces: number;
  cities: number;
  years: string;
  byType: TypeItem[];
  byYear: { year: number; total: number }[];
  byHour: { hour: number; total: number }[];
  byWeekday: { weekday: number; total: number }[];
  trend: { year: number; month: number; total: number; label: string }[];
  topProvinces: RankItem[];
  topCities: RankItem[];
  forecast: ForecastSummary;
}

export interface Meta {
  name: string;
  scope: string;
  data: {
    source: string;
    label: string;
    records: number;
    provinces: number;
    cities: number;
    years: number[];
  };
  regions: { provinces: number; cities: number };
  model: string;
  forecastFrom: string;
}

export interface GeoFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

export interface HeatCell {
  lng: number;
  lat: number;
  count: number;
}

export interface PredictItem {
  id: number;
  name: string;
  lastValue: number;
  trendPct: number;
  forecast: {
    year: number;
    month: number;
    value: number;
    changePct: number;
    level: "red" | "orange" | "yellow" | "green";
    color: string;
    label: string;
  }[];
}

export interface PredictResult {
  model: string;
  level: string;
  months: number;
  forecastFrom: string;
  quality: { window: string; samples: number; mape: number | null; accuracy: number | null };
  summary: ForecastSummary;
  items: PredictItem[];
}

export interface PredictSeries {
  labels: string[];
  values: number[];
  forecast: { year: number; month: number; value: number; level: string }[];
}

export interface CaseRow {
  key: string;
  id: number;
  caseNo: string;
  date: string;
  time: string;
  type: string;
  province: string;
  provinceAdcode: number;
  city: string;
  cityAdcode: number;
  court: string;
  address: string;
  lng: number;
  lat: number;
  source: string;
}

export interface CasesResult {
  total: number;
  page: number;
  size: number;
  rows: CaseRow[];
}

export interface PatrolPlan {
  city: string;
  total: number;
  clusters: { id: number; lng: number; lat: number; count: number; level: string }[];
  route: { lat: number; lng: number }[];
  stations: { id: string; name: string; address: string; lng: number; lat: number }[];
}

export interface Person {
  id: string;
  name: string;
  type: string;
  score: number;
  level: string;
  lastSeen: string;
  lng: number;
  lat: number;
}

export interface Checkpoint {
  id: string;
  name: string;
  status: string;
  lng: number;
  lat: number;
}

const api = {
  overview: () => http.get<Overview>("/overview").then((r) => r.data),
  meta: () => http.get<Meta>("/meta").then((r) => r.data),
  trend: (params: Record<string, any> = {}) =>
    http.get<TrendRow[]>("/trend", { params }).then((r) => r.data),
  types: () => http.get<TypeItem[]>("/types").then((r) => r.data),
  provinces: () => http.get<Province[]>("/provinces").then((r) => r.data),
  cities: (province?: number) =>
    http.get<City[]>("/cities", { params: { province } }).then((r) => r.data),
  points: (params: Record<string, any> = {}) =>
    http.get<FeatureCollection>("/points", { params }).then((r) => r.data),
  heatmap: (params: Record<string, any> = {}) =>
    http.get<HeatCell[]>("/heatmap", { params }).then((r) => r.data),
  rank: (params: Record<string, any> = {}) =>
    http.get<RankItem[]>("/rank", { params }).then((r) => r.data),
  predict: (params: Record<string, any> = {}) =>
    http.get<PredictResult>("/predict", { params }).then((r) => r.data),
  models: (params: Record<string, any> = {}) =>
    http
      .get<{
        models: { key: string; name: string; mape: number; next: number; accuracy: number }[];
        ensemble: PredictItem[];
        itemsByModel: Record<string, PredictItem[]>;
        ensembleSummary: ForecastSummary;
        elapsedMs: number;
      }>("/models", { params })
      .then((r) => r.data),
  predictSeries: (params: Record<string, any> = {}) =>
    http.get<PredictSeries>("/predict/series", { params }).then((r) => r.data),
  cases: (params: Record<string, any> = {}) =>
    http.get<CasesResult>("/cases", { params }).then((r) => r.data),
  addCase: (body: Record<string, any>) =>
    http.post<{ ok: boolean; data: CaseRow }>("/cases", body).then((r) => r.data),
  deleteCase: (id: number) => http.delete(`/cases/${id}`).then((r) => r.data),
  controlledList: () => http.get<Record<string, any>[]>("/controlled").then((r) => r.data),
  addControlled: (body: Record<string, any>) =>
    http.post<{ ok: boolean; data: Record<string, any> }>("/controlled", body).then((r) => r.data),
  deleteControlled: (id: number | string) =>
    http.delete(`/controlled/${id}`).then((r) => r.data),
  route: (params: Record<string, any>) =>
    http.get("/route", { params }).then((r) => r.data),
  patrol: (params: Record<string, any>) =>
    http.get<PatrolPlan>("/patrol", { params }).then((r) => r.data),
  checkpoints: (params: Record<string, any>) =>
    http.get<{ city: number; points: Checkpoint[] }>("/checkpoints", { params }).then((r) => r.data),
  persons: (params: Record<string, any>) =>
    http.get<{ city: number; persons: Person[] }>("/persons", { params }).then((r) => r.data),
  analysis: (params: Record<string, any> = {}) =>
    http.get("/analysis", { params }).then((r) => r.data),
  social: (params: Record<string, any> = {}) =>
    http.get<{ indicator: string; unit: string; items: { adcode: number; name: string; value: number }[] }>(
      "/social",
      { params }
    ).then((r) => r.data)
};

export default api;
