import exprEvalModule from "./vendor/expr-eval.min.cjs";
import { splitGraphExpressions } from "./graph-engine.mjs";

const exprEval = exprEvalModule?.Parser
  ? exprEvalModule
  : exprEvalModule?.default || {};
const Parser = exprEval.Parser;

let calcEnabled = true;
let templateHtml = "";
let parserBundle = "";
let graphEngineBundle = "";

const DEFAULT_ANGLE_MODE = "rad";
const MAX_QUERY_LENGTH = 220;
const MATH_FUNCTIONS =
  "sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|log|ln|abs|exp|floor|ceil|round|sign|min|max|factorial";
const MATH_FUNCTION_SET = new Set(MATH_FUNCTIONS.split("|"));
const FUNCTION_CALL_RE = new RegExp(`\\b(?:${MATH_FUNCTIONS})\\s*\\(`, "i");
const EXPLICIT_CALC_RE =
  /^(?:calc|calculator|calculate|compute)\b\s*(?::|=)?\s*(.*)$/i;
const EXPLICIT_GRAPH_RE = /^(?:graph|plot)\b\s*(?::|=)?\s*(.+)$/i;
const DATE_LIKE_RE = /^\d{1,4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,4}$/;
const SAFE_CHARS_RE = /^[0-9a-zA-Z_\s,+\-*/^().!%]+$/;
const ALLOWED_SYMBOLS = new Set(["x", "pi", "e", "ans", "factorial"]);

const PARSER_OPTIONS = {
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

const FALLBACK_TEMPLATE = `
<div class="calc-card" data-calc-root data-initial="{{initial_expr}}" data-result="{{initial_result}}" data-ans="{{ans_value}}" data-angle-mode="${DEFAULT_ANGLE_MODE}" data-graph-mode="{{graph_mode}}">
  <div class="calc-display">
    <input class="calc-expression" data-calc-expression value="{{display_expr}}" aria-label="Expression">
    <div class="calc-result" data-calc-result>{{display_result}}</div>
  </div>
</div>`;

function factorial(value) {
  if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    return NaN;
  }
  if (value > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= value; i += 1) result *= i;
  return result;
}

function createParser(angleMode = DEFAULT_ANGLE_MODE) {
  if (!Parser) throw new Error("Calculator parser is unavailable");

  const parser = new Parser(PARSER_OPTIONS);
  const toInputAngle =
    angleMode === "deg" ? (value) => (value * Math.PI) / 180 : (value) => value;
  const fromOutputAngle =
    angleMode === "deg" ? (value) => (value * 180) / Math.PI : (value) => value;

  parser.unaryOps.sin = (value) => Math.sin(toInputAngle(value));
  parser.unaryOps.cos = (value) => Math.cos(toInputAngle(value));
  parser.unaryOps.tan = (value) => Math.tan(toInputAngle(value));
  parser.unaryOps.asin = (value) => fromOutputAngle(Math.asin(value));
  parser.unaryOps.acos = (value) => fromOutputAngle(Math.acos(value));
  parser.unaryOps.atan = (value) => fromOutputAngle(Math.atan(value));
  parser.unaryOps.sinh = Math.sinh;
  parser.unaryOps.cosh = Math.cosh;
  parser.unaryOps.tanh = Math.tanh;
  parser.unaryOps.sqrt = Math.sqrt;
  parser.unaryOps.log = Math.log10;
  parser.unaryOps.ln = Math.log;
  parser.unaryOps.abs = Math.abs;
  parser.unaryOps.exp = Math.exp;
  parser.unaryOps.floor = Math.floor;
  parser.unaryOps.ceil = Math.ceil;
  parser.unaryOps.round = Math.round;
  parser.unaryOps.sign = Math.sign;
  parser.functions.min = Math.min;
  parser.functions.max = Math.max;
  parser.functions.factorial = factorial;

  return parser;
}

