// Package Tracking only needs its copy button; one delegated listener covers
// cards that stream in after the results.
(function () {
  "use strict";

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (error) {
        ok = false;
      }
      field.remove();
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-pkgtrack-copy]");
    if (!button) return;
    var label = button.querySelector("span");
    copyText(button.getAttribute("data-pkgtrack-copy")).then(function () {
      if (!label) return;
      if (!button.dataset.pkgtrackLabel) button.dataset.pkgtrackLabel = label.textContent;
      label.textContent = button.getAttribute("data-pkgtrack-copied") || label.textContent;
      button.setAttribute("data-pkgtrack-done", "");
      clearTimeout(button._pkgtrackTimer);
      button._pkgtrackTimer = setTimeout(function () {
        label.textContent = button.dataset.pkgtrackLabel;
        button.removeAttribute("data-pkgtrack-done");
      }, 1600);
    }, function () {});
  });
})();
