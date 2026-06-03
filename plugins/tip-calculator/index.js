let template = "";
let enabled = true;
let defaultTipPercent = 15;

const settingsSchema = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    default: true,
    description: "Show the tip calculator card for matching queries.",
  },
  {
    key: "defaultTipPercent",
    label: "Default Tip Percentage",
    type: "select",
    options: ["10", "15", "18", "20", "25"],
    default: "15",
    description: "Default tip percentage to use if not specified in search query.",
  }
];

const TriggerGuard = {
  // Checks if a query looks like physical unit conversion (e.g. "5m to km")
  isUnitConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const UNIT_CONV_RE = /^-?[\d][\d\s.,]*\s*\S.*?\b(?:to|into)\s+[a-z0-9°µ]{1,8}\s*$/i;
      return UNIT_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query looks like currency conversion (e.g. "100 usd to eur")
  isCurrencyConversion(q, lower) {
    const TRANSLATE_KEYWORDS = /\b(translate|translation|say|говорить|mean|meaning)\b/i;
    if (!TRANSLATE_KEYWORDS.test(lower)) {
      const CURRENCY_CONV_RE = /^-?[\d][\d\s.,]*\s*[a-z]{3}\s+\b(?:to|into|in|=)\s+[a-z]{3}\s*$/i;
      return CURRENCY_CONV_RE.test(q.trim());
    }
    return false;
  },

  // Checks if a query is language translation
  isTranslation(q, lower) {
    return /\b(translate|translation|say|говорить|mean|meaning)\b/i.test(q) ||
           /how (do|would|can) you say\b/i.test(q);
  },

  // Checks if a query is a general non-financial tips article/advice (e.g. "gardening tips")
  isTipAdvice(q) {
    return /\b(tips?\s+(?:to|on\s+how|on|for|about|with|and|from|in)|(?:gardening|coding|interview|study|writing|clean|life|health|safety|cooking|travel|career|business)\s+tips?)\b/i.test(q);
  },

  // Checks if a query is a dice roll (e.g. "roll a 20 sided die", "d20")
  isDiceRoll(q) {
    return (
      /roll\s+(?:a\s+)?(?:die|dice)\b/i.test(q) ||
      /\bdice\s+roll\b/i.test(q) ||
      /\bdie\s+roll\b/i.test(q) ||
      /roll\s+d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?d\d+\b/i.test(q) ||
      /roll\s+(?:a\s+)?\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q) ||
      /\b(d6|d20|d8|d10|d12|d100)\b/i.test(q) ||
      /\b\d+\s*-?\s*sided\s+(?:die|dice)\b/i.test(q)
    );
  },

  // Checks if a query specifically targets a 20-sided die
  isD20Dice(q) {
    return /\bd20\b/i.test(q) || /\b20\s*-?\s*sided\b/i.test(q);
  },

  // Checks if a query is a utility tool (calculator, weather, timer, stocks, etc.)
  isUtility(q) {
    return /\b(weather|forecast|погода|метео|temperature|humidity|wind|rain|snow|translate|translation|convert|currency|calculator|calculate|math|stopwatch|timer|countdown|coinflip|coin-flip|yesno|yes-no|tip|tips|gratuity|gratuities|stocks?)\b/i.test(q);
  }
};

function parseTipQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  // Basic keyword check
  const hasTipKeyword = /\b(tips?|gratuity|gratuities)\b/i.test(q);
  if (!hasTipKeyword) return null;

  // Filter out tips listicles/articles/advice e.g., "tips to write clean code", "tips for studying", "gardening tips"
  if (TriggerGuard.isTipAdvice(q)) {
    return null;
  }

  const explicitCalcKeywords = /\b(calculator|calculate|calc|compute)\b/i.test(q);
  const hasDigits = /\d/.test(q);
  
  if (!explicitCalcKeywords && !hasDigits) {
    // Only trigger on very specific simple phrases like "tip calculator", "calculate tip"
    const simpleTipCalculatorRx = /^(?:please\s+)?(?:(?:open|show|run|start)\s+)?(?:a\s+)?(?:tip|gratuity)\s*(?:calculator|calc)?(?:\s+please)?[.!?]*$/i;
    if (!simpleTipCalculatorRx.test(q)) {
      return null;
    }
  }

  let split = 1;
  // Patterns like "split by 3", "split with 4", "split 5", "3 way split"
  const splitMatch = q.match(/\bsplit\s*(?:by|with|for|among)?\s*(\d+)/i) || 
                     q.match(/(\d+)\s*(?:ways?|people|persons|split)/i);
  if (splitMatch) {
    split = parseInt(splitMatch[1], 10);
  }

  let tipPercent = null;
  // Match percentage (e.g. 20%, 20 percent)
  const percentMatch = q.match(/(\d+(?:\.\d+)?)\s*%/i) || 
                       q.match(/(\d+(?:\.\d+)?)\s*(?:percent|pct)\b/i);
  if (percentMatch) {
    tipPercent = parseFloat(percentMatch[1]);
  } else {
    // Look for numbers near keywords "tip" or "gratuity", e.g., "tip 20 on 80" -> tip is 20, bill is 80
    const tipNearNumberMatch = q.match(/\b(?:tips?|gratuity|gratuities)\s+(\d+(?:\.\d+)?)\b/i) ||
                               q.match(/\b(\d+(?:\.\d+)?)\s+(?:tips?|gratuity|gratuities)\b/i);
    if (tipNearNumberMatch) {
      tipPercent = parseFloat(tipNearNumberMatch[1]);
    }
  }

  let bill = null;
  // Look for explicit dollar amount first, e.g. $85.50
  const dollarMatch = q.match(/\$\s*(\d+(?:\.\d+)?)/i);
  if (dollarMatch) {
    bill = parseFloat(dollarMatch[1]);
  }

  // If bill not set, let's extract all numbers from the query and identify which one is the bill
  if (bill === null) {
    const numbers = [];
    const numRegex = /\d+(?:\.\d+)?/g;
    let m;
    while ((m = numRegex.exec(q)) !== null) {
      const val = parseFloat(m[0]);
      const index = m.index;
      
      // Ignore if it's followed by % or percent or pct
      const postStr = q.substring(index + m[0].length).trim();
      if (/^(%|percent|pct)\b/i.test(postStr)) {
        continue;
      }
      
      // Ignore if it's preceded by split
      const preStr = q.substring(0, index).trim();
      if (/(split|split\s+by|split\s+with|split\s+for|split\s+among)$/i.test(preStr)) {
        continue;
      }

      numbers.push({ val, index });
    }

    // Check if any number is preceded by "on", "for", "of", "at" -> usually means the bill amount
    let billCandidate = null;
    for (const item of numbers) {
      const preStr = q.substring(0, item.index).trim();
      if (/(?:on|for|of|at)$/i.test(preStr)) {
        billCandidate = item.val;
        break;
      }
    }

    if (billCandidate !== null) {
      bill = billCandidate;
    } else if (numbers.length > 0) {
      // Filter out numbers that represent split
      const remainingNumbers = numbers.filter(item => {
        if (splitMatch && item.val === split) {
          return false;
        }
        return true;
      });

      if (remainingNumbers.length === 1) {
        bill = remainingNumbers[0].val;
      } else if (remainingNumbers.length >= 2) {
        if (tipPercent !== null) {
          // Tip is known, the other is the bill
          const notTip = remainingNumbers.find(item => item.val !== tipPercent);
          bill = notTip ? notTip.val : remainingNumbers[0].val;
        } else {
          // Neither is known. Assume smaller is tip and larger is bill (typical)
          const n1 = remainingNumbers[0].val;
          const n2 = remainingNumbers[1].val;
          if (n1 <= 100 && n2 > 100) {
            tipPercent = n1;
            bill = n2;
          } else if (n2 <= 100 && n1 > 100) {
            tipPercent = n2;
            bill = n1;
          } else {
            // Default first is tip, second is bill
            tipPercent = n1;
            bill = n2;
          }
        }
      }
    }
  }

  // Normalize/clamp values
  if (bill !== null && (isNaN(bill) || bill <= 0)) {
    bill = null;
  }
  if (tipPercent !== null && (isNaN(tipPercent) || tipPercent < 0)) {
    tipPercent = null;
  }
  if (split !== null && (isNaN(split) || split <= 0)) {
    split = 1;
  }

  return {
    bill,
    tipPercent,
    split
  };
}

function configureSettings(settings) {
  enabled = settings?.enabled !== false && settings?.enabled !== "false";
  defaultTipPercent = parseInt(settings?.defaultTipPercent || "15", 10);
  if (isNaN(defaultTipPercent) || defaultTipPercent < 0) {
    defaultTipPercent = 15;
  }
}

function renderTemplate(billVal, tipPercentVal, splitVal, context) {
  return (template || "")
    .replaceAll("{{bill}}", String(billVal))
    .replaceAll("{{tip_percent}}", String(tipPercentVal))
    .replaceAll("{{split}}", String(splitVal));
}

export const slot = {
  id: "tip-calculator",
  name: "Tip Calculator",
  description:
    "Interactive tip calculator with real-time bill split, custom slider parameters, and animations.",
  isClientExposed: false,
  position: "above-results",
  slotPositions: ["above-results", "knowledge-panel"],
  settingsSchema,

  async init(ctx) {
    template = ctx?.template || "";
    if (!template && typeof ctx?.readFile === "function") {
      template = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    configureSettings(settings);
  },

  trigger(query) {
    if (!enabled) return false;
    return Boolean(parseTipQuery(query));
  },

  async execute(query, context) {
    if (context?.tab && context.tab !== "all") return { title: "", html: "" };
    const request = parseTipQuery(query);
    if (!request) return { title: "", html: "" };

    const billVal = request.bill !== null ? request.bill.toFixed(2) : "50.00";
    const tipVal = request.tipPercent !== null ? request.tipPercent : defaultTipPercent;
    const splitVal = request.split !== null ? request.split : 1;

    return {
      title: "",
      html: renderTemplate(billVal, tipVal, splitVal, context),
    };
  },
};

export const slotPlugin = slot;
export default slot;
