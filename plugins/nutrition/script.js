// Nutrition recalculates its rows when the serving changes. The card carries
// per-100 g amounts, and one delegated listener covers cards streamed in later.
(function () {
  "use strict";

  function roundAmount(value) {
    if (!isFinite(value)) return "";
    if (value >= 100) return String(Math.round(value));
    if (value >= 10) return String(Math.round(value * 10) / 10).replace(/\.0$/, "");
    return String(Math.round(value * 100) / 100).replace(/(\.\d)0$/, "$1").replace(/\.0$/, "");
  }

  document.addEventListener("change", function (event) {
    var select = event.target;
    if (!select.matches || !select.matches("[data-nutr-serving]")) return;
    var card = select.closest("[data-nutr-card]");
    var grams = Number(select.value);
    var per100;
    try {
      per100 = JSON.parse(card.getAttribute("data-nutr-per100"));
    } catch (error) {
      return;
    }
    if (!(grams > 0) || !per100) return;

    card.querySelectorAll("[data-nutr-value]").forEach(function (node) {
      var base = Number(per100[node.getAttribute("data-nutr-value")]);
      if (!isFinite(base)) return;
      var amount = (base * grams) / 100;
      var unit = node.getAttribute("data-nutr-unit");
      node.textContent = unit ? roundAmount(amount) + " " + unit : String(Math.round(amount));
    });
    card.querySelectorAll("[data-nutr-dv]").forEach(function (node) {
      var base = Number(per100[node.getAttribute("data-nutr-dv")]);
      var daily = Number(node.getAttribute("data-nutr-base"));
      if (!isFinite(base) || !(daily > 0)) return;
      node.textContent = Math.round(((base * grams) / 100 / daily) * 100) + "%";
    });
  });
})();
