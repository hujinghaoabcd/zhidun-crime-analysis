export const POP_10K: Record<number, number> = {
  110000: 2189, 120000: 1387, 130000: 7461, 140000: 3492, 150000: 2405,
  210000: 4259, 220000: 2407, 230000: 3751, 310000: 2487, 320000: 8475,
  330000: 6457, 340000: 6103, 350000: 4154, 360000: 4519, 370000: 10153,
  410000: 9937, 420000: 5775, 430000: 6644, 440000: 12601, 450000: 5013,
  460000: 1008, 500000: 3205, 510000: 8367, 520000: 3856, 530000: 4721,
  540000: 365, 610000: 3953, 620000: 2502, 630000: 720, 640000: 620,
  650000: 2585
};

export const HOUSE_PRICE: Record<number, number> = {
  110000: 6.0, 120000: 1.8, 130000: 1.0, 140000: 0.9, 150000: 0.9,
  210000: 0.9, 220000: 0.9, 230000: 0.8, 310000: 5.4, 320000: 1.9,
  330000: 2.3, 340000: 0.9, 350000: 1.9, 360000: 0.9, 370000: 1.0,
  410000: 0.8, 420000: 0.9, 430000: 0.8, 440000: 1.6, 450000: 0.7,
  460000: 1.8, 500000: 1.0, 510000: 0.9, 520000: 0.7, 530000: 0.9,
  540000: 0.8, 610000: 0.9, 620000: 0.7, 630000: 0.7, 640000: 0.7,
  650000: 0.6
};

export function poiIndex(adcode: number): number {
  const h = ((adcode * 2654435761) >>> 0) % 1000;
  const pop = POP_10K[adcode] || 1000;
  const price = HOUSE_PRICE[adcode] || 0.8;
  const base = Math.log10(pop) * 18 + price * 6;
  return Math.min(100, Math.round(base + (h / 1000) * 12));
}

export function pearson(a: number[], b: number[]): string {
  const n = Math.min(a.length, b.length);
  if (!n) return "0.00";
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (a[i] - ma) * (b[i] - mb);
    sxx += (a[i] - ma) ** 2;
    syy += (b[i] - mb) ** 2;
  }
  return sxx && syy ? (sxy / Math.sqrt(sxx * syy)).toFixed(2) : "0.00";
}
