# 智盾 · 全国犯罪时空分析预警系统

> **ZhiDun** — 面向 GIS 教学、犯罪时空分析演示和前端可视化展示的全国犯罪历史数据分析系统。

[![CI](https://github.com/hujinghaoabcd/zhidun-crime-analysis/actions/workflows/ci.yml/badge.svg)](https://github.com/hujinghaoabcd/zhidun-crime-analysis/actions/workflows/ci.yml)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

智盾基于公开裁判文书整理数据，提供全国尺度的犯罪时空统计、地图下钻、热力分析、历史动态播放、社会信息探索、轻量预测预警、指挥调度演示和可视化大屏。

**项目定位很重要：本仓库是历史数据教学 / 演示系统，不是实时警务系统，也不用于真实执法、人员风险认定或自动化决策。**

---

## 演示截图

| 可视化大屏 | 警情信息统计 |
| --- | --- |
| ![可视化大屏](screenshots/17-screen.png) | ![警情信息统计](screenshots/02-data-statistics.png) |

---

## 主要功能

- **全国时空统计**：省级 / 地市级地图下钻、案件类型、年度 / 月度趋势、24 小时和星期分布。
- **空间分析**：案件点、网格热力、区域排名、城市级时空展示。
- **历史动态播放**：按时间轴回放历史案件空间变化。
- **社会信息探索**：人口、房价、POI / 繁华度等演示性指标与案件样本的探索性相关分析。
- **预测与预警演示**：Seasonal-Trend Lite 主模型，以及 SARIMA-Lite、STARMA-Lite、Prophet-Lite、XGBoost-Lite 省级模型比较。
- **四色风险展示**：红 / 橙 / 黄 / 绿仅用于可视化演示。
- **指挥调度演示**：重点区域、巡逻路线、卡口、重点人员等均包含模拟 / 合成数据流程。
- **可视化大屏**：适合课程展示、GIS Web 项目展示和系统原型演示。

---

## 数据口径

数据来源为公开裁判文书经整理形成的犯罪时空数据集，仓库中包含聚合数据和演示抽样数据。

- 数据时间范围：**2000–2019**。
- 省级月度模型训练截止：**2018-12**。
- 2019 年数据在当前数据集中明显不完整，因此**不参与模型拟合**。
- 预测演示起点：**2019-01**，表示“历史数据下一期预测演示”，不是当前年份的实时预测。
- 地市原始聚合数据主要为年度总量。为了维持月尺度交互，系统按照所在省份当年的月度季节分布，将地市年度总量分配为**估算月度序列**；界面和 API 会标记这一口径。

> 数据样本不能代表真实犯罪发生率、真实警情总量或现实地区治安水平。

数据集参考：

> Zhang, Y., Kwan, M.-P. & Fang, L. *An LLM driven dataset on the spatiotemporal distributions of street and neighborhood crime in China*. Scientific Data 12, 467 (2025). DOI: `10.1038/s41597-025-04757-8`

仓库同时提供 [`CITATION.cff`](CITATION.cff)。

---

## 预测模型说明

本项目中的预测器是为了在纯 Node.js 演示环境中运行而实现的 **Lite 版本**，不是对应官方统计 / 机器学习软件包的直接封装。

| 模型 | 当前实现 | 使用范围 |
| --- | --- | --- |
| Seasonal-Trend Lite | 月度季节指数 + 趋势外推 + 轻量空间邻域平滑 | 省级真实月序列；地市估算月序列 |
| SARIMA-Lite | 季节差分 + 自回归线性模型 | 省级 |
| STARMA-Lite | 时间滞后 + 邻域滞后回归 | 省级 |
| Prophet-Lite | 线性趋势 + 傅里叶季节项 | 省级 |
| XGBoost-Lite | 自实现梯度提升回归树 | 省级 |
| Ensemble | 按 2018 留出集 MAPE 倒数加权 | 省级 |

### 回测口径

省级多模型比较统一使用：

- 训练：2000-01 ~ 2017-12
- 留出验证：2018-01 ~ 2018-12
- 指标：标准 MAPE，真实值为 0 的月份不参与百分比误差平均
- 正式演示拟合：2000-01 ~ 2018-12
- 下一期：2019-01

地市月度序列由年度总量估算，因此**不提供独立月度回测精度**。

这些结果仅用于算法和可视化演示，不应解释为现实犯罪预测能力。

---

## 技术栈

### 前端

- Vue 3
- TypeScript（`strict: true`）
- Vite
- Pinia
- Ant Design Vue
- ECharts
- Leaflet + Leaflet.heat

### 后端

- Node.js 原生 HTTP
- JSON / GeoJSON 数据服务
- gzip / ETag 缓存
- 本地 JSON 演示数据持久化
- 无外部数据库依赖

---

## 快速开始

需要 **Node.js 18+**，推荐 Node.js 20 LTS。

```bash
git clone https://github.com/hujinghaoabcd/zhidun-crime-analysis.git
cd zhidun-crime-analysis
npm install
npm run dev
```

启动后：

- 前端：`http://127.0.0.1:8081`
- 后端：`http://127.0.0.1:3000`
- 健康检查：`http://127.0.0.1:3000/api/health`

根目录现在使用 npm workspace，因此不需要再手动进入 `web/` 安装一次依赖。

### 分步启动

```bash
npm run server
npm run dev --workspace web
```

### 生产构建

```bash
npm run build
npm run server
```

后端会直接读取 `web/dist/`，无需再手动复制到仓库根目录的 `dist/`。

---

## 质量检查

```bash
npm run validate:data
npm run typecheck
npm test
npm run build
```

也可以一次运行：

```bash
npm run check
```

GitHub Actions 会自动执行：

1. JSON / GeoJSON 数据完整性检查；
2. TypeScript 类型检查；
3. Node.js 单元测试；
4. Vue 生产构建。

数据校验会专门拦截把 OSS / CDN 错误页误保存成 `.json` 的情况。

---

## 安全边界

后端默认仅监听：

```text
127.0.0.1:3000
```

因此默认适合本地演示。

如果确实需要在局域网或服务器上开放只读访问，可以显式设置：

```bash
HOST=0.0.0.0 CORS_ORIGIN=https://your-frontend.example npm run server
```

远程请求对案件录入、删除和重点区域布控等写接口**默认没有权限**。如确实需要远程写入，必须额外设置：

```bash
ZHIDUN_WRITE_TOKEN=your-long-random-token
```

并发送：

```text
Authorization: Bearer your-long-random-token
```

公网正式部署仍建议增加反向代理、HTTPS、完整身份认证 / RBAC、数据库、审计日志和限流。本仓库当前后端仍以轻量演示为目标。

---

## 目录结构

```text
.
├── .github/workflows/      # GitHub Actions
├── public/
│   └── geojson/            # 全国与省级行政区边界
├── screenshots/            # README 演示截图
├── server/
│   ├── data/               # 聚合数据与演示样本
│   ├── scripts/            # 数据构建 / 校验脚本
│   ├── tests/              # Node.js 单元测试
│   ├── forecast-models.js  # 多模型 Lite 预测
│   ├── model.js            # 主预测模型
│   ├── national-data.js    # 数据读取与查询
│   └── index.js            # HTTP API / 静态资源服务
├── web/
│   ├── src/                # Vue 3 前端
│   └── package.json
├── CITATION.cff
├── LICENSE
└── package.json            # npm workspace / 统一命令入口
```

---

## 核心 API

| API | 说明 |
| --- | --- |
| `GET /api/health` | 服务状态与安全运行模式 |
| `GET /api/meta` | 数据与模型元信息 |
| `GET /api/overview` | 全国概览 |
| `GET /api/trend` | 时间趋势 |
| `GET /api/points` | 案件点 GeoJSON |
| `GET /api/heatmap` | 热力网格 |
| `GET /api/rank` | 省 / 市排名 |
| `GET /api/predict` | 主模型预测 |
| `GET /api/predict/series` | 区域历史与预测序列 |
| `GET /api/models` | Lite 多模型比较 |
| `GET /api/social` | 社会信息演示指标 |
| `GET /api/patrol` | 巡逻方案演示 |
| `GET /api/checkpoints` | 合成卡口数据 |
| `GET /api/persons` | 合成重点人员数据 |
| `GET/POST/DELETE /api/cases` | 演示案件查询 / 本地写入 |
| `GET/POST/DELETE /api/controlled` | 重点区域演示管理 |

---

## 使用与解释限制

### 1. 不能把裁判文书数量直接理解为犯罪发生率

裁判文书受到案件进入司法程序、文书公开情况、地区司法实践和数据采集完整度等多种因素影响。

### 2. 社会经济分析只表示探索性相关

人口、房价和 POI 等模块不能据此推出因果结论，更不能直接形成现实警务资源配置建议。

### 3. 重点人员、卡口和调度数据包含模拟内容

相关模块主要展示系统工作流、地图交互和业务原型，不代表真实人员、真实派出所或真实执法记录。

### 4. 四色预警是可视化等级

风险等级由演示规则生成，不对应任何正式公安机关预警标准。

---

## 开发建议

提交前建议运行：

```bash
npm run check
```

如果新增行政区 GeoJSON，请确保：

- 文件是有效 JSON；
- 顶层类型为 `FeatureCollection`；
- 省级城市边界使用 `cities_<6位省级adcode>.json` 命名；
- 不要把接口返回的 XML / HTML 错误页提交为 `.json`。

---

## License

代码采用 [MIT License](LICENSE)。

数据、地图边界和第三方依赖仍应分别遵守其原始来源的许可与使用条款。

---

## Citation

如果在教学、研究或项目展示中使用本仓库，可参考 [`CITATION.cff`](CITATION.cff) 引用项目，并按原论文要求引用数据来源。