function normalizeExpression(input) {
  let expr = String(input || "").trim();

  expr = stripEquationPrefix(expr);
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
    new RegExp(`\\b(?:${MATH_FUNCTIONS})\\b`, "gi"),
    (match) => match.toLowerCase(),
  );
  expr = expr.replace(
    /(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\b(?:x|pi|e|ans)\b|\))\s*%/gi,
    "$1/100",
  );

  expr = expr.replace(
    new RegExp(
      `(\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)(?=(?:x|pi|ans|e(?![0-9])|${MATH_FUNCTIONS}\\s*\\())`,
      "gi",
    ),
    "$1*",
  );
  const leftToken =
    "((?:\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)|\\)|!|\\b(?:x|pi|e|ans)\\b)";
  const rightToken = `(?=(?:\\b(?:x|pi|e|ans)\\b|\\b(?:${MATH_FUNCTIONS})\\s*\\(|\\())`;
  expr = expr.replace(new RegExp(`${leftToken}\\s*${rightToken}`, "gi"), "$1*");

  return expr.replace(/\s+/g, " ").trim();
}

function stripEquationPrefix(expr) {
  return String(expr || "")
    .trim()
    .replace(/^y\s*=\s*/i, "")
    .replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "");
}

function getIntent(query) {
  const q = String(query || "").trim();
  const calcMatch = q.match(EXPLICIT_CALC_RE);
  if (calcMatch) {
    return { expression: calcMatch[1], explicit: true, graph: false };
  }

  const graphMatch = q.match(EXPLICIT_GRAPH_RE);
  if (graphMatch) {
    return { expression: graphMatch[1], explicit: true, graph: true };
  }

  if (/^(?:y|f\s*\(\s*x\s*\))\s*=/i.test(q)) {
    return { expression: q, explicit: false, graph: true };
  }

  return { expression: q, explicit: false, graph: false };
}

function analyzeExpression(input, angleMode = DEFAULT_ANGLE_MODE) {
  const normalized = normalizeExpression(input);
  if (!normalized || !SAFE_CHARS_RE.test(normalized)) {
    throw new Error("Expression contains unsupported characters");
  }

  const parser = createParser(angleMode);
  const parsed = parser.parse(normalized);
  const symbols =
    typeof parsed.symbols === "function" ? parsed.symbols() : parsed.variables();
  const normalizedSymbols = symbols.map((symbol) => String(symbol).toLowerCase());
  const unknown = normalizedSymbols.filter(
    (symbol) => !ALLOWED_SYMBOLS.has(symbol),
  );

  if (unknown.length) {
    throw new Error(`Unsupported symbol: ${unknown[0]}`);
  }

  return {
    normalized,
    parsed,
    symbols: normalizedSymbols,
    hasX: normalizedSymbols.includes("x"),
  };
}

function getUnknownIdentifiers(normalized) {
  const withoutNumbers = normalized.replace(
    /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
    " ",
  );
  const identifiers = withoutNumbers.match(/[a-zA-Z_]+/g) || [];
  return identifiers
    .map((identifier) => identifier.toLowerCase())
    .filter(
      (identifier) =>
        !ALLOWED_SYMBOLS.has(identifier) && !MATH_FUNCTION_SET.has(identifier),
    );
}

function getParenState(expr) {
  const stack = [];
  for (let index = 0; index < expr.length; index += 1) {
    const char = expr[index];
    if (char === "(") stack.push(index);
    if (char === ")") {
      if (!stack.length) return { invalidClose: true, openIndexes: [] };
      stack.pop();
    }
  }

  return { invalidClose: false, openIndexes: stack };
}

