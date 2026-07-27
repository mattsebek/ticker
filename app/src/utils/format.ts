export function fmtMoney(v: number): string {
  return "$" + v.toFixed(2);
}

export function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

export function sparkPath(arr: number[], w: number, h: number, pad = 2): string {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const step = (w - pad * 2) / (arr.length - 1);
  return arr
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function edgeSparkPath(arr: number[], w: number, h: number, padY = 0): string {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const step = w / (arr.length - 1);
  return arr
    .map((v, i) => {
      const x = i * step;
      const y = padY + (h - padY * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function edgeSparkAreaPath(arr: number[], w: number, h: number, padY = 0): string {
  const line = edgeSparkPath(arr, w, h, padY);
  return "M " + line.replace(/ /g, " L ") + ` L ${w.toFixed(1)},${h} L 0,${h} Z`;
}

export function edgeSparkPointAt(arr: number[], w: number, h: number, padY: number, idx: number) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const step = w / (arr.length - 1);
  const v = arr[idx];
  return { x: idx * step, y: padY + (h - padY * 2) * (1 - (v - min) / range) };
}
