/**
 * Parse natural-language tip calculator queries.
 * Handles varied ordering: "120$ 20% tip split 8 ways", "20% tip on 120", etc.
 */

const ADVICE_TOPIC_RX =
  /\b(?:gardening|coding|interview|study|writing|clean|life|health|safety|cooking|travel|career|business)\s+tips?\b/i;

const BILL_CONTEXT_RX =
  /\b(?:bill|check|tab|total|meal|food|order|amount|cost|price|pay|spend|spent|owe|owed)\b\s*$/i;

const TIP_CALCULATOR_RX =
  /^(?:please\s+)?(?:(?:open|show|run|start)\s+)?(?:a\s+)?(?:tip|gratuity)\s*(?:calculator|calc)?(?:\s+please)?[.!?]*$/i;

const EXPLICIT_TIP_CALC_RX =
  /\b(?:tip|gratuity|gratuities|split|bill)\s*(?:calculator|calculate|calc|compute|computation)\b|\b(?:calculator|calculate|calc|compute)\s*(?:tip|gratuity|gratuities|split|bill)\b/i;
const NON_TIP_PERCENT_CONTEXT_RX =
  /\b(?:apr|commission|discount|interest|markup|off|probability|sale|tax)\b/i;
// "20% of 150" and "100 - 10%" are percentage calculations, not tips.
const PERCENT_OF_RX = /\d\s*(?:%|percent\b|pct\b)\s*of\b/i;
const ARITHMETIC_RX = /^[\d\s.,$%()+\-*/\u00d7\u00f7^=]+$/;
const INFIX_OPERATOR_RX = /[\d%)]\s*[+\-*/\u00d7\u00f7^]\s*[\d($.]/;

function isPercentCalculation(q) {
  return PERCENT_OF_RX.test(q) || (ARITHMETIC_RX.test(q) && INFIX_OPERATOR_RX.test(q));
}

function isTipAdviceArticle(q) {
  if (/\b(?:tips?\s+on\s+[\d$]|[\d$]\d.*\b(?:tips?|gratuity)\b)/i.test(q)) return false;
  if (/\b(?:tips?\s+(?:to|on\s+how|for|about|with|and|from|in))\b/i.test(q)) return true;
  return ADVICE_TOPIC_RX.test(q);
}

function hasTipIntent(q) {
  return (
    /\b(?:tips?|gratuity|gratuities)\b/i.test(q) ||
    EXPLICIT_TIP_CALC_RX.test(q) ||
    /\d\s*(?:%|percent\b|pct\b)/i.test(q) ||
    (/\bsplit\b/i.test(q) && (/\d/.test(q) || /\b(?:bill|check|tab|total|meal)\b/i.test(q)))
  );
}

function isReasonableSplit(n) {
  return Number.isInteger(n) && n >= 1 && n <= 50;
}

// Extractors return { value, start } so later steps skip the exact token they
// consumed. Matching by value dropped a bill that happened to equal the tip
// or split ("$20 bill 20% tip").
function extractSplit(q) {
  const patterns = [
    /\b(\d+)\s*(?:-?\s*)?ways?\s+split\b/di,
    /\b(\d+)\s*(?:people|persons|pax)\b/di,
    /\b(\d+)\s*ways?\b/di,
    /\b(?:among|between|divide(?:d)?(?:\s+by)?)\s+(\d+)(?:\s*(?:ways?|people|persons|pax))?\b/di,
    /\bsplit\s+(?:the\s+)?(?:bill\s+)?(?:by|among|between|with|for|in)?\s*(\d+)(?:\s*(?:ways?|people|persons|pax))?\b/di,
    /\b(\d+)\s*way\s+split\b/di,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      const split = parseInt(match[1], 10);
      if (isReasonableSplit(split)) return { value: split, start: match.indices[1][0] };
    }
  }

  return { value: 1, start: -1 };
}

function extractTipPercent(q, split) {
  const candidates = [
    [/(\d+(?:\.\d+)?)\s*(?:%|percent\b|pct\b)/di, Infinity],
    [/\b(?:tip|gratuity|gratuities)\s+(?:of\s+)?(\d+(?:\.\d+)?)\b/di, 100],
    [/\b(\d+(?:\.\d+)?)\s+(?:tip|gratuity|gratuities)\b/di, 100],
  ];

  for (const [pattern, max] of candidates) {
    const match = q.match(pattern);
    if (!match) continue;
    const tip = parseFloat(match[1]);
    const start = match.indices[1][0];
    if (!Number.isNaN(tip) && tip >= 0 && tip <= max && start !== split.start) {
      return { value: tip, start };
    }
  }

  return null;
}

