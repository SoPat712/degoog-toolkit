(function () {
  "use strict";

  var ROOT_SELECTOR = "[data-calc-root]";
  var FUNCTION_NAMES = "sin|cos|tan|asin|acos|atan|sqrt|log|ln|abs|factorial";
  var FUNCTION_SET = FUNCTION_NAMES.split("|").reduce(function (set, name) {
    set[name] = true;
    return set;
  }, {});
  var SAFE_CHARS_RE = /^[0-9a-zA-Z_\s+\-*/^().!%]+$/;
  var ALLOWED_SYMBOLS = {
    x: true,
    pi: true,
    e: true,
    ans: true,
    factorial: true,
  };
  var PARSER_OPTIONS = {
    operators: {
      add: true,
      subtract: true,
      multiply: true,
      divide: true,
      power: true,
      factorial: true,
      remainder: false,
      concatenate: false,
      conditional: false,
      logical: false,
      comparison: false,
      in: false,
      assignment: false,
    },
  };

  var states = new WeakMap();
  var parserLoad = null;
  var redrawTimer = 0;

  function ensureParser() {
    if (window.exprEval && window.exprEval.Parser) {
      return Promise.resolve(window.exprEval);
    }

    if (parserLoad) return parserLoad;

    parserLoad = new Promise(function (resolve, reject) {
      if (typeof __PLUGIN_ID__ === "undefined") {
        reject(new Error("Missing plugin id"));
        return;
      }

      var existing = document.querySelector("script[data-calc-parser]");
      if (existing) {
        existing.addEventListener("load", function () {
          if (window.exprEval && window.exprEval.Parser) resolve(window.exprEval);
          else reject(new Error("Parser failed to load"));
        });
        existing.addEventListener("error", reject);
        return;
      }

      var script = document.createElement("script");
      script.async = true;
      script.dataset.calcParser = "1";
      script.src =
        "/api/plugin/" + encodeURIComponent(__PLUGIN_ID__) + "/parser";
      script.onload = function () {
        if (window.exprEval && window.exprEval.Parser) resolve(window.exprEval);
        else reject(new Error("Parser failed to load"));
      };
      script.onerror = reject;
      (document.head || document.documentElement).appendChild(script);
    });

    return parserLoad;
  }

  function factorial(value) {
    if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
      return NaN;
    }
    if (value > 170) return Infinity;
    var result = 1;
    for (var i = 2; i <= value; i += 1) result *= i;
    return result;
  }

  function createParser(angleMode) {
    var parser = new window.exprEval.Parser(PARSER_OPTIONS);
    var toInputAngle =
      angleMode === "deg"
        ? function (value) {
            return (value * Math.PI) / 180;
          }
        : function (value) {
            return value;
          };
    var fromOutputAngle =
      angleMode === "deg"
        ? function (value) {
            return (value * 180) / Math.PI;
          }
        : function (value) {
            return value;
          };

    parser.unaryOps.sin = function (value) {
      return Math.sin(toInputAngle(value));
    };
    parser.unaryOps.cos = function (value) {
      return Math.cos(toInputAngle(value));
    };
    parser.unaryOps.tan = function (value) {
      return Math.tan(toInputAngle(value));
    };
    parser.unaryOps.asin = function (value) {
      return fromOutputAngle(Math.asin(value));
    };
    parser.unaryOps.acos = function (value) {
      return fromOutputAngle(Math.acos(value));
    };
    parser.unaryOps.atan = function (value) {
      return fromOutputAngle(Math.atan(value));
    };
    parser.unaryOps.sqrt = Math.sqrt;
    parser.unaryOps.log = Math.log10;
    parser.unaryOps.ln = Math.log;
    parser.unaryOps.abs = Math.abs;
    parser.functions.factorial = factorial;

    return parser;
  }

  function stripEquationPrefix(expr) {
    return String(expr || "")
      .trim()
      .replace(/^y\s*=\s*/i, "")
      .replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "");
  }

  function normalizeExpression(input) {
    var expr = stripEquationPrefix(input);

    expr = expr
      .replace(/\u00d7/g, "*")
      .replace(/\u00f7/g, "/")
      .replace(/[\u2212\u2013\u2014]/g, "-")
      .replace(/\u03c0/gi, "pi")
      .replace(/\bans\b/gi, "ans")
      .replace(/\bpi\b/gi, "pi")
      .replace(/\bE\b/g, "e");

    while (/(\d),(\d{3}\b)/.test(expr)) {
      expr = expr.replace(/(\d),(\d{3}\b)/g, "$1$2");
    }

    expr = expr.replace(/\u221a\s*\(/g, "sqrt(");
    expr = expr.replace(
      /\u221a\s*(\d+(?:\.\d+)?|\b(?:x|pi|e|ans)\b)/gi,
      "sqrt($1)",
    );
    expr = expr.replace(
      new RegExp("\\b(?:" + FUNCTION_NAMES + ")\\b", "gi"),
      function (match) {
        return match.toLowerCase();
      },
    );
    expr = expr.replace(
      /(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\b(?:x|pi|e|ans)\b|\))\s*%/gi,
      "$1/100",
    );

    expr = expr.replace(
      new RegExp(
        "(\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)(?=(?:x|pi|ans|e(?![0-9])|" +
          FUNCTION_NAMES +
          "\\s*\\())",
        "gi",
      ),
      "$1*",
    );
    var leftToken =
      "((?:\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)|\\)|!|\\b(?:x|pi|e|ans)\\b)";
    var rightToken =
      "(?=(?:\\b(?:x|pi|e|ans)\\b|\\b(?:" +
      FUNCTION_NAMES +
      ")\\s*\\(|\\())";
    expr = expr.replace(new RegExp(leftToken + "\\s*" + rightToken, "gi"), "$1*");

    return expr.replace(/\s+/g, " ").trim();
  }

  function parseExpression(input, angleMode) {
    var normalized = normalizeExpression(input);
    if (!normalized || !SAFE_CHARS_RE.test(normalized)) {
      throw new Error("Unsupported expression");
    }

    var parser = createParser(angleMode);
    var parsed = parser.parse(normalized);
    var symbols =
      typeof parsed.symbols === "function" ? parsed.symbols() : parsed.variables();
    var lowerSymbols = symbols.map(function (symbol) {
      return String(symbol).toLowerCase();
    });

    for (var i = 0; i < lowerSymbols.length; i += 1) {
      if (!ALLOWED_SYMBOLS[lowerSymbols[i]]) {
        throw new Error("Unsupported symbol");
      }
    }

    return {
      normalized: normalized,
      parsed: parsed,
      symbols: lowerSymbols,
      hasX: lowerSymbols.indexOf("x") !== -1,
    };
  }

  function getUnknownIdentifiers(normalized) {
    var withoutNumbers = normalized.replace(
      /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
      " ",
    );
    var identifiers = withoutNumbers.match(/[a-zA-Z_]+/g) || [];
    var unknown = [];

    identifiers.forEach(function (identifier) {
      var lower = String(identifier).toLowerCase();
      if (!ALLOWED_SYMBOLS[lower] && !FUNCTION_SET[lower]) unknown.push(lower);
    });

    return unknown;
  }

  function getParenState(expr) {
    var stack = [];
    for (var index = 0; index < expr.length; index += 1) {
      var char = expr[index];
      if (char === "(") stack.push(index);
      if (char === ")") {
        if (!stack.length) return { invalidClose: true, openIndexes: [] };
        stack.pop();
      }
    }

    return { invalidClose: false, openIndexes: stack };
  }

  function isIncompleteExpression(input) {
    var normalized = normalizeExpression(input);
    if (!normalized || !SAFE_CHARS_RE.test(normalized)) return false;
    if (getUnknownIdentifiers(normalized).length) return false;

    var compact = normalized.replace(/\s+/g, "");
    var parens = getParenState(compact);
    if (parens.invalidClose) return false;

    if (/[+\-*/^.]$/.test(compact)) return true;
    if (/\($/.test(compact)) return true;
    if (parens.openIndexes.length > 0) return true;
    if (new RegExp("(?:^|[^a-zA-Z_])(?:" + FUNCTION_NAMES + ")$", "i").test(compact)) {
      return true;
    }

    return false;
  }

  function evaluateParsed(analysis, state, xValue) {
    if (analysis.hasX && typeof xValue !== "number") {
      throw new Error("Expression requires x");
    }

    var variables = {
      pi: Math.PI,
      e: Math.E,
      ans: Number.isFinite(state.ans) ? state.ans : 0,
    };

    if (typeof xValue === "number") variables.x = xValue;
    return analysis.parsed.evaluate(variables);
  }

  function formatNumber(value) {
    if (typeof value !== "number") return String(value);
    if (Number.isNaN(value)) return "Not a number";
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";

    var cleaned = Object.is(value, -0) || Math.abs(value) < 1e-14 ? 0 : value;
    var abs = Math.abs(cleaned);

    if (abs !== 0 && (abs >= 1e12 || abs < 1e-8)) {
      return cleaned.toExponential(8).replace(/\.?0+e/, "e");
    }

    return Number(cleaned.toPrecision(12)).toLocaleString("en-US", {
      maximumFractionDigits: 10,
    });
  }

  function formatPlain(value) {
    if (!Number.isFinite(value)) return "0";
    return String(Number(value.toPrecision(12)));
  }

  function getState(root) {
    var state = states.get(root);
    if (state) return state;

    state = {
      expr: root.getAttribute("data-initial") || "",
      result: root.getAttribute("data-result") || "0",
      ans: parseFloat(root.getAttribute("data-ans")) || 0,
      angleMode: root.getAttribute("data-angle-mode") === "deg" ? "deg" : "rad",
      inverse: false,
      justEvaluated: false,
      lastAnalysis: null,
      lastGraphAnalysis: null,
      xMin: -10,
      xMax: 10,
      yMin: undefined,
      yMax: undefined,
      yNeedsAutoFit: true,
      hoverX: null,
      hoverPx: null,
      lastGraphExpr: null,
      pointer: null,
    };
    states.set(root, state);
    return state;
  }

  function updateRoot(root) {
    var state = getState(root);
    var expressionEl = root.querySelector("[data-calc-expression]");
    var resultEl = root.querySelector("[data-calc-result]");
    var graph = root.querySelector("[data-calc-graph]");

    state.lastGraphAnalysis = null;

    if (!state.expr) {
      state.result = state.justEvaluated ? state.result : "0";
    } else {
      try {
        var analysis = parseExpression(state.expr, state.angleMode);
        state.lastAnalysis = analysis;

        if (analysis.hasX) {
          state.result = "Graph";
          state.lastGraphAnalysis = analysis;
          if (state.lastGraphExpr !== state.expr) {
            state.xMin = -10;
            state.xMax = 10;
            state.yMin = undefined;
            state.yMax = undefined;
            state.yNeedsAutoFit = true;
            state.hoverX = null;
            state.hoverPx = null;
            state.lastGraphExpr = state.expr;
          }
        } else {
          state.result = formatNumber(evaluateParsed(analysis, state));
        }
      } catch (error) {
        state.lastAnalysis = null;
        if (isIncompleteExpression(state.expr)) {
          if (!state.result || state.result === "Error" || state.result === "Not a number") {
            state.result = "0";
          }
        } else {
          state.result = "Error";
        }
      }
    }

    if (expressionEl) expressionEl.textContent = state.expr;
    if (resultEl) {
      resultEl.textContent = state.result;
      resultEl.classList.toggle("calc-result--compact", state.result.length > 16);
      resultEl.classList.toggle(
        "calc-result--error",
        state.result === "Error" || state.result === "Not a number",
      );
    }

    syncButtons(root, state);

    if (state.lastGraphAnalysis) {
      drawGraph(root, state, state.lastGraphAnalysis);
    } else if (graph) {
      graph.hidden = true;
    }
  }

  function syncButtons(root, state) {
    toggleActive(root.querySelector("[data-calc-rad]"), state.angleMode === "rad");
    toggleActive(root.querySelector("[data-calc-deg]"), state.angleMode === "deg");
    toggleActive(root.querySelector("[data-calc-inverse]"), state.inverse);

    setText(root.querySelector("[data-calc-sin]"), state.inverse ? "asin" : "sin");
    setText(root.querySelector("[data-calc-cos]"), state.inverse ? "acos" : "cos");
    setText(root.querySelector("[data-calc-tan]"), state.inverse ? "atan" : "tan");
    setText(root.querySelector("[data-calc-ln]"), state.inverse ? "e^x" : "ln");
    setText(root.querySelector("[data-calc-log]"), state.inverse ? "10^x" : "log");
    setText(root.querySelector("[data-calc-sqrt]"), state.inverse ? "x^2" : "sqrt");
  }

  function toggleActive(element, active) {
    if (element) element.classList.toggle("calc-btn--active", active);
  }

  function setText(element, text) {
    if (element) element.textContent = text;
  }

  function appendToken(root, token) {
    var state = getState(root);
    if (state.justEvaluated) {
      if (/^[+\-*/^%!]/.test(token)) {
        state.expr = formatPlain(state.ans);
      } else {
        state.expr = "";
      }
      state.justEvaluated = false;
    }

    if (token === ".") {
      var parts = state.expr.split(/[+\-*/^()]/);
      var tail = parts[parts.length - 1] || "";
      if (tail.indexOf(".") !== -1) return;
    }

    state.expr += token;
    updateRoot(root);
  }

  function commitEquals(root) {
    var state = getState(root);
    if (!state.expr) return;

    try {
      var analysis = parseExpression(state.expr, state.angleMode);
      if (analysis.hasX) {
        state.lastGraphAnalysis = analysis;
        state.result = "Graph";
        state.justEvaluated = false;
        updateRoot(root);
        return;
      }

      var value = evaluateParsed(analysis, state);
      state.ans = Number.isFinite(value) ? value : state.ans;
      state.result = formatNumber(value);
      state.expr = "";
      state.justEvaluated = true;
    } catch (error) {
      if (!isIncompleteExpression(state.expr)) {
        state.result = "Error";
      } else if (!state.result || state.result === "Error" || state.result === "Not a number") {
        state.result = "0";
      }
      state.justEvaluated = false;
    }

    updateRoot(root);
  }

  function handleAction(root, action) {
    var state = getState(root);

    if (/^digit-\d$/.test(action)) {
      appendToken(root, action.slice(-1));
      return;
    }

    switch (action) {
      case "dot":
        appendToken(root, ".");
        break;
      case "add":
        appendToken(root, "+");
        break;
      case "subtract":
        appendToken(root, "-");
        break;
      case "multiply":
        appendToken(root, "*");
        break;
      case "divide":
        appendToken(root, "/");
        break;
      case "power":
        appendToken(root, "^");
        break;
      case "percent":
        appendToken(root, "%");
        break;
      case "open-paren":
        appendToken(root, "(");
        break;
      case "close-paren":
        appendToken(root, ")");
        break;
      case "sin":
        appendToken(root, state.inverse ? "asin(" : "sin(");
        break;
      case "cos":
        appendToken(root, state.inverse ? "acos(" : "cos(");
        break;
      case "tan":
        appendToken(root, state.inverse ? "atan(" : "tan(");
        break;
      case "ln":
        appendToken(root, state.inverse ? "e^(" : "ln(");
        break;
      case "log":
        appendToken(root, state.inverse ? "10^(" : "log(");
        break;
      case "sqrt":
        appendToken(root, state.inverse ? "^2" : "sqrt(");
        break;
      case "factorial":
        appendToken(root, "!");
        break;
      case "pi":
        appendToken(root, "pi");
        break;
      case "e":
        appendToken(root, "e");
        break;
      case "ans":
        appendToken(root, "Ans");
        break;
      case "x":
        appendToken(root, "x");
        break;
      case "equals":
        commitEquals(root);
        break;
      case "clear":
        state.expr = "";
        state.result = "0";
        state.justEvaluated = false;
        updateRoot(root);
        break;
      case "backspace":
        if (state.justEvaluated) {
          state.expr = "";
          state.result = "0";
          state.justEvaluated = false;
        } else {
          state.expr = state.expr.slice(0, -1);
        }
        updateRoot(root);
        break;
      case "rad":
        state.angleMode = "rad";
        updateRoot(root);
        break;
      case "deg":
        state.angleMode = "deg";
        updateRoot(root);
        break;
      case "inverse":
        state.inverse = !state.inverse;
        syncButtons(root, state);
        break;
      default:
        break;
    }
  }

  function computeAutoYBounds(finiteY) {
    finiteY.sort(function (a, b) {
      return a - b;
    });
    var yMin = finiteY[Math.floor(finiteY.length * 0.05)];
    var yMax = finiteY[Math.floor(finiteY.length * 0.95)];

    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }

    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);

    var yPad = (yMax - yMin) * 0.12 || 1;
    return { yMin: yMin - yPad, yMax: yMax + yPad };
  }

  function drawGraph(root, state, analysis) {
    var graph = root.querySelector("[data-calc-graph]");
    var label = root.querySelector("[data-calc-graph-label]");
    var canvas = root.querySelector("[data-calc-canvas]");
    if (!graph || !canvas) return;

    graph.hidden = false;
    if (label) label.textContent = stripEquationPrefix(state.expr);

    var width = Math.max(280, Math.floor(canvas.clientWidth || 640));
    var height = Math.max(160, Math.floor(canvas.clientHeight || 220));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var style = getComputedStyle(root);
    var gridColor = cssVar(style, "--border-light", "rgba(60,64,67,0.18)");
    var axisColor = cssVar(style, "--text-secondary", "#5f6368");
    var lineColor = cssVar(style, "--text-link", "#1a73e8");
    var textColor = cssVar(style, "--text-secondary", "#5f6368");
    var bgColor = cssVar(style, "--bg-light", "#f8fafd");
    var pointColor = cssVar(style, "--primary", lineColor);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    var xMin = state.xMin !== undefined ? state.xMin : -10;
    var xMax = state.xMax !== undefined ? state.xMax : 10;
    var samples = Math.max(width, 320);
    var points = [];
    var finiteY = [];

    for (var i = 0; i < samples; i += 1) {
      var x = xMin + (i / (samples - 1)) * (xMax - xMin);
      var y = NaN;
      try {
        y = evaluateParsed(analysis, state, x);
      } catch (error) {
        y = NaN;
      }
      var finite = Number.isFinite(y) && Math.abs(y) < 1e6;
      points.push({ x: x, y: y, finite: finite });
      if (finite) finiteY.push(y);
    }

    if (finiteY.length < 2) {
      drawCenteredText(ctx, width, height, "No finite values", textColor);
      return;
    }

    if (state.yNeedsAutoFit || state.yMin === undefined || state.yMax === undefined) {
      var autoBounds = computeAutoYBounds(finiteY);
      state.yMin = autoBounds.yMin;
      state.yMax = autoBounds.yMax;
      state.yNeedsAutoFit = false;
    }

    var yMin = state.yMin;
    var yMax = state.yMax;

    function sx(x) {
      return ((x - xMin) / (xMax - xMin)) * width;
    }

    function sy(y) {
      return height - ((y - yMin) / (yMax - yMin)) * height;
    }

    drawGrid(ctx, width, height, xMin, xMax, yMin, yMax, sx, sy, gridColor, axisColor);
    drawLabels(ctx, width, height, xMin, xMax, yMin, yMax, sx, sy, textColor);

    var featurePoints = getGraphFeatures(points, analysis, state, xMin, xMax, yMin, yMax);

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    var drawing = false;
    var previousY = null;
    var breakDelta = (yMax - yMin) * 0.7;

    points.forEach(function (point) {
      if (!point.finite) {
        drawing = false;
        previousY = null;
        return;
      }

      var px = sx(point.x);
      var py = sy(point.y);
      if (!drawing || (previousY !== null && Math.abs(point.y - previousY) > breakDelta)) {
        ctx.moveTo(px, py);
        drawing = true;
      } else {
        ctx.lineTo(px, py);
      }
      previousY = point.y;
    });

    ctx.stroke();

    drawFeatureMarkers(ctx, featurePoints, sx, sy, pointColor);

    if (state.hoverX !== null && state.hoverX >= xMin && state.hoverX <= xMax) {
      var hoverPoint = getHoverPoint(state, analysis, featurePoints, xMin, xMax, sx);
      var hoverY = hoverPoint ? hoverPoint.y : NaN;

      if (Number.isFinite(hoverY) && hoverY >= yMin && hoverY <= yMax) {
        var hpx = sx(hoverPoint.x);
        var hpy = sy(hoverY);

        ctx.beginPath();
        ctx.strokeStyle = axisColor;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.moveTo(0, hpy);
        ctx.lineTo(width, hpy);

        ctx.moveTo(hpx, 0);
        ctx.lineTo(hpx, height);

        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(hpx, hpy, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hpx, hpy, 3, 0, 2 * Math.PI);
        ctx.fillStyle = lineColor;
        ctx.fill();

        var tooltipText =
          (hoverPoint.label ? hoverPoint.label + " " : "") +
          "(" +
          formatLabel(hoverPoint.x) +
          ", " +
          formatLabel(hoverY) +
          ")";
        ctx.font = "10px system-ui, -apple-system, sans-serif";
        var textWidth = ctx.measureText(tooltipText).width;
        var padX = 6;
        var bw = textWidth + padX * 2;
        var bh = 18;

        var tx = hpx - bw / 2;
        var ty = hpy - 12 - bh;

        if (ty < 5) ty = hpy + 12;
        if (tx < 5) tx = 5;
        if (tx + bw > width - 5) tx = width - bw - 5;

        ctx.fillStyle = "rgba(60, 64, 67, 0.9)";
        drawRoundedRect(ctx, tx, ty, bw, bh, 4);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(tooltipText, tx + padX, ty + bh / 2);
      }
    }
  }

  function getHoverPoint(state, analysis, featurePoints, xMin, xMax, sx) {
    var snapped = null;
    var snapDistance = 14;
    if (Number.isFinite(state.hoverPx)) {
      featurePoints.forEach(function (point) {
        var distance = Math.abs(sx(point.x) - state.hoverPx);
        if (distance <= snapDistance && (!snapped || distance < snapped.distance)) {
          snapped = { point: point, distance: distance };
        }
      });
    }

    if (snapped) {
      return snapped.point;
    }

    var hoverY = NaN;
    try {
      hoverY = evaluateParsed(analysis, state, state.hoverX);
    } catch (e) {
      hoverY = NaN;
    }
    return { x: state.hoverX, y: hoverY, label: "" };
  }

  function drawFeatureMarkers(ctx, featurePoints, sx, sy, color) {
    ctx.save();
    featurePoints.forEach(function (point) {
      var px = sx(point.x);
      var py = sy(point.y);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = point.type === "inflection" ? 0.55 : 0.8;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    });
    ctx.restore();
  }

  function getGraphFeatures(points, analysis, state, xMin, xMax, yMin, yMax) {
    var features = [];
    var xRange = xMax - xMin;
    var yRange = yMax - yMin;
    var yEpsilon = Math.max(yRange * 1e-6, 1e-8);
    var jumpLimit = yRange * 0.7;

    function addFeature(type, label, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < xMin || x > xMax || y < yMin || y > yMax) return;
      for (var i = 0; i < features.length; i += 1) {
        if (
          Math.abs(features[i].x - x) < xRange * 0.002 &&
          Math.abs(features[i].y - y) < yRange * 0.002
        ) {
          if (priorityForFeature(type) < priorityForFeature(features[i].type)) {
            features[i] = { type: type, label: label, x: x, y: y };
          }
          return;
        }
      }
      features.push({ type: type, label: label, x: x, y: y });
    }

    for (var i = 1; i < points.length; i += 1) {
      var prev = points[i - 1];
      var point = points[i];
      if (!prev.finite || !point.finite) continue;
      if (Math.abs(prev.y) <= yEpsilon) {
        addFeature("x-intercept", "x-intercept", prev.x, 0);
      }
      if (prev.y === 0 || point.y === 0 || prev.y * point.y < 0) {
        var root = refineRoot(analysis, state, prev.x, point.x);
        addFeature("x-intercept", "x-intercept", root.x, root.y);
      }
    }

    if (xMin <= 0 && xMax >= 0) {
      try {
        addFeature("y-intercept", "y-intercept", 0, evaluateParsed(analysis, state, 0));
      } catch (e) {}
    }

    for (var j = 1; j < points.length - 1; j += 1) {
      var a = points[j - 1];
      var b = points[j];
      var c = points[j + 1];
      if (!a.finite || !b.finite || !c.finite) continue;
      if (Math.abs(b.y - a.y) > jumpLimit || Math.abs(c.y - b.y) > jumpLimit) {
        continue;
      }
      if (b.y <= a.y && b.y <= c.y && (b.y < a.y || b.y < c.y)) {
        addFeature("minimum", "min", b.x, b.y);
      } else if (b.y >= a.y && b.y >= c.y && (b.y > a.y || b.y > c.y)) {
        addFeature("maximum", "max", b.x, b.y);
      }
    }

    var previousCurve = null;
    for (var k = 1; k < points.length - 1; k += 1) {
      var left = points[k - 1];
      var mid = points[k];
      var right = points[k + 1];
      if (!left.finite || !mid.finite || !right.finite) {
        previousCurve = null;
        continue;
      }
      if (Math.abs(mid.y - left.y) > jumpLimit || Math.abs(right.y - mid.y) > jumpLimit) {
        previousCurve = null;
        continue;
      }
      var curve = right.y - 2 * mid.y + left.y;
      if (Math.abs(curve) < yRange * 1e-5) continue;
      if (previousCurve !== null && curve * previousCurve.value < 0) {
        var inflectionX = (mid.x + previousCurve.x) / 2;
        try {
          addFeature(
            "inflection",
            "inflection",
            inflectionX,
            evaluateParsed(analysis, state, inflectionX),
          );
        } catch (error) {}
      }
      previousCurve = { value: curve, x: mid.x };
    }

    return features
      .sort(function (a, b) {
        return priorityForFeature(a.type) - priorityForFeature(b.type);
      })
      .slice(0, 48);
  }

  function priorityForFeature(type) {
    switch (type) {
      case "x-intercept":
        return 1;
      case "y-intercept":
        return 2;
      case "minimum":
      case "maximum":
        return 3;
      case "inflection":
        return 4;
      default:
        return 5;
    }
  }

  function refineRoot(analysis, state, leftX, rightX) {
    var leftY = evaluateParsed(analysis, state, leftX);
    var rightY = evaluateParsed(analysis, state, rightX);

    if (!Number.isFinite(leftY)) return { x: rightX, y: rightY };
    if (!Number.isFinite(rightY)) return { x: leftX, y: leftY };
    if (Math.abs(leftY) < 1e-12) return { x: leftX, y: 0 };
    if (Math.abs(rightY) < 1e-12) return { x: rightX, y: 0 };

    var lowX = leftX;
    var highX = rightX;
    var lowY = leftY;
    var highY = rightY;

    for (var i = 0; i < 32 && lowY * highY <= 0; i += 1) {
      var midX = (lowX + highX) / 2;
      var midY = evaluateParsed(analysis, state, midX);
      if (!Number.isFinite(midY)) break;
      if (Math.abs(midY) < 1e-10) return { x: midX, y: 0 };
      if (lowY * midY <= 0) {
        highX = midX;
        highY = midY;
      } else {
        lowX = midX;
        lowY = midY;
      }
    }

    var x = (lowX + highX) / 2;
    return { x: x, y: 0 };
  }

  function niceTickStep(span, targetCount) {
    if (!Number.isFinite(span) || span <= 0) return 1;
    var rough = span / Math.max(targetCount, 2);
    var pow = Math.pow(10, Math.floor(Math.log10(rough)));
    if (!Number.isFinite(pow) || pow === 0) return 1;
    var norm = rough / pow;
    var niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return niceNorm * pow;
  }

  function roundTick(value, step) {
    if (!Number.isFinite(value)) return value;
    var decimals = Math.max(0, -Math.floor(Math.log10(Math.abs(step))) + 1);
    return parseFloat(value.toFixed(Math.min(decimals + 2, 12)));
  }

  function buildAxisTicks(min, max, targetCount) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
    var step = niceTickStep(max - min, targetCount);
    if (step <= 0) return [];

    var ticks = [];
    var start = roundTick(Math.ceil(min / step - 1e-10) * step, step);
    var value = start;
    var guard = 0;

    while (value <= max + step * 0.01 && guard < 500) {
      if (value >= min - step * 0.01) ticks.push(value);
      value = roundTick(value + step, step);
      guard += 1;
    }

    return ticks;
  }

  function drawGrid(ctx, width, height, xMin, xMax, yMin, yMax, sx, sy, gridColor, axisColor) {
    var xTicks = buildAxisTicks(xMin, xMax, 5);
    var yTicks = buildAxisTicks(yMin, yMax, 5);

    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    xTicks.forEach(function (x) {
      if (Math.abs(x) < 1e-12) return;
      var px = sx(x);
      if (px < 0 || px > width) return;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    });

    yTicks.forEach(function (y) {
      if (Math.abs(y) < 1e-12) return;
      var py = sy(y);
      if (py < 0 || py > height) return;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    });

    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.25;

    if (xMin < 0 && xMax > 0) {
      var x0 = sx(0);
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, height);
    }

    if (yMin < 0 && yMax > 0) {
      var y0 = sy(0);
      ctx.moveTo(0, y0);
      ctx.lineTo(width, y0);
    }

    ctx.stroke();
  }

  function formatLabel(value) {
    if (Math.abs(value) < 1e-10) return "0";
    var abs = Math.abs(value);
    if (abs >= 1e4 || abs < 1e-2) {
      return value.toExponential(2).replace(/\.?0+e/, "e");
    }
    return parseFloat(value.toFixed(4)).toString();
  }

  function drawLabels(ctx, width, height, xMin, xMax, yMin, yMax, sx, sy, textColor) {
    var xTicks = buildAxisTicks(xMin, xMax, 5);
    var yTicks = buildAxisTicks(yMin, yMax, 5);

    ctx.fillStyle = textColor;
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";

    var xLabelY = height - 12;
    xTicks.forEach(function (xVal) {
      var px = sx(xVal);
      if (px < 8 || px > width - 8) return;

      ctx.textAlign = px < width * 0.1 ? "left" : px > width * 0.9 ? "right" : "center";
      ctx.fillText(formatLabel(xVal), px, xLabelY);
    });

    var yLabelX = 8;
    if (xMin < 0 && xMax > 0) {
      var xZeroPx = sx(0);
      if (xZeroPx >= 24 && xZeroPx <= width - 48) yLabelX = xZeroPx + 5;
    }

    yTicks.forEach(function (yVal) {
      var py = sy(yVal);
      if (py < 10 || py > height - 10) return;

      if (Math.abs(yVal) < 1e-10 && yLabelX <= 12) return;

      ctx.textAlign = "left";
      ctx.fillText(formatLabel(yVal), yLabelX, py);
    });
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawCenteredText(ctx, width, height, text, color) {
    ctx.fillStyle = color;
    ctx.font = "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2);
  }

  function cssVar(style, name, fallback) {
    return style.getPropertyValue(name).trim() || fallback;
  }

  function zoomRangeAroundFocus(min, max, focus, factor) {
    return {
      min: focus - (focus - min) * factor,
      max: focus + (max - focus) * factor,
    };
  }

  function applyGraphZoom(state, factor, focalX, focalY) {
    var xMin = state.xMin !== undefined ? state.xMin : -10;
    var xMax = state.xMax !== undefined ? state.xMax : 10;
    var xFocus = focalX !== undefined ? focalX : (xMax + xMin) / 2;
    var xZoom = zoomRangeAroundFocus(xMin, xMax, xFocus, factor);
    state.xMin = xZoom.min;
    state.xMax = xZoom.max;

    if (state.yMin === undefined || state.yMax === undefined) return;

    state.yNeedsAutoFit = false;
    var yMin = state.yMin;
    var yMax = state.yMax;
    var yFocus = focalY !== undefined ? focalY : (yMax + yMin) / 2;
    var yZoom = zoomRangeAroundFocus(yMin, yMax, yFocus, factor);
    state.yMin = yZoom.min;
    state.yMax = yZoom.max;
  }

  function initRoot(root) {
    if (!root || states.has(root)) return;
    var state = getState(root);

    if (!root.hasAttribute("tabindex")) {
      root.setAttribute("tabindex", "-1");
    }
    root.addEventListener(
      "pointerdown",
      function (event) {
        if (event.button !== 0) return;
        root.focus({ preventScroll: true });
      },
      { capture: true },
    );

    var canvas = root.querySelector("[data-calc-canvas]");
    if (canvas) {
      canvas.addEventListener("pointerdown", function (event) {
        if (!state.lastGraphAnalysis || event.button !== 0) return;
        canvas.setPointerCapture(event.pointerId);
        state.pointer = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          xMin: state.xMin,
          xMax: state.xMax,
          yMin: state.yMin,
          yMax: state.yMax,
        };
      });

      canvas.addEventListener("pointermove", function (event) {
        if (!state.lastGraphAnalysis) return;

        if (state.pointer && state.pointer.id === event.pointerId) {
          var dragDx = event.clientX - state.pointer.startX;
          var dragDy = event.clientY - state.pointer.startY;
          if (
            !state.pointer.dragging &&
            (Math.abs(dragDx) > 3 || Math.abs(dragDy) > 3)
          ) {
            state.pointer.dragging = true;
            state.yNeedsAutoFit = false;
            canvas.classList.add("calc-graph-canvas--dragging");
          }

          if (state.pointer.dragging) {
            var dragRect = canvas.getBoundingClientRect();
            var dragWidth = canvas.clientWidth || dragRect.width;
            var dragHeight = canvas.clientHeight || dragRect.height;
            if (dragWidth <= 0 || dragHeight <= 0) return;

            var xSpan = state.pointer.xMax - state.pointer.xMin;
            var ySpan = state.pointer.yMax - state.pointer.yMin;
            state.xMin = state.pointer.xMin - (dragDx / dragWidth) * xSpan;
            state.xMax = state.pointer.xMax - (dragDx / dragWidth) * xSpan;
            state.yMin = state.pointer.yMin + (dragDy / dragHeight) * ySpan;
            state.yMax = state.pointer.yMax + (dragDy / dragHeight) * ySpan;
            state.hoverX = null;
            state.hoverPx = null;
            drawGraph(root, state, state.lastGraphAnalysis);
            return;
          }
        }

        if (state.pointer && state.pointer.dragging) return;

        var rect = canvas.getBoundingClientRect();
        var mx = event.clientX - rect.left;
        var width = canvas.clientWidth || rect.width;
        if (width <= 0) return;
        var xMin = state.xMin !== undefined ? state.xMin : -10;
        var xMax = state.xMax !== undefined ? state.xMax : 10;
        state.hoverX = xMin + (mx / width) * (xMax - xMin);
        state.hoverPx = mx;
        drawGraph(root, state, state.lastGraphAnalysis);
      });

      function endPointerDrag(event) {
        if (!state.pointer || state.pointer.id !== event.pointerId) return;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        canvas.classList.remove("calc-graph-canvas--dragging");
        state.pointer = null;
      }

      canvas.addEventListener("pointerup", endPointerDrag);
      canvas.addEventListener("pointercancel", endPointerDrag);

      canvas.addEventListener("mouseleave", function () {
        if (state.pointer && state.pointer.dragging) return;
        if (state.hoverX !== null) {
          state.hoverX = null;
          state.hoverPx = null;
          if (state.lastGraphAnalysis) {
            drawGraph(root, state, state.lastGraphAnalysis);
          }
        }
      });
      canvas.addEventListener("wheel", function (event) {
        if (!state.lastGraphAnalysis) return;
        event.preventDefault();

        var rect = canvas.getBoundingClientRect();
        var mx = event.clientX - rect.left;
        var my = event.clientY - rect.top;
        var width = canvas.clientWidth || rect.width;
        var height = canvas.clientHeight || rect.height;
        var xMin = state.xMin !== undefined ? state.xMin : -10;
        var xMax = state.xMax !== undefined ? state.xMax : 10;
        var factor = event.deltaY < 0 ? 0.85 : 1.15;
        var focalX = xMin + (mx / width) * (xMax - xMin);
        var focalY;
        if (
          width > 0 &&
          height > 0 &&
          state.yMin !== undefined &&
          state.yMax !== undefined
        ) {
          focalY = state.yMax - (my / height) * (state.yMax - state.yMin);
        }
        applyGraphZoom(state, factor, focalX, focalY);

        if (width > 0) {
          state.hoverX = state.xMin + (mx / width) * (state.xMax - state.xMin);
          state.hoverPx = mx;
        }
        drawGraph(root, state, state.lastGraphAnalysis);
      }, { passive: false });
    }

    updateRoot(root);
  }

  function initAll() {
    ensureParser()
      .then(function () {
        document.querySelectorAll(ROOT_SELECTOR).forEach(initRoot);
      })
      .catch(function () {
        document.querySelectorAll(ROOT_SELECTOR).forEach(function (root) {
          var resultEl = root.querySelector("[data-calc-result]");
          if (resultEl) {
            resultEl.textContent = "Parser unavailable";
            resultEl.classList.add("calc-result--error");
          }
        });
      });
  }

  function handleZoom(root, action) {
    var state = getState(root);
    if (!state.lastGraphAnalysis) return;

    if (action === "reset") {
      state.xMin = -10;
      state.xMax = 10;
      state.yMin = undefined;
      state.yMax = undefined;
      state.yNeedsAutoFit = true;
    } else if (action === "in") {
      applyGraphZoom(state, 0.5);
    } else if (action === "out") {
      applyGraphZoom(state, 2.0);
    }

    drawGraph(root, state, state.lastGraphAnalysis);
  }

  document.addEventListener("click", function (event) {
    var zoomBtn = event.target.closest(ROOT_SELECTOR + " [data-calc-zoom]");
    if (zoomBtn) {
      event.preventDefault();
      var root = zoomBtn.closest(ROOT_SELECTOR);
      initRoot(root);
      var action = zoomBtn.getAttribute("data-calc-zoom");
      handleZoom(root, action);
      return;
    }

    var button = event.target.closest(ROOT_SELECTOR + " [data-calc-action]");
    if (!button) return;
    event.preventDefault();

    ensureParser().then(function () {
      var root = button.closest(ROOT_SELECTOR);
      initRoot(root);
      handleAction(root, button.getAttribute("data-calc-action"));
    });
  });

  document.addEventListener("keydown", function (event) {
    var root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    var target = event.target;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    if (!root.contains(document.activeElement) && document.activeElement !== root) {
      return;
    }

    var keyMap = {
      "0": "digit-0",
      "1": "digit-1",
      "2": "digit-2",
      "3": "digit-3",
      "4": "digit-4",
      "5": "digit-5",
      "6": "digit-6",
      "7": "digit-7",
      "8": "digit-8",
      "9": "digit-9",
      ".": "dot",
      "+": "add",
      "-": "subtract",
      "*": "multiply",
      "/": "divide",
      "%": "percent",
      "^": "power",
      "(": "open-paren",
      ")": "close-paren",
      x: "x",
      X: "x",
      Enter: "equals",
      "=": "equals",
      Escape: "clear",
      Delete: "clear",
      Backspace: "backspace",
    };

    var action = keyMap[event.key];
    if (!action) {
      // Allow typing function names (letters a-z except those already mapped)
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        ensureParser().then(function () {
          initRoot(root);
          appendToken(root, event.key.toLowerCase());
        });
      }
      return;
    }
    event.preventDefault();
    ensureParser().then(function () {
      initRoot(root);
      handleAction(root, action);
    });
  });

  window.addEventListener("resize", function () {
    if (redrawTimer) window.cancelAnimationFrame(redrawTimer);
    redrawTimer = window.requestAnimationFrame(function () {
      redrawTimer = 0;
      document.querySelectorAll(ROOT_SELECTOR).forEach(function (root) {
        var state = states.get(root);
        if (state && state.lastGraphAnalysis) {
          drawGraph(root, state, state.lastGraphAnalysis);
        }
      });
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  if (window.MutationObserver) {
    var observer = new MutationObserver(initAll);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
