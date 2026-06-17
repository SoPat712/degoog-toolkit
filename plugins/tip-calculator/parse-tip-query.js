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

function isTipAdviceArticle(q) {
  if (/\b(?:tips?\s+on\s+[\d$]|[\d$]\d.*\b(?:tips?|gratuity)\b)/i.test(q)) return false;
  if (/\b(?:tips?\s+(?:to|on\s+how|for|about|with|and|from|in))\b/i.test(q)) return true;
  return ADVICE_TOPIC_RX.test(q);
}

function hasTipIntent(q) {
  return (
    /\b(?:tips?|gratuity|gratuities)\b/i.test(q) ||
    /\b(?:calculator|calculate|calc|compute)\b/i.test(q) ||
    /\d\s*(?:%|percent\b|pct\b)/i.test(q) ||
    (/\bsplit\b/i.test(q) && (/\d/.test(q) || /\b(?:bill|check|tab|total|meal)\b/i.test(q)))
  );
}

function isReasonableSplit(n) {
  return Number.isInteger(n) && n >= 1 && n <= 50;
}

function extractSplit(q) {
  const patterns = [
    /\b(\d+)\s*(?:-?\s*)?ways?\s+split\b/i,
    /\b(\d+)\s*(?:people|persons|pax)\b/i,
    /\b(\d+)\s*ways?\b/i,
    /\b(?:among|between|divide(?:d)?(?:\s+by)?)\s+(\d+)(?:\s*(?:ways?|people|persons|pax))?\b/i,
    /\bsplit\s+(?:the\s+)?(?:bill\s+)?(?:by|among|between|with|for|in)?\s*(\d+)(?:\s*(?:ways?|people|persons|pax))?\b/i,
    /\b(\d+)\s*way\s+split\b/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      const split = parseInt(match[1], 10);
      if (isReasonableSplit(split)) return split;
    }
  }

  return 1;
}

function extractTipPercent(q, split) {
  const percentMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|pct\b)/i);
  if (percentMatch) {
    const tip = parseFloat(percentMatch[1]);
    if (!Number.isNaN(tip) && tip >= 0 && tip !== split) return tip;
  }

  const tipWordAfter = q.match(/\b(?:tip|gratuity|gratuities)\s+(?:of\s+)?(\d+(?:\.\d+)?)\b/i);
  if (tipWordAfter) {
    const tip = parseFloat(tipWordAfter[1]);
    if (!Number.isNaN(tip) && tip >= 0 && tip <= 100 && tip !== split) return tip;
  }

  const tipWordBefore = q.match(/\b(\d+(?:\.\d+)?)\s+(?:tip|gratuity|gratuities)\b/i);
  if (tipWordBefore) {
    const tip = parseFloat(tipWordBefore[1]);
    if (!Number.isNaN(tip) && tip >= 0 && tip <= 100 && tip !== split) return tip;
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
    const lastTwo = preWords.slice(-2).join(" ");

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
  const currencyPatterns = [
    /(?<![\d.])\$\s*(\d+(?:\.\d+)?)/gi,
    /(\d+(?:\.\d+)?)\s*\$(?!\d)/gi,
  ];

  const currencyAmounts = [];
  for (const pattern of currencyPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(q)) !== null) {
      const val = parseFloat(match[1]);
      if (!Number.isNaN(val) && val > 0 && val !== split && val !== tipPercent) {
        currencyAmounts.push({ val, index: match.index });
      }
    }
  }

  if (currencyAmounts.length === 1) {
    return currencyAmounts[0].val;
  }

  if (currencyAmounts.length > 1) {
    currencyAmounts.sort((a, b) => b.val - a.val);
    return currencyAmounts[0].val;
  }

  const tokens = collectNumberTokens(q).filter((token) => {
    if (token.isPercent) return false;
    if (token.val === split) return false;
    if (tipPercent !== null && token.val === tipPercent) return false;
    if (token.isSplitContext) return false;
    return true;
  });

  const billContext = tokens.find((token) => token.isBillContext);
  if (billContext) return billContext.val;

  const currencyToken = tokens.find((token) => token.hasLeadingDollar || token.hasTrailingDollar);
  if (currencyToken) return currencyToken.val;

  if (tokens.length === 0) return null;

  if (tokens.length === 1) return tokens[0].val;

  if (tipPercent !== null) {
    const nonTip = tokens.filter((token) => token.val !== tipPercent);
    if (nonTip.length > 0) {
      nonTip.sort((a, b) => b.val - a.val);
      return nonTip[0].val;
    }
  }

  const sorted = [...tokens].sort((a, b) => b.val - a.val);
  const likelyBill = sorted.find((token) => token.val > 100) || sorted[0];
  return likelyBill.val;
}

export function parseTipQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  if (!hasTipIntent(q)) return null;
  if (isTipAdviceArticle(q)) return null;

  const explicitCalcKeywords = /\b(?:calculator|calculate|calc|compute)\b/i.test(q);
  const hasDigits = /\d/.test(q);

  if (!explicitCalcKeywords && !hasDigits) {
    if (!TIP_CALCULATOR_RX.test(q)) return null;
  }

  const split = extractSplit(q);
  let tipPercent = extractTipPercent(q, split);
  let bill = extractBill(q, split, tipPercent);

  if (bill !== null && tipPercent === null && bill > 0) {
    const tokens = collectNumberTokens(q).filter(
      (token) => !token.isPercent && token.val !== split && token.val !== bill
    );
    if (tokens.length === 1 && tokens[0].val <= 100) {
      tipPercent = tokens[0].val;
    }
  }

  if (bill !== null && tipPercent !== null && bill === tipPercent && bill <= 100) {
    const tokens = collectNumberTokens(q).filter((token) => !token.isPercent && token.val !== split);
    const larger = tokens.find((token) => token.val > tipPercent);
    if (larger) bill = larger.val;
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
