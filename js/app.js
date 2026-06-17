/* ============================================================
 *  app.js  —  application controller
 * ------------------------------------------------------------
 *  Wires together the three pieces:
 *   - the world map + Python terminal (Karel game)
 *   - the unlock progression (solving puzzle N unlocks World N+1)
 *   - the encyclopedia screen (sidebar + dynamic concept render)
 * ============================================================ */

(function () {
  "use strict";

  /* ---------- progression state ---------- */
  const state = {
    unlocked: new Set([1]), // World 1 is readable from the start
    currentPuzzle: 1,       // puzzle that solving unlocks the next world
    pendingWorld: null,     // world to open from the unlock banner
    activeLayer: 1,         // layer shown in the encyclopedia
  };

  /* ---------- element helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const screenMap = $("screen-map");
  const screenEnc = $("screen-encyclopedia");

  function showScreen(which) {
    [screenMap, screenEnc].forEach((s) => s.classList.remove("active"));
    which.classList.add("active");
  }

  /* ========================================================
   *  MAP + GAME
   * ====================================================== */
  function refreshNodes() {
    for (let w = 1; w <= 5; w++) {
      const node = $("node-" + w);
      if (!node) continue;
      node.classList.remove("locked", "unlocked", "current");
      if (state.unlocked.has(w)) node.classList.add("unlocked");
      else node.classList.add("locked");
    }
    // mark the world Karel is currently sitting at
    const here = $("node-" + PUZZLE_FROM());
    if (here) here.classList.add("current");
  }

  function PUZZLE_FROM() {
    const p = window.KarelPuzzles[state.currentPuzzle];
    return p ? p.fromWorld : 5;
  }

  function refreshProgress() {
    const pct = (state.unlocked.size / 5) * 100;
    $("world-progress").style.width = pct + "%";
  }

  function refreshDock() {
    const dock = $("worlds-dock");
    // remove old buttons (keep the label)
    dock.querySelectorAll(".dock-btn").forEach((b) => b.remove());
    const colors = { 1: "var(--layer-1)", 2: "var(--layer-2)", 3: "var(--layer-3)", 4: "var(--layer-4)", 5: "var(--layer-5)" };
    Array.from(state.unlocked).sort().forEach((w) => {
      const btn = document.createElement("button");
      btn.className = "dock-btn";
      btn.style.color = colors[w];
      btn.style.borderColor = colors[w];
      btn.style.background = "transparent";
      btn.textContent = "Layer " + w;
      btn.onclick = () => openEncyclopedia(w);
      dock.appendChild(btn);
    });
  }

  /* called by KarelEngine after the animation completes */
  function onRunComplete() {
    if (window.KarelEngine.isSolved()) {
      const p = window.KarelPuzzles[state.currentPuzzle];
      const target = p.toWorld;
      state.unlocked.add(target);
      state.pendingWorld = target;

      window.KarelEngine.log("🔓 World " + target + " unlocked!", "success");
      showUnlockBanner(target);

      // advance to the next puzzle, move Karel's "home" forward
      if (window.KarelPuzzles[state.currentPuzzle + 1]) {
        state.currentPuzzle += 1;
      }
      refreshNodes();
      refreshProgress();
      refreshDock();
    } else {
      window.KarelEngine.log("// Not there yet — Karel did not reach the goal. Try again.", "warn");
    }
  }

  function showUnlockBanner(world) {
    const banner = $("unlock-banner");
    banner.classList.remove("hidden");
    banner.querySelector("span").textContent = "🔓";
    const btn = $("btn-enter-world");
    btn.textContent = "Enter Layer " + world + " →";
  }

  function hideUnlockBanner() {
    $("unlock-banner").classList.add("hidden");
  }

  /* ---------- Karel command vocabulary ----------
   * These thin wrappers are injected into the interpreter as built-in
   * functions. Each one ticks the engine's op-counter (infinite-loop guard) and delegates to
   * the JS engine, which owns the grid state and records the animation. */
  function karelBuiltins() {
    const E = window.KarelEngine;
    const guard = () => {
      if (E.tick()) throw "Operation limit exceeded — possible infinite loop.";
    };
    return {
      move() { guard(); if (!E.tryMove()) throw "Karel crashed: the path ahead is blocked."; },
      turn_left() { guard(); E.turnLeft(); },
      put_beeper() { guard(); E.putBeeper(); },
      pick_beeper() { guard(); if (!E.pickBeeper()) throw "There is no beeper here to pick up."; },
      front_is_clear() { return !!E.frontIsClear(); },
      front_is_blocked() { return !E.frontIsClear(); },
      beepers_present() { return !!E.beepersPresent(); },
      no_beepers_present() { return !E.beepersPresent(); },
      print() {
        const msg = Array.prototype.map.call(arguments, String).join(" ");
        E.logInfo(msg);
      },
    };
  }

  /* ---------- terminal buttons ---------- */
  function runCode() {
    if (!window.PyInterp || typeof window.PyInterp.run !== "function") {
      window.KarelEngine.log("// Interpreter not loaded — check that js/python-interpreter.js is present.", "error");
      return;
    }
    hideUnlockBanner();
    window.KarelEngine.beginRun();
    const code = (document.getElementById("code-editor") || {}).value || "";
    try {
      window.PyInterp.run(code, karelBuiltins(), { maxSteps: 100000 });
    } catch (e) {
      // PyError (syntax / name errors) and Karel crashes (thrown strings)
      window.KarelEngine.crash(e && e.message ? e.message : String(e));
    }
    window.KarelEngine.play(onRunComplete);
  }

  /* ========================================================
   *  ENCYCLOPEDIA
   * ====================================================== */
  function buildSidebar(layerId) {
    const layer = window.ENC_BY_LAYER[layerId];
    const list = $("concept-list");
    list.innerHTML = "";

    const header = document.createElement("li");
    header.className = "group-header";
    header.textContent = layer.subtitle || ("Layer " + layerId);
    list.appendChild(header);

    layer.concepts.forEach((c) => {
      const li = document.createElement("li");
      li.dataset.concept = c.id;
      li.innerHTML = "<strong>" + c.id + "</strong> · " + c.title;
      li.onclick = () => {
        list.querySelectorAll("li").forEach((n) => n.classList.remove("active"));
        li.classList.add("active");
        renderConcept(c.id);
      };
      list.appendChild(li);
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // turn `inline code` and **bold** into HTML, escaping the rest
  function richText(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function renderConcept(conceptId) {
    const c = window.ENC_BY_ID[conceptId];
    if (!c) return;
    const view = $("concept-view");

    const libs = c.library.split("·").map((l) =>
      '<span class="tag lib">' + esc(l.trim()) + "</span>").join("");

    const goodLines = c.good.split("\n");
    const goodMain = esc(goodLines[0]);
    const goodNote = goodLines.slice(1).join(" ").replace(/^—\s*/, "");

    view.innerHTML = `
      <div class="concept-page">
        <div class="concept-visual">${window.getVisual(c.viz)}</div>

        <h1 class="concept-title">${esc(c.title)}</h1>
        <div class="concept-tags">
          <span class="tag layer-${c.layer}">LAYER ${c.layer}</span>
          ${libs}
        </div>

        <div class="section-block">
          <div class="section-label">Description</div>
          <p class="section-text">${richText(c.description)}</p>
        </div>

        <div class="section-block">
          <div class="section-label">Purpose of Use</div>
          <p class="section-text">${richText(c.purpose)}</p>
        </div>

        <div class="section-block">
          <div class="section-label">Relationship in the AI Stack</div>
          <div class="relationship-flow">${richText(c.relationship)}</div>
        </div>

        <div class="section-block">
          <div class="section-label">Code Implementation (Python)</div>
          <div class="code-block-wrap">
            <div class="code-block-header">
              <span>python · ${esc(c.id)}</span>
              <button class="code-block-copy" data-code="${encodeURIComponent(c.code)}">copy</button>
            </div>
            <pre class="code-block">${esc(c.code)}</pre>
          </div>
        </div>

        <div class="section-block">
          <div class="section-label">Output Examples</div>
          <div class="output-grid">
            <div class="output-card good">
              <div class="output-card-header">✓ GOOD OUTPUT</div>
              <div class="output-card-body">${esc(goodMain)}
                ${goodNote ? '<span class="rca-label" style="border-color:rgba(16,185,129,0.2)">' + esc(goodNote) + "</span>" : ""}
              </div>
            </div>
            <div class="output-card bad">
              <div class="output-card-header">✗ BAD OUTPUT</div>
              <div class="output-card-body">${esc(c.bad)}
                <span class="rca-label"><strong>Root cause:</strong> ${esc(c.rca)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // wire copy buttons
    view.querySelectorAll(".code-block-copy").forEach((btn) => {
      btn.onclick = () => {
        const code = decodeURIComponent(btn.dataset.code);
        navigator.clipboard && navigator.clipboard.writeText(code);
        btn.textContent = "copied!";
        setTimeout(() => (btn.textContent = "copy"), 1200);
      };
    });

    view.scrollTop = 0;
  }

  function openEncyclopedia(layerId) {
    if (!state.unlocked.has(layerId)) {
      window.KarelEngine.log("// Layer " + layerId + " is locked. Solve the puzzle to unlock it.", "warn");
      return;
    }
    state.activeLayer = layerId;
    const layer = window.ENC_BY_LAYER[layerId];
    $("enc-world-title").textContent = layer.title;
    buildSidebar(layerId);

    // reset content to placeholder
    $("concept-view").innerHTML = `
      <div class="concept-placeholder">
        <div class="placeholder-icon">📖</div>
        <div class="placeholder-text">Select a concept from the sidebar to begin</div>
        <button class="btn-open-sidebar" id="btn-open-sidebar-hint2">Open Topics →</button>
      </div>`;
    const hint = $("btn-open-sidebar-hint2");
    if (hint) hint.onclick = openSidebar;

    openSidebar();          // show topics by default on entry
    showScreen(screenEnc);
  }

  /* ---------- sidebar toggle ---------- */
  function openSidebar() { $("enc-sidebar").classList.remove("collapsed"); }
  function toggleSidebar() { $("enc-sidebar").classList.toggle("collapsed"); }

  /* ========================================================
   *  EVENT WIRING
   * ====================================================== */
  function wire() {
    // terminal
    $("btn-run").onclick = runCode;
    $("btn-reset").onclick = () => { hideUnlockBanner(); window.KarelEngine.reset(); };
    $("btn-hint").onclick = () => window.KarelEngine.showHint();
    $("btn-enter-world").onclick = () => {
      if (state.pendingWorld) openEncyclopedia(state.pendingWorld);
      hideUnlockBanner();
    };

    // map nodes
    for (let w = 1; w <= 5; w++) {
      const node = $("node-" + w);
      if (node) node.addEventListener("click", () => openEncyclopedia(w));
    }

    // encyclopedia chrome
    $("btn-back-map").onclick = () => showScreen(screenMap);
    $("btn-toggle-sidebar").onclick = toggleSidebar;
    const ph = $("btn-open-sidebar-hint");
    if (ph) ph.onclick = openSidebar;
  }

  /* ---------- boot ---------- */
  function boot() {
    wire();
    window.KarelEngine.loadPuzzle(1);
    refreshNodes();
    refreshProgress();
    refreshDock();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
