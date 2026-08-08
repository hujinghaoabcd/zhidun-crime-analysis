import { createRouter, createWebHistory, RouterView } from "vue-router";
import { h } from "vue";

// 分组路由的父组件：渲染子路由
const GroupView = {
  render: () => h(RouterView)
};

const routes: any[] = [
  {
    path: "/home",
    component: () => import("@/layouts/HomeLayout.vue"),
    children: [
      { path: "/home", redirect: "/home/homeData" },
      {
        path: "/home/homeData",
        component: () => import("@/views/WorkPlanet.vue")
      },
      {
        path: "/home/caseInput",
        component: () => import("@/views/CaseInput.vue")
      },
      {
        path: "/home/caseSearch",
        component: () => import("@/views/CaseSearch.vue")
      }
    ]
  },
  {
    path: "/",
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      { path: "/", redirect: "/general/DataStatistics" },
      {
        path: "/general",
        name: "general",
        meta: { icon: "schedule", title: "警情概况" },
        component: GroupView,
        children: [
          {
            path: "/general/DataStatistics",
            name: "DataStatistics",
            meta: { title: "警情信息统计" },
            component: () => import("@/views/General/DataStatistics.vue")
          },
          {
            path: "/general/caseAnalysis",
            name: "caseAnalysis",
            meta: { title: "警情信息分析" },
            component: () => import("@/views/General/CaseAnalysis.vue")
          },
          {
            path: "/general/crimeAnimation",
            name: "crimeAnimation",
            meta: { title: "犯罪动态播放" },
            component: () => import("@/views/General/CrimeAnimation.vue")
          }
        ]
      },
      {
        path: "/SpatialAnalysis",
        name: "SpatialAnalysis",
        meta: { icon: "radar-chart", title: "社会信息分析" },
        component: GroupView,
        children: [
          {
            path: "/SpatialAnalysis/basic",
            name: "basic",
            meta: { title: "基础专题分析" },
            component: () => import("@/views/BasiclAnalysis.vue")
          },
          {
            path: "/SpatialAnalysis/people",
            name: "people",
            meta: { title: "人口数据分析" },
            component: () => import("@/views/PeopleAnalysis.vue")
          },
          {
            path: "/SpatialAnalysis/house",
            name: "house",
            meta: { title: "房价水平分析" },
            component: () => import("@/views/HouseAnalysis.vue")
          },
          {
            path: "/SpatialAnalysis/POI",
            name: "POI",
            meta: { title: "POI繁华度分析" },
            component: () => import("@/views/POIAnalysis.vue")
          }
        ]
      },
      {
        path: "/predict",
        name: "predict",
        meta: { icon: "bulb", title: "犯罪预测与预警" },
        component: () => import("@/views/TheftPredict.vue")
      },
      {
        path: "/command",
        name: "command",
        meta: { icon: "team", title: "指挥调度" },
        component: GroupView,
        children: [
          {
            path: "/command/areaControl",
            name: "areaControl",
            meta: { title: "重点区域布控" },
            component: () => import("@/views/AreaControl.vue")
          },
          {
            path: "/command/planning",
            name: "planning",
            meta: { title: "出警规划" },
            component: () => import("@/views/planning2.vue")
          },
          {
            path: "/command/swanBlock",
            name: "swanBlock",
            meta: { title: "卡口拦截" },
            component: () => import("@/views/SwanBlock.vue")
          }
        ]
      },
      {
        path: "/vipControl",
        name: "vipControl",
        meta: { icon: "eye", title: "重点人员管控" },
        component: GroupView,
        children: [
          {
            path: "/vipControl/IntegralWarning",
            name: "IntegralWarning",
            meta: { title: "重点人员积分预警" },
            component: () => import("@/views/IntegralWarning.vue")
          },
          {
            path: "/vipControl/trajectory",
            name: "trajectory",
            meta: { title: "重点人员异常轨迹分析" },
            component: () => import("@/views/Trajectory.vue")
          }
        ]
      }
    ]
  },
  {
    path: "/screen",
    name: "screen",
    meta: { icon: "fund", title: "可视化大屏" },
    component: () => import("@/views/Screen.vue")
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.afterEach(() => {
  document.title = "智盾 · 全国犯罪时空分析预警系统";
});

export default router;