function collectNumberTokens(q) {
  const tokens = [];
  const numRe = /\d+(?:\.\d+)?/g;
  let match;

  while ((match = numRe.exec(q)) !== null) {
    const val = parseFloat(match[0]);
    const start = match.index;
    const end = start + match[0].length;
    const before = q.slice(0, start);
    const after = q.slice(end);

    const isPercent = /^\s*(?:%|percent\b|pct\b)/i.test(after) || /^\s*%/.test(after);
    const hasLeadingDollar = /(?:^|[\s(])\$\s*$/.test(before) || /\$\s*$/.test(before);
    const hasTrailingDollar = /^\s*\$/.test(after);
    const preTrim = before.trim();
    const preWords = preTrim.split(/\s+/);
    const lastWord = preWords[preWords.length - 1] || "";

    const isSplitContext =
      isReasonableSplit(val) &&
      (
        /^(?:split|among|between|divide|divided)$/i.test(lastWord) ||
        /\b(?:split|among|between)\s+(?:the\s+)?(?:bill\s+)?$/i.test(preTrim.slice(-32))
      );

    const isBillContext =
      BILL_CONTEXT_RX.test(preTrim) ||
      /^(?:on|for|of|at|was|is)$/i.test(lastWord) ||
      /\b(?:on|for|of|at)\s*$/.test(preTrim.slice(-16)) ||
      /^\s*(?:bill|check|tab|total|meal)\b/i.test(after);

    tokens.push({
      val,
      start,
      isPercent,
      hasLeadingDollar,
      hasTrailingDollar,
      isSplitContext,
      isBillContext,
    });
  }

  return tokens;
}

function extractBill(q, split, tipPercent) {
  const consumed = new Set([split.start, tipPercent?.start ?? -1]);
  const currencyPatterns = [
    /(?<![\d.])\$\s*(\d+(?:\.\d+)?)/dgi,
    /(\d+(?:\.\d+)?)\s*\$(?!\d)/dgi,
  ];

  const currencyAmounts = [];
  for (const pattern of currencyPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(q)) !== null) {
      const val = parseFloat(match[1]);
      const start = match.indices[1][0];
      if (!Number.isNaN(val) && val > 0 && !consumed.has(start)) {
        currencyAmounts.push({ val, start });
      }
    }
  }

  if (currencyAmounts.length > 0) {
    currencyAmounts.sort((a, b) => b.val - a.val);
    return currencyAmounts[0];
  }

  const tokens = collectNumberTokens(q).filter((token) => {
    if (token.isPercent) return false;
    if (consumed.has(token.start)) return false;
    if (token.isSplitContext) return false;
    return true;
  });

  const billContext = tokens.find((token) => token.isBillContext);
  if (billContext) return billContext;

  const currencyToken = tokens.find((token) => token.hasLeadingDollar || token.hasTrailingDollar);
  if (currencyToken) return currencyToken;

  if (tokens.length === 0) return null;

  if (tokens.length === 1) return tokens[0];

  const sorted = [...tokens].sort((a, b) => b.val - a.val);
  if (tipPercent !== null) return sorted[0];
  return sorted.find((token) => token.val > 100) || sorted[0];
}

export function parseTipQuery(query) {
  let q = String(query || "").trim();
  if (!q) return null;

  if (/%[0-9a-f]{2}/i.test(q)) {
    try {
      q = decodeURIComponent(q);
    } catch {
      return null;
    }
  }
  if (/%[0-9a-f]{2}/i.test(q)) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|www\.)/i.test(q)) return null;
  q = q.toLowerCase();

  if (!hasTipIntent(q)) return null;
  if (isTipAdviceArticle(q)) return null;
  if (
    (NON_TIP_PERCENT_CONTEXT_RX.test(q) || isPercentCalculation(q)) &&
    !/\b(?:tip|gratuity|gratuities)\b/i.test(q) &&
    !EXPLICIT_TIP_CALC_RX.test(q)
  ) {
    return null;
  }

  const explicitCalcKeywords = EXPLICIT_TIP_CALC_RX.test(q);
  const hasDigits = /\d/.test(q);

  if (!explicitCalcKeywords && !hasDigits) {
    if (!TIP_CALCULATOR_RX.test(q)) return null;
  }

  const splitToken = extractSplit(q);
  const tipToken = extractTipPercent(q, splitToken);
  const billToken = extractBill(q, splitToken, tipToken);
  const split = splitToken.value;
  let tipPercent = tipToken ? tipToken.value : null;
  let bill = billToken ? billToken.val : null;

  if (bill !== null && tipPercent === null && bill > 0) {
    const tokens = collectNumberTokens(q).filter(
      (token) => !token.isPercent && token.start !== splitToken.start && token.start !== billToken.start
    );
    if (tokens.length === 1 && tokens[0].val <= 100) {
      tipPercent = tokens[0].val;
    }
  }

  if (bill !== null && (Number.isNaN(bill) || bill <= 0)) bill = null;
  if (tipPercent !== null && (Number.isNaN(tipPercent) || tipPercent < 0)) tipPercent = null;
  if (Number.isNaN(split) || split <= 0) return { bill, tipPercent, split: 1 };

  const hasBillSignal = bill !== null || /\$|\b(?:bill|check|tab|total|meal)\b/i.test(q);
  const hasTipSignal = tipPercent !== null || /\b(?:tip|gratuity|gratuities)\b/i.test(q);
  const hasSplitSignal = split > 1 || /\b(?:split|divide|divided|among|between)\b/i.test(q);

  if (!explicitCalcKeywords && !TIP_CALCULATOR_RX.test(q) && !(hasBillSignal && (hasTipSignal || hasSplitSignal))) {
    return null;
  }

  return { bill, tipPercent, split };
}
