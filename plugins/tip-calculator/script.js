(function () {
  "use strict";

  let currentWidget = null;
  const animationDuration = 250;
  const currentValues = { tipAmount: 0, totalBill: 0, tipPerPerson: 0, totalPerPerson: 0 };
  const activeAnimations = { tipAmount: null, totalBill: null, tipPerPerson: null, totalPerPerson: null };

  const qs = selector => currentWidget ? currentWidget.querySelector(selector) : null;

  function cancelAnimations() {
    Object.keys(activeAnimations).forEach((key) => {
      if (activeAnimations[key]) cancelAnimationFrame(activeAnimations[key]);
      activeAnimations[key] = null;
      currentValues[key] = 0;
    });
  }

  function formatCurrency(val) {
    if (isNaN(val) || val < 0) val = 0;
    return "$" + val.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function animateValue(key, targetValue, element) {
    if (!element) return;

    const startValue = currentValues[key];
    if (startValue === targetValue) {
      element.textContent = formatCurrency(targetValue);
      return;
    }

    if (activeAnimations[key]) cancelAnimationFrame(activeAnimations[key]);

    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = (timestamp - startTime) / animationDuration;

      if (progress < 1) {
        const easeProgress = progress * (2 - progress);
        const value = startValue + (targetValue - startValue) * easeProgress;
        element.textContent = formatCurrency(value);
        activeAnimations[key] = requestAnimationFrame(step);
      } else {
        element.textContent = formatCurrency(targetValue);
        currentValues[key] = targetValue;
        activeAnimations[key] = null;
      }
    }

    activeAnimations[key] = requestAnimationFrame(step);
  }

  function calculateResults(animate) {
    if (!currentWidget) return;

    const billInput = qs("#tipcalc-bill-input");
    const tipInput = qs("#tipcalc-tip-input");
    const splitInput = qs("#tipcalc-split-input");

    if (!billInput || !tipInput || !splitInput) return;

    let bill = parseFloat(billInput.value);
    if (isNaN(bill) || bill < 0) bill = 0;

    let tipPercent = parseFloat(tipInput.value);
    if (isNaN(tipPercent) || tipPercent < 0) tipPercent = 0;

    let split = parseInt(splitInput.value, 10);
    if (isNaN(split) || split < 1) split = 1;

    const tipAmount = bill * (tipPercent / 100);
    const totalBill = bill + tipAmount;
    const tipPerPerson = tipAmount / split;
    const totalPerPerson = totalBill / split;

    const tipAmountEl = qs("#tipcalc-tip-amount");
    const totalBillEl = qs("#tipcalc-total-bill");
    const tipPerPersonEl = qs("#tipcalc-tip-per-person");
    const totalPerPersonEl = qs("#tipcalc-total-per-person");
    const splitSection = qs("#tipcalc-split-section");

    if (splitSection) {
      splitSection.style.display = split > 1 ? "flex" : "none";
    }

    if (animate) {
      animateValue("tipAmount", tipAmount, tipAmountEl);
      animateValue("totalBill", totalBill, totalBillEl);
      animateValue("tipPerPerson", tipPerPerson, tipPerPersonEl);
      animateValue("totalPerPerson", totalPerPerson, totalPerPersonEl);
    } else {
      if (tipAmountEl) tipAmountEl.textContent = formatCurrency(tipAmount);
      if (totalBillEl) totalBillEl.textContent = formatCurrency(totalBill);
      if (tipPerPersonEl) tipPerPersonEl.textContent = formatCurrency(tipPerPerson);
      if (totalPerPersonEl) totalPerPersonEl.textContent = formatCurrency(totalPerPerson);

      Object.assign(currentValues, { tipAmount, totalBill, tipPerPerson, totalPerPerson });
    }
  }

  function syncInputs(sourceId) {
    if (!currentWidget) return;

    const tipInput = qs("#tipcalc-tip-input");
    const tipSlider = qs("#tipcalc-tip-slider");
    const splitInput = qs("#tipcalc-split-input");
    const splitSlider = qs("#tipcalc-split-slider");

    if (!tipInput || !tipSlider || !splitInput || !splitSlider) return;

    if (sourceId === "tipcalc-tip-input") {
      let val = parseFloat(tipInput.value);
      if (isNaN(val)) val = 0;
      tipSlider.value = Math.min(50, Math.max(0, val));
    } else if (sourceId === "tipcalc-tip-slider") {
      tipInput.value = tipSlider.value;
    } else if (sourceId === "tipcalc-split-input") {
      let val = parseInt(splitInput.value, 10);
      if (isNaN(val)) val = 1;
      splitSlider.value = Math.min(20, Math.max(1, val));
    } else if (sourceId === "tipcalc-split-slider") {
      splitInput.value = splitSlider.value;
    }

    updateSliderProgress(tipSlider);
    updateSliderProgress(splitSlider);
  }

  function updateSliderProgress(slider) {
    if (!slider) return;
    let min = parseFloat(slider.min);
    let max = parseFloat(slider.max);
    let value = parseFloat(slider.value);

    if (isNaN(min)) min = 0;
    if (isNaN(max) || max <= min) max = min + 1;
    if (isNaN(value)) value = min;

    const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    slider.style.setProperty("--tipcalc-progress", percent.toFixed(2) + "%");
  }

  function handleInput(event) {
    const target = event.target;
    if (!target || !currentWidget?.contains(target)) return;

    const id = target.id;
    if (["tipcalc-bill-input", "tipcalc-tip-input", "tipcalc-tip-slider", "tipcalc-split-input", "tipcalc-split-slider"].includes(id)) {
      syncInputs(id);
      calculateResults(true);
    }
  }

  function initFromWidget(w) {
    cancelAnimations();
    currentWidget = w;
    
    const billInput = qs("#tipcalc-bill-input");
    const tipInput = qs("#tipcalc-tip-input");
    const tipSlider = qs("#tipcalc-tip-slider");
    const splitInput = qs("#tipcalc-split-input");
    const splitSlider = qs("#tipcalc-split-slider");

    const datasetBill = w.getAttribute("data-bill");
    const datasetTip = w.getAttribute("data-tip-percent");
    const datasetSplit = w.getAttribute("data-split");

    if (billInput && datasetBill) billInput.value = datasetBill;
    if (tipInput && datasetTip) {
      tipInput.value = datasetTip;
      if (tipSlider) tipSlider.value = Math.min(50, Math.max(0, parseFloat(datasetTip) || 0));
    }
    if (splitInput && datasetSplit) {
      splitInput.value = datasetSplit;
      if (splitSlider) splitSlider.value = Math.min(20, Math.max(1, parseInt(datasetSplit, 10) || 1));
    }

    updateSliderProgress(tipSlider);
    updateSliderProgress(splitSlider);
    calculateResults(false);
  }

  function checkWidget() {
    if (currentWidget?.isConnected) return;
    const w = document.querySelector("[data-tipcalc-widget]");
    if (!w) {
      if (currentWidget && !currentWidget.isConnected) {
        cancelAnimations();
        currentWidget = null;
      }
      return;
    }
    if (w !== currentWidget) initFromWidget(w);
  }

  document.addEventListener("input", handleInput);

  const observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
