(function () {
  "use strict";

  var currentWidget = null;
  var animationDuration = 250; // ms

  // Keep track of the current values for animating transitions
  var currentValues = {
    tipAmount: 0,
    totalBill: 0,
    tipPerPerson: 0,
    totalPerPerson: 0
  };

  // Keep track of running animation frame IDs to cancel them if a new input occurs
  var activeAnimations = {
    tipAmount: null,
    totalBill: null,
    tipPerPerson: null,
    totalPerPerson: null
  };

  function qs(selector) {
    return currentWidget ? currentWidget.querySelector(selector) : null;
  }

  function formatCurrency(val) {
    if (isNaN(val) || val < 0) val = 0;
    return "$" + val.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Smooth numeric counter animation
  function animateValue(key, targetValue, element) {
    if (!element) return;

    var startValue = currentValues[key];
    if (startValue === targetValue) {
      element.textContent = formatCurrency(targetValue);
      return;
    }

    if (activeAnimations[key]) {
      cancelAnimationFrame(activeAnimations[key]);
    }

    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = (timestamp - startTime) / animationDuration;

      if (progress < 1) {
        // Ease out quad
        var easeProgress = progress * (2 - progress);
        var value = startValue + (targetValue - startValue) * easeProgress;
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

    var billInput = qs("#tipcalc-bill-input");
    var tipInput = qs("#tipcalc-tip-input");
    var splitInput = qs("#tipcalc-split-input");

    if (!billInput || !tipInput || !splitInput) return;

    var bill = parseFloat(billInput.value);
    if (isNaN(bill) || bill < 0) bill = 0;

    var tipPercent = parseFloat(tipInput.value);
    if (isNaN(tipPercent) || tipPercent < 0) tipPercent = 0;

    var split = parseInt(splitInput.value, 10);
    if (isNaN(split) || split < 1) split = 1;

    // Calculations
    var tipAmount = bill * (tipPercent / 100);
    var totalBill = bill + tipAmount;
    var tipPerPerson = tipAmount / split;
    var totalPerPerson = totalBill / split;

    // Elements
    var tipAmountEl = qs("#tipcalc-tip-amount");
    var totalBillEl = qs("#tipcalc-total-bill");
    var tipPerPersonEl = qs("#tipcalc-tip-per-person");
    var totalPerPersonEl = qs("#tipcalc-total-per-person");
    var splitSection = qs("#tipcalc-split-section");

    // Toggle split section visibility
    if (splitSection) {
      if (split > 1) {
        if (splitSection.style.display === "none") {
          splitSection.style.display = "flex";
        }
      } else {
        splitSection.style.display = "none";
      }
    }

    if (animate) {
      animateValue("tipAmount", tipAmount, tipAmountEl);
      animateValue("totalBill", totalBill, totalBillEl);
      animateValue("tipPerPerson", tipPerPerson, tipPerPersonEl);
      animateValue("totalPerPerson", totalPerPerson, totalPerPersonEl);
    } else {
      // Immediate update
      if (tipAmountEl) tipAmountEl.textContent = formatCurrency(tipAmount);
      if (totalBillEl) totalBillEl.textContent = formatCurrency(totalBill);
      if (tipPerPersonEl) tipPerPersonEl.textContent = formatCurrency(tipPerPerson);
      if (totalPerPersonEl) totalPerPersonEl.textContent = formatCurrency(totalPerPerson);

      currentValues.tipAmount = tipAmount;
      currentValues.totalBill = totalBill;
      currentValues.tipPerPerson = tipPerPerson;
      currentValues.totalPerPerson = totalPerPerson;
    }
  }

  function syncInputs(sourceId) {
    if (!currentWidget) return;

    var tipInput = qs("#tipcalc-tip-input");
    var tipSlider = qs("#tipcalc-tip-slider");
    var splitInput = qs("#tipcalc-split-input");
    var splitSlider = qs("#tipcalc-split-slider");

    if (!tipInput || !tipSlider || !splitInput || !splitSlider) return;

    if (sourceId === "tipcalc-tip-input") {
      var val = parseFloat(tipInput.value);
      if (isNaN(val)) val = 0;
      tipSlider.value = Math.min(50, Math.max(0, val));
    } else if (sourceId === "tipcalc-tip-slider") {
      tipInput.value = tipSlider.value;
    } else if (sourceId === "tipcalc-split-input") {
      var val = parseInt(splitInput.value, 10);
      if (isNaN(val)) val = 1;
      splitSlider.value = Math.min(20, Math.max(1, val));
    } else if (sourceId === "tipcalc-split-slider") {
      splitInput.value = splitSlider.value;
    }
  }

  function handleInput(event) {
    var target = event.target;
    if (!target) return;

    var id = target.id;
    if (id === "tipcalc-bill-input" || id === "tipcalc-tip-input" || id === "tipcalc-tip-slider" || id === "tipcalc-split-input" || id === "tipcalc-split-slider") {
      syncInputs(id);
      calculateResults(true);
    }
  }

  function initFromWidget(w) {
    currentWidget = w;
    
    // Set initial values from dataset if present
    var billInput = qs("#tipcalc-bill-input");
    var tipInput = qs("#tipcalc-tip-input");
    var tipSlider = qs("#tipcalc-tip-slider");
    var splitInput = qs("#tipcalc-split-input");
    var splitSlider = qs("#tipcalc-split-slider");

    var datasetBill = w.getAttribute("data-bill");
    var datasetTip = w.getAttribute("data-tip-percent");
    var datasetSplit = w.getAttribute("data-split");

    if (billInput && datasetBill !== null && datasetBill !== "") {
      billInput.value = datasetBill;
    }
    if (tipInput && datasetTip !== null && datasetTip !== "") {
      tipInput.value = datasetTip;
      if (tipSlider) {
        tipSlider.value = Math.min(50, Math.max(0, parseFloat(datasetTip) || 0));
      }
    }
    if (splitInput && datasetSplit !== null && datasetSplit !== "") {
      splitInput.value = datasetSplit;
      if (splitSlider) {
        splitSlider.value = Math.min(20, Math.max(1, parseInt(datasetSplit, 10) || 1));
      }
    }

    calculateResults(false);
  }

  function checkWidget() {
    var w = document.querySelector("[data-tipcalc-widget]");
    if (!w) {
      if (currentWidget && !currentWidget.isConnected) {
        currentWidget = null;
      }
      return;
    }
    if (w !== currentWidget) {
      initFromWidget(w);
    }
  }

  // Setup global event listener for input changes
  document.addEventListener("input", handleInput);

  // Setup MutationObserver to detect widget lifecycle changes
  var observer = new MutationObserver(checkWidget);
  observer.observe(document.body, { childList: true, subtree: true });
  checkWidget();
})();
