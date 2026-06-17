/* ============================================================================
   python-interpreter.js
   ----------------------------------------------------------------------------
   A tiny, dependency-free Python-subset interpreter that runs in the browser
   (and Node, for tests). It is intentionally lightweight: rather than shipping
   a multi-megabyte Pyodide/Brython runtime, it supports exactly the language
   surface the Karel puzzles need:

     statements   : assignment, expression call, for, while, if/elif/else,
                    def, return, pass
     expressions  : int/float, True/False/None, names, function calls,
                    + - * / // %, comparisons, and / or / not, parentheses,
                    list literals, range(...)

   Built-in functions (move, turn_left, sensors, ...) are injected by the host
   via run(src, builtins). The interpreter guards against infinite loops.
   ============================================================================ */

(function (root) {
  "use strict";

  // --- Error type carried back to the UI -----------------------------------
  class PyError extends Error {
    constructor(message, line) {
      super(message);
      this.name = "PyError";
      this.line = line || null;
    }
  }
  // Internal signal used to unwind `return`
  class ReturnSignal {
    constructor(value) { this.value = value; }
  }

  /* ===================== 1. LINE / BLOCK STRUCTURE ======================== */

  function stripComment(line) {
    let inStr = false, quote = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        if (c === quote && line[i - 1] !== "\\") inStr = false;
      } else if (c === "'" || c === '"') {
        inStr = true; quote = c;
      } else if (c === "#") {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function lexLines(src) {
    const out = [];
    const rawLines = src.replace(/\r\n/g, "\n").split("\n");
    rawLines.forEach((raw, idx) => {
      const noComment = stripComment(raw);
      const expanded = noComment.replace(/\t/g, "    ");
      if (expanded.trim() === "") return;            // skip blank / comment-only
      const indent = expanded.length - expanded.trimStart().length;
      out.push({ indent, text: expanded.trim(), line: idx + 1 });
    });
    return out;
  }

  const HEADER_RE = /^(for|while|if|elif|else|def)\b/;

  /* ===================== 2. STATEMENT PARSER ============================== */

  function parseSuite(lines, i, indent) {
    const stmts = [];
    while (i < lines.length && lines[i].indent === indent) {
      const cur = lines[i];
      if (HEADER_RE.test(cur.text)) {
        const res = parseCompound(lines, i, indent);
        stmts.push(res.node);
        i = res.next;
      } else {
        stmts.push(parseSimple(cur.text, cur.line));
        i++;
      }
    }
    return { stmts, next: i };
  }

  // header line of a compound statement -> { headerExpr text, inlineBody }
  function splitHeader(text, line) {
    const colon = findTopLevelColon(text);
    if (colon === -1) throw new PyError("expected ':' in block statement", line);
    const head = text.slice(0, colon).trim();
    const inline = text.slice(colon + 1).trim();
    return { head, inline };
  }

  function findTopLevelColon(text) {
    let depth = 0, inStr = false, quote = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (c === quote) inStr = false; continue; }
      if (c === "'" || c === '"') { inStr = true; quote = c; }
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === ":" && depth === 0) return i;
    }
    return -1;
  }

  function parseBody(lines, i, headerIndent, inline, line) {
    if (inline) return { body: [parseSimple(inline, line)], next: i + 1 };
    // child block: next line must be more indented
    if (i + 1 >= lines.length || lines[i + 1].indent <= headerIndent) {
      throw new PyError("expected an indented block", line);
    }
    const childIndent = lines[i + 1].indent;
    const res = parseSuite(lines, i + 1, childIndent);
    return { body: res.stmts, next: res.next };
  }

  function parseCompound(lines, i, indent) {
    const cur = lines[i];
    const { head, inline } = splitHeader(cur.text, cur.line);

    if (head.startsWith("for")) {
      const m = head.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/);
      if (!m) throw new PyError("malformed for-loop", cur.line);
      const bodyRes = parseBody(lines, i, indent, inline, cur.line);
      return { node: { type: "for", varName: m[1], iter: parseExpr(m[2], cur.line), body: bodyRes.body, line: cur.line }, next: bodyRes.next };
    }

    if (head.startsWith("while")) {
      const m = head.match(/^while\s+(.+)$/);
      if (!m) throw new PyError("malformed while-loop", cur.line);
      const bodyRes = parseBody(lines, i, indent, inline, cur.line);
      return { node: { type: "while", test: parseExpr(m[1], cur.line), body: bodyRes.body, line: cur.line }, next: bodyRes.next };
    }

    if (head.startsWith("def")) {
      const m = head.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/);
      if (!m) throw new PyError("malformed function definition", cur.line);
      const params = m[2].trim() === "" ? [] : m[2].split(",").map(s => s.trim());
      const bodyRes = parseBody(lines, i, indent, inline, cur.line);
      return { node: { type: "def", name: m[1], params, body: bodyRes.body, line: cur.line }, next: bodyRes.next };
    }

    if (head.startsWith("if")) {
      const m = head.match(/^if\s+(.+)$/);
      if (!m) throw new PyError("malformed if statement", cur.line);
      const bodyRes = parseBody(lines, i, indent, inline, cur.line);
      const branches = [{ test: parseExpr(m[1], cur.line), body: bodyRes.body }];
      let next = bodyRes.next;
      let elseBody = null;
      // attach elif / else at the same indent
      while (next < lines.length && lines[next].indent === indent && /^(elif|else)\b/.test(lines[next].text)) {
        const cl = lines[next];
        const parts = splitHeader(cl.text, cl.line);
        if (parts.head.startsWith("elif")) {
          const em = parts.head.match(/^elif\s+(.+)$/);
          if (!em) throw new PyError("malformed elif", cl.line);
          const eb = parseBody(lines, next, indent, parts.inline, cl.line);
          branches.push({ test: parseExpr(em[1], cl.line), body: eb.body });
          next = eb.next;
        } else { // else
          const eb = parseBody(lines, next, indent, parts.inline, cl.line);
          elseBody = eb.body;
          next = eb.next;
          break;
        }
      }
      return { node: { type: "if", branches, elseBody, line: cur.line }, next };
    }

    throw new PyError("unexpected statement: " + head, cur.line);
  }

  function parseSimple(text, line) {
    if (text === "pass") return { type: "pass", line };
    if (text === "break") return { type: "break", line };
    if (text === "continue") return { type: "continue", line };
    if (/^return\b/.test(text)) {
      const rest = text.slice(6).trim();
      return { type: "return", expr: rest ? parseExpr(rest, line) : null, line };
    }
    // assignment? find a top-level '=' that is not ==, <=, >=, !=
    const eq = findAssignEq(text);
    if (eq !== -1) {
      const name = text.slice(0, eq).trim();
      if (!/^[A-Za-z_]\w*$/.test(name)) {
        throw new PyError("invalid assignment target: " + name, line);
      }
      return { type: "assign", name, expr: parseExpr(text.slice(eq + 1).trim(), line), line };
    }
    return { type: "expr", expr: parseExpr(text, line), line };
  }

  function findAssignEq(text) {
    let depth = 0, inStr = false, quote = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (c === quote) inStr = false; continue; }
      if (c === "'" || c === '"') { inStr = true; quote = c; }
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === "=" && depth === 0) {
        const prev = text[i - 1], nextc = text[i + 1];
        if (nextc === "=") { i++; continue; }            // ==
        if (prev === "!" || prev === "<" || prev === ">") continue; // != <= >=
        return i;
      }
    }
    return -1;
  }

  /* ===================== 3. EXPRESSION TOKENIZER ========================== */

  function tokenizeExpr(src, line) {
    const toks = [];
    let i = 0;
    const ops = ["==", "!=", "<=", ">=", "//", "<", ">", "+", "-", "*", "/", "%", "(", ")", "[", "]", ","];
    while (i < src.length) {
      const c = src[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "'" || c === '"') {
        let j = i + 1, s = "";
        while (j < src.length && src[j] !== c) { s += src[j]; j++; }
        if (j >= src.length) throw new PyError("unterminated string", line);
        toks.push({ t: "str", v: s }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        let j = i, num = "";
        while (j < src.length && /[0-9.]/.test(src[j])) { num += src[j]; j++; }
        toks.push({ t: "num", v: parseFloat(num) }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i, name = "";
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) { name += src[j]; j++; }
        if (name === "and" || name === "or" || name === "not" || name === "in") toks.push({ t: "kw", v: name });
        else if (name === "True") toks.push({ t: "bool", v: true });
        else if (name === "False") toks.push({ t: "bool", v: false });
        else if (name === "None") toks.push({ t: "none", v: null });
        else toks.push({ t: "name", v: name });
        i = j; continue;
      }
      let matched = null;
      for (const op of ops) { if (src.startsWith(op, i)) { matched = op; break; } }
      if (matched) { toks.push({ t: "op", v: matched }); i += matched.length; continue; }
      throw new PyError("unexpected character '" + c + "' in expression", line);
    }
    return toks;
  }

  /* ===================== 4. EXPRESSION PARSER (Pratt-ish) ================= */

  function parseExpr(src, line) {
    const toks = tokenizeExpr(src, line);
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    const expect = (v) => {
      const tk = toks[pos];
      if (!tk || tk.v !== v) throw new PyError("expected '" + v + "'", line);
      pos++;
    };

    function parseOr() {
      let node = parseAnd();
      while (peek() && peek().t === "kw" && peek().v === "or") { next(); node = { type: "logic", op: "or", left: node, right: parseAnd() }; }
      return node;
    }
    function parseAnd() {
      let node = parseNot();
      while (peek() && peek().t === "kw" && peek().v === "and") { next(); node = { type: "logic", op: "and", left: node, right: parseNot() }; }
      return node;
    }
    function parseNot() {
      if (peek() && peek().t === "kw" && peek().v === "not") { next(); return { type: "unary", op: "not", operand: parseNot() }; }
      return parseCmp();
    }
    function parseCmp() {
      let node = parseAdd();
      while (peek() && peek().t === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(peek().v)) {
        const op = next().v; node = { type: "binop", op, left: node, right: parseAdd() };
      }
      return node;
    }
    function parseAdd() {
      let node = parseMul();
      while (peek() && peek().t === "op" && ["+", "-"].includes(peek().v)) {
        const op = next().v; node = { type: "binop", op, left: node, right: parseMul() };
      }
      return node;
    }
    function parseMul() {
      let node = parseUnary();
      while (peek() && peek().t === "op" && ["*", "/", "//", "%"].includes(peek().v)) {
        const op = next().v; node = { type: "binop", op, left: node, right: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().t === "op" && peek().v === "-") { next(); return { type: "unary", op: "-", operand: parseUnary() }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = peek();
      if (!tk) throw new PyError("unexpected end of expression", line);
      if (tk.t === "num") { next(); return { type: "lit", value: tk.v }; }
      if (tk.t === "str") { next(); return { type: "lit", value: tk.v }; }
      if (tk.t === "bool") { next(); return { type: "lit", value: tk.v }; }
      if (tk.t === "none") { next(); return { type: "lit", value: null }; }
      if (tk.t === "op" && tk.v === "(") { next(); const e = parseOr(); expect(")"); return e; }
      if (tk.t === "op" && tk.v === "[") {
        next(); const items = [];
        if (!(peek() && peek().v === "]")) {
          items.push(parseOr());
          while (peek() && peek().v === ",") { next(); if (peek() && peek().v === "]") break; items.push(parseOr()); }
        }
        expect("]"); return { type: "list", items };
      }
      if (tk.t === "name") {
        next();
        if (peek() && peek().t === "op" && peek().v === "(") {   // call
          next(); const args = [];
          if (!(peek() && peek().v === ")")) {
            args.push(parseOr());
            while (peek() && peek().v === ",") { next(); args.push(parseOr()); }
          }
          expect(")");
          return { type: "call", name: tk.v, args };
        }
        return { type: "name", name: tk.v };
      }
      throw new PyError("unexpected token '" + tk.v + "'", line);
    }

    const result = parseOr();
    if (pos !== toks.length) throw new PyError("trailing tokens in expression", line);
    return result;
  }

  /* ===================== 5. EVALUATOR ===================================== */

  function truthy(v) {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.length > 0;
    return !!v;
  }

  function Interpreter(builtins, limits) {
    this.builtins = builtins || {};
    this.maxSteps = (limits && limits.maxSteps) || 200000;
    this.steps = 0;
  }

  Interpreter.prototype.run = function (src) {
    const lines = lexLines(src);
    if (lines.length === 0) return;
    const program = parseSuite(lines, 0, lines[0].indent).stmts;
    const globalScope = { vars: Object.create(null), funcs: Object.create(null), parent: null };
    this.execBlock(program, globalScope);
  };

  Interpreter.prototype.tick = function (line) {
    if (++this.steps > this.maxSteps) {
      throw new PyError("execution exceeded step limit — possible infinite loop", line);
    }
  };

  Interpreter.prototype.execBlock = function (stmts, scope) {
    for (const st of stmts) this.execStmt(st, scope);
  };

  Interpreter.prototype.execStmt = function (st, scope) {
    this.tick(st.line);
    switch (st.type) {
      case "pass": return;
      case "break": throw { __break: true };
      case "continue": throw { __continue: true };
      case "expr": this.eval(st.expr, scope); return;
      case "assign": this.setVar(scope, st.name, this.eval(st.expr, scope)); return;
      case "return": throw new ReturnSignal(st.expr ? this.eval(st.expr, scope) : null);
      case "def":
        scope.funcs[st.name] = { params: st.params, body: st.body };
        return;
      case "if": {
        for (const br of st.branches) {
          if (truthy(this.eval(br.test, scope))) { this.execBlock(br.body, scope); return; }
        }
        if (st.elseBody) this.execBlock(st.elseBody, scope);
        return;
      }
      case "while": {
        while (truthy(this.eval(st.test, scope))) {
          this.tick(st.line);
          try { this.execBlock(st.body, scope); }
          catch (e) { if (e && e.__break) break; if (e && e.__continue) continue; throw e; }
        }
        return;
      }
      case "for": {
        const iterable = this.eval(st.iter, scope);
        if (!Array.isArray(iterable)) throw new PyError("for-loop target is not iterable", st.line);
        for (const v of iterable) {
          this.tick(st.line);
          this.setVar(scope, st.varName, v);
          try { this.execBlock(st.body, scope); }
          catch (e) { if (e && e.__break) break; if (e && e.__continue) continue; throw e; }
        }
        return;
      }
      default: throw new PyError("unknown statement type " + st.type, st.line);
    }
  };

  Interpreter.prototype.setVar = function (scope, name, value) {
    // assign in the nearest scope that already has it, else current scope
    let s = scope;
    while (s) { if (name in s.vars) { s.vars[name] = value; return; } s = s.parent; }
    scope.vars[name] = value;
  };

  Interpreter.prototype.getVar = function (scope, name, line) {
    let s = scope;
    while (s) { if (name in s.vars) return s.vars[name]; s = s.parent; }
    throw new PyError("name '" + name + "' is not defined", line);
  };

  Interpreter.prototype.findFunc = function (scope, name) {
    let s = scope;
    while (s) { if (name in s.funcs) return s.funcs[name]; s = s.parent; }
    return null;
  };

  Interpreter.prototype.eval = function (node, scope) {
    switch (node.type) {
      case "lit": return node.value;
      case "name": return this.getVar(scope, node.name, node.line);
      case "list": return node.items.map(it => this.eval(it, scope));
      case "unary": {
        const v = this.eval(node.operand, scope);
        if (node.op === "not") return !truthy(v);
        if (node.op === "-") return -v;
        break;
      }
      case "logic": {
        const l = this.eval(node.left, scope);
        if (node.op === "and") return truthy(l) ? this.eval(node.right, scope) : l;
        return truthy(l) ? l : this.eval(node.right, scope);   // or
      }
      case "binop": return this.binop(node.op, this.eval(node.left, scope), this.eval(node.right, scope));
      case "call": return this.callFn(node.name, node.args.map(a => this.eval(a, scope)), scope);
    }
    throw new PyError("cannot evaluate node " + node.type);
  };

  Interpreter.prototype.binop = function (op, a, b) {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return a / b;
      case "//": return Math.floor(a / b);
      case "%": return ((a % b) + b) % b;
      case "==": return a === b;
      case "!=": return a !== b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
    }
    throw new PyError("unknown operator " + op);
  };

  Interpreter.prototype.callFn = function (name, args, scope) {
    // built-in range
    if (name === "range") return rangeFn(args);
    if (name === "len") { const x = args[0]; return Array.isArray(x) || typeof x === "string" ? x.length : 0; }
    // host built-ins (move, turn_left, sensors, ...)
    if (this.builtins[name]) return this.builtins[name].apply(null, args);
    // user-defined function
    const fn = this.findFunc(scope, name);
    if (fn) {
      if (args.length !== fn.params.length) {
        throw new PyError(name + "() expected " + fn.params.length + " args, got " + args.length);
      }
      const local = { vars: Object.create(null), funcs: Object.create(null), parent: scope };
      fn.params.forEach((p, idx) => { local.vars[p] = args[idx]; });
      try { this.execBlock(fn.body, local); }
      catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
      return null;
    }
    throw new PyError("name '" + name + "' is not defined");
  };

  function rangeFn(args) {
    let start = 0, stop = 0, step = 1;
    if (args.length === 1) stop = args[0];
    else if (args.length === 2) { start = args[0]; stop = args[1]; }
    else if (args.length === 3) { start = args[0]; stop = args[1]; step = args[2]; }
    else throw new PyError("range expected 1-3 arguments");
    const out = [];
    if (step === 0) throw new PyError("range() step cannot be zero");
    if (step > 0) for (let n = start; n < stop; n += step) out.push(n);
    else for (let n = start; n > stop; n += step) out.push(n);
    return out;
  }

  /* ===================== 6. PUBLIC API ==================================== */

  function run(src, builtins, limits) {
    const interp = new Interpreter(builtins, limits);
    interp.run(src);
    return interp.steps;
  }

  const api = { run, PyError, Interpreter };
  if (typeof window !== "undefined") window.PyInterp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
