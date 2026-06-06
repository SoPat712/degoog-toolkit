(function () {
  const UNIT_MS = {
    years: 365.2425 * 24 * 60 * 60 * 1000,
    months: 30.436875 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    minutes: 60 * 1000,
    seconds: 1000,
  };

  const DETAIL_UNITS = [
    "years",
    "months",
    "weeks",
    "days",
    "hours",
    "minutes",
    "seconds",
  ];
  const DEFAULT_TOP_UNITS = 2;

  function init() {
    document.querySelectorAll("[data-until-card]").forEach(startCard);
  }

  function startCard(card) {
    if (card.__untilTimer) return;

    const update = () => updateCard(card);
    update();
    card.__untilTimer = window.setInterval(update, 1000);
  }

  function updateCard(card) {
    const targetMs = Date.parse(card.dataset.untilTarget || "");
    if (!Number.isFinite(targetMs)) return;

    const diffMs = targetMs - Date.now();
    const absMs = Math.abs(diffMs);
    const future = diffMs >= 0;
    const unit = card.dataset.untilUnit || "auto";
    const topUnits = normalizeTopUnits(card.dataset.untilTopUnits);
    const primary = formatPrimary(absMs, unit, topUnits);

    card.classList.toggle("until-card--future", future);
    card.classList.toggle("until-card--past", !future);

    const answerEl = card.querySelector("[data-until-answer]");
    const captionEl = card.querySelector("[data-until-caption]");

    if (answerEl) updateAnswer(answerEl, primary.html);
    if (captionEl) captionEl.textContent = future ? "from now" : "ago";

    for (const detailUnit of DETAIL_UNITS) {
      const detailEl = card.querySelector(`[data-until-value="${detailUnit}"]`);
      if (!detailEl) continue;
      updateDetailFlap(
        detailEl,
        formatDetailNumber(absMs / UNIT_MS[detailUnit], detailUnit),
      );
    }
  }

  function formatPrimary(absMs, unit, topUnits) {
    const parts = decomposeDuration(absMs, unit, topUnits);
    return { html: renderPrimaryHtml(parts) };
  }

  function renderPrimaryHtml(parts) {
    if (!parts.length) {
      return '<span class="until-card__now">right now</span>';
    }

    return parts
      .map((part, index) => {
        const level = Math.min(index, DETAIL_UNITS.length - 1);
        const displayValue = formatWhole(part.value);
        const safe = escapeHtml(displayValue);
        return `<span class="until-card__part until-card__part--${level}">
          <span class="until-card__flap" data-until-part data-until-unit="${escapeHtml(part.unit)}" data-until-value="${escapeHtml(String(part.value))}" data-until-display="${safe}">
            <span class="until-card__flap-sizer" aria-hidden="true">${safe}</span>
            <span class="until-card__flap-card until-card__flap-card--upper"><span class="until-card__flap-text" data-until-upper>${safe}</span></span>
            <span class="until-card__flap-card until-card__flap-card--lower" aria-hidden="true"><span class="until-card__flap-text" data-until-lower>${safe}</span></span>
            <span class="until-card__flap-card until-card__flap-card--flip-upper" aria-hidden="true"><span class="until-card__flap-text" data-until-flip-upper>${safe}</span></span>
            <span class="until-card__flap-card until-card__flap-card--flip-lower" aria-hidden="true"><span class="until-card__flap-text" data-until-flip-lower>${safe}</span></span>
          </span>
          <span class="until-card__part-unit">${escapeHtml(plural(part.unit.slice(0, -1), part.value))}</span>
        </span>`;
      })
      .join("");
  }

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateAnswer(answerEl, nextHtml) {
    const previous = new Map();
    answerEl.querySelectorAll("[data-until-part]").forEach((el) => {
      const unit = el.getAttribute("data-until-unit");
      const value = Number(el.getAttribute("data-until-value"));
      const display = el.getAttribute("data-until-display") || "";
      if (unit && Number.isFinite(value)) previous.set(unit, { value, display });
    });

    answerEl.innerHTML = nextHtml;

    if (prefersReducedMotion) return;

    answerEl.querySelectorAll("[data-until-part]").forEach((el) => {
      const unit = el.getAttribute("data-until-unit");
      const next = Number(el.getAttribute("data-until-value"));
      const prev = previous.get(unit);
      if (
        !unit ||
        !prev ||
        !Number.isFinite(prev.value) ||
        !Number.isFinite(next) ||
        prev.value === next
      ) {
        return;
      }

      // Split-flap fall: the top leaf shows the OLD value and drops away to
      // reveal the NEW top, while the static lower half keeps showing the OLD
      // value until the NEW lower leaf lands over it. NEW value lives in the
      // static upper half and the lower flap (already rendered above).
      const lower = el.querySelector("[data-until-lower]");
      const flipUppers = el.querySelectorAll("[data-until-flip-upper]");
      if (lower) lower.textContent = prev.display;
      flipUppers.forEach((flipUpper) => {
        flipUpper.textContent = prev.display;
      });
      el.classList.add("until-card__flap--anim");

      window.setTimeout(() => {
        if (!el.isConnected) return;
        const settledLower = el.querySelector("[data-until-lower]");
        if (settledLower) {
          settledLower.textContent =
            el.getAttribute("data-until-display") || "";
        }
        el.classList.remove("until-card__flap--anim");
      }, 353);
    });
  }

  function updateDetailFlap(detailEl, nextDisplay) {
    const next = String(nextDisplay);
    let previous = detailEl.getAttribute("data-until-detail-display");

    if (!detailEl.querySelector("[data-until-detail-upper]")) {
      detailEl.innerHTML = renderDetailFlapHtml(next);
      detailEl.setAttribute("data-until-detail-display", next);
      detailEl.setAttribute("aria-label", next);
      return;
    }

    if (previous === null) previous = next;
    if (previous === next) return;

    const sizer = detailEl.querySelector(".until-card__detail-sizer");
    const upper = detailEl.querySelector("[data-until-detail-upper]");
    const lower = detailEl.querySelector("[data-until-detail-lower]");
    const flipUppers = detailEl.querySelectorAll(
      "[data-until-detail-flip-upper]",
    );
    const flipLowers = detailEl.querySelectorAll(
      "[data-until-detail-flip-lower]",
    );

    if (sizer) sizer.textContent = next;
    if (upper) upper.textContent = next;
    if (lower) lower.textContent = prefersReducedMotion ? next : previous;
    flipUppers.forEach((flipUpper) => {
      flipUpper.textContent = previous;
    });
    flipLowers.forEach((flipLower) => {
      flipLower.textContent = next;
    });

    detailEl.setAttribute("data-until-detail-display", next);
    detailEl.setAttribute("aria-label", next);

    if (prefersReducedMotion) return;

    detailEl.classList.remove("until-card__detail-value--anim");
    void detailEl.offsetWidth;
    detailEl.classList.add("until-card__detail-value--anim");

    window.clearTimeout(detailEl.__untilDetailAnimationTimer);
    detailEl.__untilDetailAnimationTimer = window.setTimeout(() => {
      if (lower) lower.textContent = next;
      detailEl.classList.remove("until-card__detail-value--anim");
    }, 329);
  }

  function renderDetailFlapHtml(display) {
    const safe = escapeHtml(display);
    return `
      <span class="until-card__detail-sizer" aria-hidden="true">${safe}</span>
      <span class="until-card__detail-half until-card__detail-half--upper" aria-hidden="true"><span class="until-card__detail-text" data-until-detail-upper>${safe}</span></span>
      <span class="until-card__detail-half until-card__detail-half--lower" aria-hidden="true"><span class="until-card__detail-text" data-until-detail-lower>${safe}</span></span>
      <span class="until-card__detail-half until-card__detail-half--flip-upper" aria-hidden="true"><span class="until-card__detail-text" data-until-detail-flip-upper>${safe}</span></span>
      <span class="until-card__detail-half until-card__detail-half--flip-lower" aria-hidden="true"><span class="until-card__detail-text" data-until-detail-flip-lower>${safe}</span></span>`;
  }

  function decomposeDuration(absMs, requestedUnit, count) {
    if (absMs < 1000) return [];

    const startIndex =
      requestedUnit && requestedUnit !== "auto"
        ? DETAIL_UNITS.indexOf(requestedUnit)
        : findAutoStartIndex(absMs);
    if (startIndex < 0) return [];

    const unitCount = Math.max(
      1,
      Math.min(count || DEFAULT_TOP_UNITS, DETAIL_UNITS.length - startIndex),
    );
    const units = DETAIL_UNITS.slice(startIndex, startIndex + unitCount);
    let remaining = absMs;
    const parts = [];

    for (const [index, durationUnit] of units.entries()) {
      const isLast = index === units.length - 1;
      const value =
        isLast && units.length > 1
          ? Math.ceil(remaining / UNIT_MS[durationUnit])
          : Math.floor(remaining / UNIT_MS[durationUnit]);
      parts.push({ unit: durationUnit, value });
      remaining -=
        Math.min(value, Math.floor(remaining / UNIT_MS[durationUnit])) *
        UNIT_MS[durationUnit];
    }

    normalizeDurationCarry(parts);

    return parts;
  }

  function findAutoStartIndex(absMs) {
    const index = DETAIL_UNITS.findIndex((unit) => absMs >= UNIT_MS[unit]);
    return index === -1 ? DETAIL_UNITS.length - 1 : index;
  }

  function normalizeDurationCarry(parts) {
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const current = parts[index];
      const previous = parts[index - 1];
      const ratio = Math.round(UNIT_MS[previous.unit] / UNIT_MS[current.unit]);
      if (!Number.isFinite(ratio) || ratio <= 1 || current.value < ratio) {
        continue;
      }

      previous.value += Math.floor(current.value / ratio);
      current.value %= ratio;
    }
  }

  function normalizeTopUnits(value) {
    const parsed = Number(value);
    if (
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= DETAIL_UNITS.length
    ) {
      return parsed;
    }
    return DEFAULT_TOP_UNITS;
  }

  function formatDetailNumber(value, unit) {
    if (unit === "years" || unit === "months" || unit === "weeks") {
      return formatDecimal(value, value >= 10 ? 1 : 2);
    }
    return formatWhole(Math.round(value));
  }

  function formatWhole(value) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDecimal(value, digits) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: value < 10 ? Math.min(1, digits) : 0,
    }).format(value);
  }

  function plural(label, value) {
    return Math.abs(value) === 1 ? label : `${label}s`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  const observer = new MutationObserver(init);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