function isIncompleteExpression(input) {
  const normalized = normalizeExpression(input);
  if (!normalized || !SAFE_CHARS_RE.test(normalized)) return false;
  if (getUnknownIdentifiers(normalized).length) return false;

  const compact = normalized.replace(/\s+/g, "");
  const parens = getParenState(compact);
  if (parens.invalidClose) return false;

  if (/[+\-*/^.]$/.test(compact)) return true;
  if (/\($/.test(compact)) return true;
  if (parens.openIndexes.length > 0) return true;
  if (new RegExp(`(?:^|[^a-zA-Z_])(?:${MATH_FUNCTIONS})$`, "i").test(compact)) {
    return true;
  }

  return false;
}

function trimIncompleteSuffix(expr) {
  let candidate = normalizeExpression(expr);

  for (let guard = 0; guard < 20 && candidate; guard += 1) {
    const before = candidate;
    candidate = candidate.trim();
    candidate = candidate.replace(/[+\-*/^.(]+$/g, "").trim();
    candidate = candidate
      .replace(new RegExp(`(?:^|[+\\-*/^(])\\s*(?:${MATH_FUNCTIONS})$`, "i"), "")
      .trim();

    const parens = getParenState(candidate);
    if (parens.invalidClose) return "";
    if (parens.openIndexes.length) {
      candidate = candidate
        .slice(0, parens.openIndexes[parens.openIndexes.length - 1])
        .trim();
      continue;
    }

    if (candidate === before) break;
  }

  return candidate;
}

function getIncompletePreview(input) {
  const candidate = trimIncompleteSuffix(input);
  if (!candidate) return null;

  try {
    const evaluated = evaluateExpression(candidate);
    return {
      result: formatResult(evaluated.value),
      ans: Number.isFinite(evaluated.value) ? evaluated.value : 0,
    };
  } catch {
    return null;
  }
}

function evaluateExpression(input, options = {}) {
  const analysis = analyzeExpression(input, options.angleMode);
  if (analysis.hasX && typeof options.x !== "number") {
    throw new Error("Expression requires x");
  }

  const variables = {
    pi: Math.PI,
    e: Math.E,
    ans: Number.isFinite(options.ans) ? options.ans : 0,
  };

  if (typeof options.x === "number") variables.x = options.x;

  const value = analysis.parsed.evaluate(variables);
  return { ...analysis, value };
}

function isObviousExpression(rawExpression, analysis) {
  const original = String(rawExpression || "").trim();
  const normalized = analysis.normalized;

  if (DATE_LIKE_RE.test(original)) return false;
  if (FUNCTION_CALL_RE.test(original)) return true;
  if (analysis.hasX) {
    return /(?:^|[^a-z])x(?:[^a-z]|$)/i.test(original) &&
      /[+\-*/^()]|\d\s*x|x\s*\^/i.test(normalized);
  }

  return /(?:\d|\bpi\b|\be\b|\bans\b|\)|!)\s*(?:[+\-*/^]|\!)|(?:[+\-*/^])\s*(?:\d|\(|\bpi\b|\be\b|\bans\b)/i.test(
    normalized,
  );
}

function shouldTrigger(query) {
  const q = String(query || "").trim();
  if (!q || q.length > MAX_QUERY_LENGTH) return false;

  const intent = getIntent(q);
  if (!intent.expression.trim()) return intent.explicit && /^(?:calc|calculator)$/i.test(q);

  try {
    const graphSeries = splitGraphExpressions(intent.expression);
    if (intent.graph || graphSeries.length > 1) {
      const analyses = graphSeries.map(({ expression }) =>
        analyzeExpression(expression),
      );
      if (intent.explicit || intent.graph) return analyses.length > 0;
      return analyses.every((analysis, index) =>
        isObviousExpression(graphSeries[index].expression, analysis),
      );
    }
    const analysis = analyzeExpression(intent.expression);
    if (intent.explicit || intent.graph) return true;
    return isObviousExpression(intent.expression, analysis);
  } catch {
    return intent.explicit && isIncompleteExpression(intent.expression);
  }
}

function formatResult(value) {
  if (typeof value !== "number") return String(value);
  if (Number.isNaN(value)) return "Not a number";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";

  const cleaned = Object.is(value, -0) || Math.abs(value) < 1e-14 ? 0 : value;
  const abs = Math.abs(cleaned);

  if (abs !== 0 && (abs >= 1e12 || abs < 1e-8)) {
    return cleaned.toExponential(8).replace(/\.?0+e/, "e");
  }

  return Number(cleaned.toPrecision(12)).toLocaleString("en-US", {
    maximumFractionDigits: 10,
  });
}

function renderTemplate(values) {
  let html = templateHtml || FALLBACK_TEMPLATE;
  Object.entries(values).forEach(([key, value]) => {
    html = html.split(`{{${key}}}`).join(_escAttr(value));
  });
  return html;
}

export const routes = [
  {
    path: "parser",
    method: "get",
    handler: async () =>
      new Response(parserBundle, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=604800",
        },
      }),
  },
  {
    path: "graph-engine",
    method: "get",
    handler: async () =>
      new Response(graphEngineBundle, {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=604800",
        },
      }),
  },
];

