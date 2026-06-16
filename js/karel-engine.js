/* ============================================================
 *  karel-engine.js  —  Karel world model + animation
 * ------------------------------------------------------------
 *  Owns the *logical* state of the Karel agent (position on a
 *  waypoint path, facing direction, beepers). The Python layer
 *  (karel_runtime.py) calls the methods on window.KarelEngine
 *  synchronously while the user's program runs; each action is
 *  recorded as a frame in a timeline. After the program finishes,
 *  the timeline is replayed as an animation on the SVG map.
 *
 *  Direction encoding (Karel convention):
 *      0 = East, 1 = North, 2 = West, 3 = South
 *  turn_left() does dir = (dir + 1) % 4.
 * ============================================================ */

(function () {
  "use strict";

  /* ---- Puzzle definitions ----------------------------------
   * Each puzzle is a corridor of waypoints laid over the world
   * map. `segDirs[i]` is the facing required to move from
   * waypoint i to waypoint i+1, which is how bends force the use
   * of turn_left(). Beepers sit on specific waypoint indices.
   */
  const PUZZLES = {
    1: {
      fromWorld: 1, toWorld: 2,
      brief:
        'Cross the path from <strong>World 1</strong> to <strong>World 2</strong>.' +
        '<br><strong>Task:</strong> call <code>move()</code> three times — or use a <code>for</code> loop.',
      hint: "Try:  for i in range(3):\\n    move()",
      start: { index: 0, dir: 0 },
      path: [
        { x: 140, y: 460 }, { x: 187, y: 427 },
        { x: 233, y: 393 }, { x: 280, y: 360 },
      ],
      segDirs: [0, 0, 0],
      beepers: [],
      goalIndex: 3,
      requirePickAll: false,
      requirePutAtGoal: false,
    },
    2: {
      fromWorld: 2, toWorld: 3,
      brief:
        'Travel from <strong>World 2</strong> to <strong>World 3</strong>.' +
        '<br><strong>Task:</strong> a beeper sits on the path — <code>pick_beeper()</code> it, then reach the goal.',
      hint: "move()\\npick_beeper()\\nmove()\\nmove()",
      start: { index: 0, dir: 0 },
      path: [
        { x: 280, y: 360 }, { x: 333, y: 337 },
        { x: 387, y: 313 }, { x: 440, y: 290 },
      ],
      segDirs: [0, 0, 0],
      beepers: [1],
      goalIndex: 3,
      requirePickAll: true,
      requirePutAtGoal: false,
    },
    3: {
      fromWorld: 3, toWorld: 4,
      brief:
        'Reach <strong>World 4</strong>. The corridor length is unknown!' +
        '<br><strong>Task:</strong> use a <code>while</code> loop with <code>front_is_clear()</code>.',
      hint: "while front_is_clear():\\n    move()",
      start: { index: 0, dir: 0 },
      path: [
        { x: 440, y: 290 }, { x: 482, y: 272 }, { x: 525, y: 255 },
        { x: 567, y: 237 }, { x: 610, y: 220 },
      ],
      segDirs: [0, 0, 0, 0],
      beepers: [],
      goalIndex: 4,
      requirePickAll: false,
      requirePutAtGoal: false,
    },
    4: {
      fromWorld: 4, toWorld: 5,
      brief:
        'Final ascent to <strong>World 5</strong>. The path <em>bends</em>.' +
        '<br><strong>Task:</strong> define a function, <code>turn_left()</code> at the bend, then <code>put_beeper()</code> at the goal.',
      hint:
        "def step():\\n    move()\\n\\nstep()\\nstep()\\nturn_left()\\nstep()\\nstep()\\nput_beeper()",
      start: { index: 0, dir: 0 },
      path: [
        { x: 610, y: 220 }, { x: 660, y: 200 }, { x: 710, y: 180 },
        { x: 735, y: 160 }, { x: 760, y: 140 },
      ],
      // East, East, then North, North  (bend after waypoint 2)
      segDirs: [0, 0, 1, 1],
      beepers: [],
      goalIndex: 4,
      requirePickAll: false,
      requirePutAtGoal: true,
    },
  };

  const OP_LIMIT = 2000; // hard cap to stop runaway loops

  /* ---- Engine state ---------------------------------------- */
  const Engine = {
    puzzleId: 1,
    puzzle: PUZZLES[1],
    index: 0,
    dir: 0,
    bag: 0,            // beepers Karel is carrying
    beeperSet: null,   // Set of waypoint indices currently holding a beeper
    timeline: [],
    opCount: 0,
    running: false,
    onSolved: null,    // callback set by app.js

    /* ----- lifecycle ----- */
    loadPuzzle(id) {
      this.puzzleId = id;
      this.puzzle = PUZZLES[id];
      this._resetLogical();
      this._renderCorridor();
      this._placeKarel(this.puzzle.path[this.index], true);
      this.clearConsole();
      this.log("// Puzzle " + id + " loaded. Karel is ready.", "info");
      this._updatePuzzleInfo();
    },

    reset() {
      this._resetLogical();
      this._renderCorridor();
      this._placeKarel(this.puzzle.path[this.index], true);
      this.clearConsole();
      this.log("// Reset. Karel is back at the start.", "info");
    },

    _resetLogical() {
      this.index = this.puzzle.start.index;
      this.dir = this.puzzle.start.dir;
      this.bag = 0;
      this.beeperSet = new Set(this.puzzle.beepers);
      this.timeline = [];
      this.opCount = 0;
    },

    /* ----- called by the Run button ----- */
    beginRun() {
      this._resetLogical();
      this._renderCorridor();
      this._placeKarel(this.puzzle.path[this.index], true);
      this.clearConsole();
      this.log("$ python karel_program.py", "info");
    },

    /* ----- guard / op counter (called from Python) ----- */
    tick() {
      this.opCount += 1;
      return this.opCount > OP_LIMIT;
    },

    /* ===== Karel actions (called from Python) ============== */
    tryMove() {
      if (!this.frontIsClear()) {
        this.timeline.push({ type: "error", msg: "✗ Karel crashed — wall ahead." });
        return false;
      }
      this.index += 1;
      const wp = this.puzzle.path[this.index];
      this.timeline.push({
        type: "move", x: wp.x, y: wp.y, index: this.index,
        msg: "→ move()  ·  at waypoint " + this.index,
      });
      return true;
    },

    turnLeft() {
      this.dir = (this.dir + 1) % 4;
      const names = ["East", "North", "West", "South"];
      this.timeline.push({
        type: "turn", dir: this.dir,
        msg: "↺ turn_left()  ·  now facing " + names[this.dir],
      });
    },

    putBeeper() {
      this.beeperSet.add(this.index);
      if (this.bag > 0) this.bag -= 1;
      this.timeline.push({
        type: "put", index: this.index,
        msg: "◆ put_beeper()  ·  dropped at waypoint " + this.index,
      });
    },

    pickBeeper() {
      if (!this.beeperSet.has(this.index)) {
        this.timeline.push({ type: "error", msg: "✗ No beeper here to pick." });
        return false;
      }
      this.beeperSet.delete(this.index);
      this.bag += 1;
      this.timeline.push({
        type: "pick", index: this.index,
        msg: "◇ pick_beeper()  ·  picked at waypoint " + this.index,
      });
      return true;
    },

    /* ===== Karel predicates (called from Python) =========== */
    frontIsClear() {
      const p = this.puzzle;
      if (this.index >= p.goalIndex) return false;       // at the goal, nothing ahead
      return this.dir === p.segDirs[this.index];          // facing the corridor?
    },

    beepersPresent() {
      return this.beeperSet.has(this.index);
    },

    /* ===== logging from Python ============================= */
    logInfo(msg) { this.log(msg, "info"); },
    crash(msg) { this.timeline.push({ type: "error", msg: "✗ " + msg }); },

    finish(ok) {
      if (ok) this.timeline.push({ type: "done", msg: "✓ Program finished." });
      // Animation + evaluation are triggered by app.js after Python returns.
    },

    /* ===== animation replay =============================== */
    play(onDone) {
      const frames = this.timeline.slice();
      let i = 0;
      const step = () => {
        if (i >= frames.length) { onDone && onDone(); return; }
        const f = frames[i++];
        if (f.type === "move") {
          this._placeKarel({ x: f.x, y: f.y });
          this.log(f.msg, "move");
        } else if (f.type === "turn") {
          this.log(f.msg, "move");
        } else if (f.type === "put") {
          this._renderBeepers();
          this.log(f.msg, "warn");
        } else if (f.type === "pick") {
          this._renderBeepers();
          this.log(f.msg, "warn");
        } else if (f.type === "error") {
          this.log(f.msg, "error");
        } else if (f.type === "done") {
          this.log(f.msg, "success");
        }
        setTimeout(step, 430);
      };
      step();
    },

    /* ===== success test =================================== */
    isSolved() {
      const p = this.puzzle;
      if (this.index !== p.goalIndex) return false;
      if (p.requirePickAll && this.bag < p.beepers.length) return false;
      if (p.requirePutAtGoal && !this.beeperSet.has(p.goalIndex)) return false;
      return true;
    },

    /* ===== rendering helpers ============================== */
    _placeKarel(wp, instant) {
      const g = document.getElementById("karel-agent");
      if (!g) return;
      const circle = g.querySelector("circle");
      const text = g.querySelector("text");
      circle.setAttribute("cx", wp.x);
      circle.setAttribute("cy", wp.y);
      text.setAttribute("x", wp.x);
      text.setAttribute("y", wp.y + 5);
    },

    _renderCorridor() {
      // Draw faint stepping-stones for the active corridor.
      const layer = document.getElementById("beepers-layer");
      if (!layer) return;
      layer.innerHTML = "";
      const p = this.puzzle;
      p.path.forEach((wp, idx) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", wp.x);
        dot.setAttribute("cy", wp.y);
        dot.setAttribute("r", idx === p.goalIndex ? 9 : 6);
        dot.setAttribute("fill", idx === p.goalIndex ? "#10b981" : "#1e3a5f");
        dot.setAttribute("stroke", idx === p.goalIndex ? "#10b981" : "#3b82f6");
        dot.setAttribute("stroke-width", "1.5");
        dot.setAttribute("opacity", "0.7");
        layer.appendChild(dot);
      });
      this._renderBeepers();
    },

    _renderBeepers() {
      const layer = document.getElementById("beepers-layer");
      if (!layer) return;
      // remove previous beeper marks
      layer.querySelectorAll(".beeper").forEach((n) => n.remove());
      this.beeperSet.forEach((idx) => {
        const wp = this.puzzle.path[idx];
        const b = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        b.setAttribute("cx", wp.x);
        b.setAttribute("cy", wp.y);
        b.setAttribute("r", "5");
        b.setAttribute("class", "beeper");
        layer.appendChild(b);
      });
    },

    _updatePuzzleInfo() {
      const num = document.getElementById("puzzle-num");
      const desc = document.getElementById("puzzle-desc");
      if (num) num.textContent = this.puzzleId;
      if (desc) desc.innerHTML = this.puzzle.brief;
    },

    /* ===== console ======================================== */
    log(msg, type) {
      const out = document.getElementById("console-output");
      if (!out) return;
      const line = document.createElement("div");
      line.className = "console-line " + (type || "info");
      line.textContent = msg;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    },

    clearConsole() {
      const out = document.getElementById("console-output");
      if (out) out.innerHTML = "";
    },

    showHint() {
      this.log("💡 Hint:", "warn");
      this.puzzle.hint.split("\\n").forEach((l) => this.log("   " + l, "info"));
    },
  };

  window.KarelEngine = Engine;
  window.KarelPuzzles = PUZZLES;
})();
