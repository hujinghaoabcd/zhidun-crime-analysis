import { defineStore } from "pinia";

export interface MapConfig {
  mode:
    | "stats"
    | "heat"
    | "predict"
    | "patrol"
    | "animation"
    | "social"
    | "persons"
    | "trajectory"
    | "checkpoints";
  level: "province" | "city";
  province: number | null;
  city: number | null;
  start: string;
  end: string;
  type: string | null;
  grid: number;
  indicator: string | null;
  data: Record<string, any> | null;
  version: number;
}

const defaultConfig: MapConfig = {
  mode: "stats",
  level: "province",
  province: null,
  city: null,
  start: "2000-01-01",
  end: "2019-12-31",
  type: null,
  grid: 0.5,
  indicator: null,
  data: null,
  version: 0
};

export const useAppStore = defineStore("app", {
  state: () => ({
    showSlide: true,
    siderCollapsed: false,
    cardTitle: "警情信息统计",
    mapConfig: { ...defaultConfig },
    user: {
      name: "胡警官",
      unit: ""
    },
    animationTimeline: {
      months: [] as string[],
      counts: [] as number[],
      idx: 0
    },
    timelineJump: { idx: 0, version: 0 }
  }),
  actions: {
    setMapConfig(cfg: Partial<MapConfig>) {
      this.mapConfig = {
        ...defaultConfig,
        ...cfg,
        version: this.mapConfig.version + 1
      } as MapConfig;
    },
    patchMapConfig(cfg: Partial<MapConfig>) {
      this.mapConfig = {
        ...this.mapConfig,
        ...cfg,
        version: this.mapConfig.version + 1
      } as MapConfig;
    },
    setShowSlide(v: boolean) {
      this.showSlide = v;
    },
    toggleSider() {
      this.siderCollapsed = !this.siderCollapsed;
    },
    setCardTitle(t: string) {
      this.cardTitle = t;
    },
    setTimeline(t: { months: string[]; counts: number[]; idx: number }) {
      this.animationTimeline = t;
    },
    requestTimelineJump(idx: number) {
      this.timelineJump = { idx, version: this.timelineJump.version + 1 };
    }
  }
});
