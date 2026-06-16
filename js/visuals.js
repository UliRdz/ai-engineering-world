/* ============================================================
 *  visuals.js  —  generated SVG visual aids
 * ------------------------------------------------------------
 *  Every concept page opens with a visual. Rather than ship a
 *  multi-megabyte Pyodide + matplotlib runtime into a static
 *  site, visuals are drawn as lightweight inline SVG that reads
 *  the page's CSS variables, so they stay on-theme and load
 *  instantly. Each generator returns an SVG string.
 *
 *  (If you specifically need real matplotlib output, the README
 *  explains how to swap this module for a Pyodide-backed one.)
 * ============================================================ */

(function () {
  "use strict";

  const W = 680, H = 300;
  const C = {
    cyan: "var(--accent-cyan)", blue: "var(--accent-blue)",
    violet: "var(--accent-violet)", pink: "var(--accent-pink)",
    amber: "var(--accent-amber)", green: "var(--accent-green)",
    red: "var(--accent-red)", dim: "var(--border-dim)",
    txt: "var(--text-secondary)", muted: "var(--text-muted)",
    surf: "var(--bg-surface)", card: "var(--bg-card)",
  };

  const svg = (inner, vb) =>
    `<svg viewBox="0 0 ${vb || W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="JetBrains Mono, monospace">${inner}</svg>`;

  const label = (x, y, t, fill, size, anchor) =>
    `<text x="${x}" y="${y}" fill="${fill || C.txt}" font-size="${size || 11}" text-anchor="${anchor || "start"}">${t}</text>`;

  const box = (x, y, w, h, stroke, fill) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill || C.card}" stroke="${stroke || C.dim}" stroke-width="1.5"/>`;

  const arrow = (x1, y1, x2, y2, color) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color || C.muted}" stroke-width="2" marker-end="url(#ah)"/>`;

  const defs =
    `<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">` +
    `<path d="M0,0 L7,3 L0,6 Z" fill="${C.muted}"/></marker></defs>`;

  /* ---------- chart primitives ---------- */
  function barChart(values, labels, colors, title) {
    const max = Math.max(...values, 1);
    const n = values.length;
    const gw = 520, gx = 110, gy = 50, gh = 190, bw = (gw / n) * 0.55;
    let s = label(gx, 30, title, C.cyan, 13);
    s += `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    values.forEach((v, i) => {
      const h = (v / max) * gh;
      const x = gx + (gw / n) * i + (gw / n - bw) / 2;
      const y = gy + gh - h;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${colors[i % colors.length]}" opacity="0.85"/>`;
      s += label(x + bw / 2, y - 6, "" + v, C.txt, 10, "middle");
      s += label(x + bw / 2, gy + gh + 16, labels[i], C.muted, 10, "middle");
    });
    return svg(s);
  }

  function lineChart(series, title, axisLabels) {
    const gw = 540, gx = 90, gy = 45, gh = 195;
    let allY = [];
    series.forEach((sr) => sr.pts.forEach((p) => allY.push(p[1])));
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const allX = series[0].pts.map((p) => p[0]);
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const sx = (x) => gx + ((x - minX) / (maxX - minX || 1)) * gw;
    const sy = (y) => gy + gh - ((y - minY) / (maxY - minY || 1)) * gh;
    let s = label(gx, 28, title, C.cyan, 13);
    s += `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    if (axisLabels) {
      s += label(gx + gw / 2, gy + gh + 24, axisLabels[0], C.muted, 10, "middle");
    }
    series.forEach((sr) => {
      const d = sr.pts.map((p, i) => (i ? "L" : "M") + sx(p[0]) + "," + sy(p[1])).join(" ");
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2.5"/>`;
      sr.pts.forEach((p) => (s += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="3" fill="${sr.color}"/>`));
      if (sr.name) s += label(sx(sr.pts[sr.pts.length - 1][0]) - 4, sy(sr.pts[sr.pts.length - 1][1]) - 8, sr.name, sr.color, 10, "end");
    });
    return svg(s);
  }

  function scatter(groups, title) {
    const gw = 540, gx = 90, gy = 45, gh = 195;
    let s = label(gx, 28, title, C.cyan, 13);
    s += `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    s += `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${C.dim}"/>`;
    groups.forEach((g) => {
      g.pts.forEach((p) => {
        s += `<circle cx="${gx + p[0] * gw}" cy="${gy + gh - p[1] * gh}" r="6" fill="${g.color}" opacity="0.8"/>`;
      });
    });
    return svg(s);
  }

  /* ---------- flow / schematic primitives ---------- */
  function flow(nodes, title) {
    // nodes: [{t, color}] laid out horizontally with arrows
    const n = nodes.length, bw = 120, gap = (W - 40 - n * bw) / (n - 1 || 1);
    let s = defs + label(20, 30, title, C.cyan, 13);
    let x = 20, y = 130;
    nodes.forEach((nd, i) => {
      s += box(x, y, bw, 56, nd.color, C.card);
      // wrap text in up to 2 lines
      const words = nd.t.split(" ");
      const mid = Math.ceil(words.length / 2);
      const l1 = words.slice(0, mid).join(" "), l2 = words.slice(mid).join(" ");
      s += label(x + bw / 2, y + (l2 ? 26 : 32), l1, nd.color, 11, "middle");
      if (l2) s += label(x + bw / 2, y + 42, l2, nd.color, 11, "middle");
      if (i < n - 1) s += arrow(x + bw + 4, y + 28, x + bw + gap - 4, y + 28);
      x += bw + gap;
    });
    return svg(s);
  }

  function stack(rows, title) {
    // vertical stack of labeled bands
    let s = label(W / 2, 28, title, C.cyan, 13, "middle");
    const bh = 38, gap = 10, top = 50;
    rows.forEach((r, i) => {
      const y = top + i * (bh + gap);
      s += box(180, y, 320, bh, r.color, C.card);
      s += label(340, y + 24, r.t, r.color, 12, "middle");
    });
    return svg(s);
  }

  function heatmap(grid, title, rowLabels) {
    const cell = 34, gx = 150, gy = 55;
    const max = Math.max(...grid.flat());
    let s = label(gx, 30, title, C.cyan, 13);
    grid.forEach((row, r) => {
      if (rowLabels) s += label(gx - 10, gy + r * cell + cell / 2 + 4, rowLabels[r], C.muted, 10, "end");
      row.forEach((v, c) => {
        const op = 0.15 + 0.8 * (v / max);
        s += `<rect x="${gx + c * cell}" y="${gy + r * cell}" width="${cell - 3}" height="${cell - 3}" rx="3" fill="${C.cyan}" opacity="${op.toFixed(2)}"/>`;
        s += label(gx + c * cell + (cell - 3) / 2, gy + r * cell + (cell) / 2 + 3, v.toFixed(1), "#0a0f1a", 9, "middle");
      });
    });
    return svg(s);
  }

  function vectors2d(vecs, title) {
    const ox = 120, oy = 230, scale = 150;
    let s = label(ox, 28, title, C.cyan, 13);
    s += `<line x1="${ox}" y1="40" x2="${ox}" y2="${oy}" stroke="${C.dim}"/>`;
    s += `<line x1="${ox}" y1="${oy}" x2="${ox + 360}" y2="${oy}" stroke="${C.dim}"/>`;
    vecs.forEach((v) => {
      const ex = ox + v.x * scale, ey = oy - v.y * scale;
      s += `<line x1="${ox}" y1="${oy}" x2="${ex}" y2="${ey}" stroke="${v.color}" stroke-width="3" marker-end="url(#ah)"/>`;
      s += label(ex + 6, ey, v.t, v.color, 10);
    });
    return defs ? svg(defs + s) : svg(s);
  }

  /* ---------- per-concept registry ---------- */
  const R = {
    db: () => stack([
      { t: "users  (id, name, tier)", color: C.blue },
      { t: "orders (id, user_id, $)", color: C.cyan },
      { t: "FK: orders.user_id → users.id", color: C.green },
    ], "RDBMS · fixed schema + relations"),

    doc: () => stack([
      { t: "{ session_id: ... }", color: C.violet },
      { t: "  conversation_history: [ ]", color: C.cyan },
      { t: "  nested · schema-less", color: C.green },
    ], "NoSQL · nested documents"),

    warehouse: () => barChart([50, 120, 90, 170], ["Q1", "Q2", "Q3", "agg"], [C.blue, C.blue, C.blue, C.green], "OLAP aggregation (k$)"),

    lake: () => stack([
      { t: "contract_001.pdf", color: C.amber },
      { t: "stream.json", color: C.cyan },
      { t: "audio.wav · raw, native formats", color: C.violet },
    ], "Data Lake · raw multi-format"),

    tokens: () => flow([
      { t: "raw text", color: C.txt },
      { t: "chunks", color: C.blue },
      { t: "token ids", color: C.cyan },
    ], "Tokenization pipeline"),

    enrich: () => flow([
      { t: "paragraph", color: C.txt },
      { t: "NER + summary", color: C.violet },
      { t: "metadata tags", color: C.green },
    ], "AI enrichment"),

    scaler: () => barChart([10, 100, 1000], ["raw a", "raw b", "raw c"], [C.muted, C.muted, C.muted], "Before scaling (skewed)"),

    outliers: () => scatter([
      { color: C.cyan, pts: [[0.2, 0.3], [0.25, 0.28], [0.18, 0.33], [0.22, 0.3]] },
      { color: C.red, pts: [[0.9, 0.92]] },
    ], "Isolation Forest · anomaly in red"),

    cosine: () => vectors2d([
      { x: 0.95, y: 0.25, t: "database", color: C.cyan },
      { x: 0.88, y: 0.35, t: "architecture", color: C.blue },
      { x: 0.2, y: 0.95, t: "cake recipe", color: C.pink },
    ], "Cosine similarity in vector space"),

    embed: () => barChart([0.04, 0.02, 0.08, 0.05, 0.03, 0.07], ["d1", "d2", "d3", "d4", "d5", "d6"], [C.cyan, C.cyan, C.cyan, C.cyan, C.cyan, C.cyan], "384-dim dense vector (sample)"),

    ann: () => {
      // HNSW layered graph
      let s = label(20, 28, "HNSW · navigable small-world graph", C.cyan, 13);
      const layers = [{ y: 70, n: 3, c: C.violet }, { y: 150, n: 5, c: C.blue }, { y: 230, n: 8, c: C.cyan }];
      layers.forEach((L) => {
        const step = 600 / (L.n + 1);
        for (let i = 1; i <= L.n; i++) {
          const x = 40 + step * i;
          if (i < L.n) s += `<line x1="${x}" y1="${L.y}" x2="${40 + step * (i + 1)}" y2="${L.y}" stroke="${C.dim}" stroke-width="1.5"/>`;
          s += `<circle cx="${x}" cy="${L.y}" r="7" fill="${L.c}"/>`;
        }
      });
      return svg(s);
    },

    ragflow: () => flow([
      { t: "query", color: C.txt },
      { t: "embed + search", color: C.blue },
      { t: "inject chunks", color: C.cyan },
      { t: "LLM answer", color: C.green },
    ], "RAG · online phase"),

    cache: () => stack([
      { t: "full document → context window", color: C.amber },
      { t: "Redis / vLLM cache layer", color: C.cyan },
      { t: "no per-query retrieval", color: C.green },
    ], "CAG · preloaded context"),

    kvcache: () => lineChart([
      { name: "no cache O(N²)", color: C.red, pts: [[1, 1], [2, 4], [3, 9], [4, 16], [5, 25]] },
      { name: "KV cache O(N)", color: C.green, pts: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
    ], "KV cache · compute per token", ["sequence length"]),

    classify: () => scatter([
      { color: C.blue, pts: [[0.15, 0.2], [0.2, 0.25], [0.12, 0.18], [0.22, 0.3]] },
      { color: C.pink, pts: [[0.78, 0.82], [0.85, 0.75], [0.9, 0.88], [0.8, 0.79]] },
    ], "Classification · two classes + boundary"),

    cluster: () => scatter([
      { color: C.cyan, pts: [[0.18, 0.2], [0.22, 0.25], [0.15, 0.18]] },
      { color: C.amber, pts: [[0.8, 0.82], [0.85, 0.78], [0.78, 0.85]] },
    ], "K-Means · discovered clusters"),

    pca: () => {
      let s = label(20, 28, "PCA · 50-D → 2-D projection", C.cyan, 13);
      s += defs;
      s += box(40, 90, 150, 120, C.muted, C.surf) + label(115, 155, "50 dims", C.muted, 12, "middle");
      s += arrow(200, 150, 300, 150, C.violet);
      s += box(320, 110, 90, 80, C.green, C.card) + label(365, 155, "2 dims", C.green, 12, "middle");
      return svg(s);
    },

    timeseries: () => lineChart([
      { name: "traffic", color: C.cyan, pts: [[0, 102], [1, 105], [2, 110], [3, 118], [4, 125], [5, 131], [6, 140]] },
      { name: "forecast", color: C.amber, pts: [[6, 140], [7, 147]] },
    ], "ARIMA · trend forecast", ["time step"]),

    nn: () => {
      let s = label(20, 28, "Neural network · layered nodes", C.cyan, 13) + defs;
      const layers = [[90], [70, 130, 190], [70, 130, 190], [130]];
      const xs = [80, 240, 400, 560];
      const cy = (arr, i) => 60 + arr[i] * 1.0;
      layers.forEach((arr, li) => {
        arr.forEach((yy) => {
          s += `<circle cx="${xs[li]}" cy="${yy + 30}" r="12" fill="${li === 0 ? C.blue : li === layers.length - 1 ? C.green : C.violet}"/>`;
          if (li < layers.length - 1) {
            layers[li + 1].forEach((y2) => {
              s += `<line x1="${xs[li] + 12}" y1="${yy + 30}" x2="${xs[li + 1] - 12}" y2="${y2 + 30}" stroke="${C.dim}" stroke-width="1"/>`;
            });
          }
        });
      });
      return svg(s);
    },

    weights: () => lineChart([
      { name: "good lr", color: C.green, pts: [[0, 9], [1, 5], [2, 2.5], [3, 1.2], [4, 0.6]] },
      { name: "high lr", color: C.red, pts: [[0, 9], [1, 4], [2, 7], [3, 2], [4, 8]] },
    ], "Learning rate · loss curves", ["epoch"]),

    gradient: () => {
      // a parabola with descent steps
      const gx = 90, gy = 45, gw = 540, gh = 195;
      const f = (x) => (x - 0.5) * (x - 0.5) * 4;
      let path = "";
      for (let i = 0; i <= 50; i++) {
        const x = i / 50;
        const px = gx + x * gw, py = gy + gh - f(x) * gh;
        path += (i ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1) + " ";
      }
      let s = label(gx, 28, "Gradient descent · minimizing cost", C.cyan, 13);
      s += `<path d="${path}" fill="none" stroke="${C.dim}" stroke-width="2"/>`;
      [0.05, 0.18, 0.32, 0.44, 0.5].forEach((x, i) => {
        const px = gx + x * gw, py = gy + gh - f(x) * gh;
        s += `<circle cx="${px}" cy="${py}" r="6" fill="${i === 4 ? C.green : C.amber}"/>`;
      });
      return svg(s);
    },

    activation: () => {
      const gx = 90, gy = 45, gw = 540, gh = 195, mid = gy + gh / 2;
      const relu = (x) => Math.max(0, x);
      const gelu = (x) => 0.5 * x * (1 + Math.tanh(0.797 * (x + 0.044 * x ** 3)));
      const sx = (x) => gx + ((x + 3) / 6) * gw;
      const sy = (y) => mid - (y / 3) * (gh / 2);
      const mk = (fn) => { let d = ""; for (let i = 0; i <= 60; i++) { const x = -3 + (6 * i) / 60; d += (i ? "L" : "M") + sx(x).toFixed(1) + "," + sy(fn(x)).toFixed(1) + " "; } return d; };
      let s = label(gx, 28, "Activation functions", C.cyan, 13);
      s += `<line x1="${gx}" y1="${mid}" x2="${gx + gw}" y2="${mid}" stroke="${C.dim}"/>`;
      s += `<path d="${mk(relu)}" fill="none" stroke="${C.green}" stroke-width="2.5"/>` + label(gx + gw - 4, gy + 20, "ReLU", C.green, 11, "end");
      s += `<path d="${mk(gelu)}" fill="none" stroke="${C.pink}" stroke-width="2.5"/>` + label(gx + gw - 4, gy + 38, "GeLU", C.pink, 11, "end");
      return svg(s);
    },

    attention: () => heatmap(
      [[0.9, 0.2, 0.1, 0.3], [0.2, 0.8, 0.4, 0.1], [0.1, 0.3, 0.7, 0.5], [0.4, 0.1, 0.2, 0.9]],
      "Self-attention weight matrix", ["tok1", "tok2", "tok3", "tok4"]),

    transformer: () => stack([
      { t: "Input + Positional Encoding", color: C.blue },
      { t: "Multi-Head Self-Attention", color: C.pink },
      { t: "Feed-Forward + Norm", color: C.violet },
    ], "Transformer block"),

    moe: () => {
      let s = label(20, 28, "Mixture of Experts · routing", C.cyan, 13) + defs;
      s += box(40, 120, 110, 56, C.txt, C.card) + label(95, 152, "router", C.txt, 12, "middle");
      const experts = [["Expert 1", 60, C.green], ["Expert 2", 130, C.muted], ["Expert 3", 200, C.muted]];
      experts.forEach((e) => {
        s += arrow(154, 148, 396, e[1] + 24, e[2]);
        s += box(400, e[1], 130, 48, e[2], C.card) + label(465, e[1] + 30, e[0], e[2], 11, "middle");
      });
      return svg(s);
    },

    reasoning: () => flow([
      { t: "verify A", color: C.violet },
      { t: "analyze B", color: C.violet },
      { t: "refine", color: C.violet },
      { t: "answer", color: C.green },
    ], "Reasoning chain (hidden tokens)"),

    finetune: () => {
      let s = label(20, 28, "Fine-tuning · frozen base + LoRA", C.cyan, 13) + defs;
      s += box(60, 110, 200, 70, C.muted, C.surf) + label(160, 150, "frozen base model", C.muted, 11, "middle");
      s += box(320, 120, 150, 50, C.green, C.card) + label(395, 150, "LoRA adapter r=8", C.green, 11, "middle");
      s += arrow(265, 145, 316, 145, C.green);
      return svg(s);
    },

    agentloop: () => {
      let s = label(20, 28, "Agent loop · Think › Execute › Review", C.cyan, 13) + defs;
      const nodes = [["Think", 130, 90, C.blue], ["Execute", 500, 90, C.cyan], ["Review", 315, 220, C.amber]];
      nodes.forEach((n) => { s += box(n[1] - 60, n[2] - 24, 120, 48, n[3], C.card) + label(n[1], n[2] + 5, n[0], n[3], 12, "middle"); });
      s += arrow(195, 90, 435, 90);
      s += arrow(495, 118, 360, 200);
      s += arrow(270, 200, 150, 118);
      return svg(s);
    },

    latency: () => barChart([42, 380, 1200, 18500], ["vLLM", "batch", "cold", "stalled"], [C.green, C.blue, C.amber, C.red], "Time to first token (ms)"),

    evals: () => barChart([0.92, 0.75, 0.88, 0.4], ["relevance", "faithful", "A", "B"], [C.green, C.green, C.blue, C.red], "Eval scores (0–1)"),

    infra: () => stack([
      { t: "On-Premise · max security", color: C.blue },
      { t: "Cloud · auto-scaling GPUs", color: C.cyan },
      { t: "Local · zero-cost prototyping", color: C.green },
    ], "AI infrastructure strategies"),
  };

  window.getVisual = function (key) {
    const fn = R[key] || R.transformer;
    try { return fn(); } catch (e) { return svg(label(W / 2, H / 2, "visual unavailable", C.muted, 12, "middle")); }
  };
})();