export const slot = {
  id: "calculator",
  name: "Calculator",
  description:
    "Scientific calculator with keyboard input and interactive multi-function graphing.",
  isClientExposed: false,
  position: "knowledge-panel",
  slotPositions: ["knowledge-panel", "above-results"],
  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      default: "true",
    },
  ],

  async init(ctx) {
    if (ctx?.readFile) {
      templateHtml = await ctx.readFile("template.html");
      parserBundle = await ctx.readFile("vendor/expr-eval.min.cjs");
      graphEngineBundle = await ctx.readFile("graph-engine.mjs");
    } else {
      templateHtml = ctx?.template || templateHtml;
    }
  },

  configure(settings) {
    calcEnabled = settings?.enabled !== false && settings?.enabled !== "false";
  },

  trigger(query) {
    return calcEnabled && shouldTrigger(query);
  },

  async execute(query, context) {
    const intent = getIntent(query);
    const expression = stripEquationPrefix(intent.expression).trim();

    if (!expression) {
      const html = renderTemplate({
        initial_expr: "",
        display_expr: "",
        initial_result: "0",
        display_result: "0",
        ans_value: "0",
        angle_mode: DEFAULT_ANGLE_MODE,
        graph_mode: "false",
      }, context);

      return { title: "", html };
    }

    try {
      const graphSeries = splitGraphExpressions(intent.expression);
      const analyses = graphSeries.map(({ expression: graphExpression }) =>
        analyzeExpression(graphExpression),
      );
      const graphMode =
        intent.graph ||
        analyses.length > 1 ||
        analyses.some((candidate) => candidate.hasX);
      let result = "";
      let ans = 0;

      if (!graphMode) {
        const evaluated = evaluateExpression(graphSeries[0]?.expression || intent.expression);
        result = formatResult(evaluated.value);
        ans = Number.isFinite(evaluated.value) ? evaluated.value : 0;
      }

      const html = renderTemplate({
        initial_expr: expression,
        display_expr: expression,
        initial_result: result,
        display_result: result,
        ans_value: String(ans),
        angle_mode: DEFAULT_ANGLE_MODE,
        graph_mode: graphMode ? "true" : "false",
      }, context);

      return { title: "", html };
    } catch (error) {
      if (isIncompleteExpression(intent.expression)) {
        const preview = getIncompletePreview(intent.expression);
        const html = renderTemplate({
          initial_expr: expression,
          display_expr: expression,
          initial_result: preview?.result || "0",
          display_result: preview?.result || "0",
          ans_value: String(preview?.ans || 0),
          angle_mode: DEFAULT_ANGLE_MODE,
          graph_mode: "false",
        }, context);

        return { title: "", html };
      }

      return { html: "" };
    }
  },
};

export const slotPlugin = slot;
export default slot;

function _escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
