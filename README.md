# 智盾 · 全国犯罪时空分析预警系统

基于全国裁判文书公开数据的犯罪时空分析预警演示系统。前端采用 Vue 3 + Vite + TypeScript，后端为 Node.js 原生 HTTP 服务，内置全国犯罪数据模拟接口与多模型预测引擎。

> 本系统仅用于技术演示与教学，数据为脱敏模拟数据，不代表真实犯罪情况。

## 功能

- **首页工作台**：全国总览、年度趋势、案件类型分布、TOP 排名、预警速览
- **警情信息统计**：全国省/市地图下钻、案件点位、月度趋势、类型占比
- **警情信息分析**：犯罪热力图、24 小时/星期发案规律、年 × 月时空热力
- **犯罪动态播放**：案件随时间逐月流动动画，支持省级 / 地市级切换
- **犯罪预测与预警**：SARIMA / STARMA / Prophet / XGBoost 多模型预测、四色分级预警、滚动回测对比
- **指挥调度**：重点区域布控、出警规划、卡口拦截
- **重点人员管控**：积分预警、异常轨迹分析
- **社会信息分析**：基础专题、人口、房价、POI 与犯罪的关联分析
- **案情录入 / 检索**：录入、筛选、地图查看
- **可视化大屏**：三栏布局大屏，30 秒自动刷新、全屏、案件滚动

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Ant Design Vue、ECharts、Leaflet、Pinia
- 后端：Node.js 原生 HTTP（内置 gzip、ETag 缓存）
- 数据：全国 31 省、372 地市 2000–2019 年模拟犯罪样本

## 目录结构

```text
.
├── web/        # Vue 3 + Vite + TypeScript 前端源码
├── server/     # Node.js 后端（API、预测模型、模拟数据）
│   ├── data/   # 聚合统计与抽样样本（JSON）
│   └── scripts/ # 数据生成 / 抽取辅助脚本
├── public/     # 前端静态资源（地图 GeoJSON、favicon）
├── dist/       # 生产构建产物（后端直接托管，不入库）
└── package.json # 一键演示入口（npm run demo）
```

## 快速开始

需要 Node.js 18+。

### 方式一：一键演示

```bash
npm install
npm run demo
```

或直接：

```bash
node server/run-dev.js
```

### 方式二：分开启动

后端（端口 3000）：

```bash
node server/index.js
```

前端（端口 8081，已配置代理到 3000）：

```bash
cd web
npm install
npm run dev
```

打开 http://127.0.0.1:8081

### 生产模式

```bash
cd web
npm run build
```

将 `web/dist` 同步到仓库根目录 `dist/`，然后运行后端：

```bash
node server/index.js
```

访问 http://127.0.0.1:3000

## 数据说明

- 样本数据：`server/data/sample.json`（约 12 万条抽样记录，已移除姓名、判决全文等敏感字段）
- 聚合数据：`server/data/aggregates.json`（全量聚合统计，用于地图与图表）
- 原始论文数据（约 103 万条）需自行下载，解压后可运行 `server/scripts/extract-from-zip.js` 重新生成样本；原始压缩包体积约 7GB，不入库
- 未提供真实数据时，可运行 `server/scripts/generate-placeholder.js` 生成占位数据，功能保持一致

## API 概览

所有接口位于 `/api/*`，返回 JSON：

- `GET /api/overview`：全国总览统计
- `GET /api/cases`：案件查询（时间、地区、类型筛选）
- `GET /api/rank`：省份 / 地市排名
- `GET /api/predict`：预测与四色预警
- `GET /api/regions`：省市级联数据
- `GET /api/social/*`：人口、房价、POI 等社会数据

## 免责声明

本仓库所有案件数据均为模拟 / 脱敏演示数据，仅用于技术交流，不反映任何真实犯罪情况。
