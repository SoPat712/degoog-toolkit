(function () {
  "use strict";

  var activeClass = "barrel-roll-active";
  var tiltedClass = "barrel-roll-tilted";

  function getTarget() {
    return document.getElementById("results-page") || document.body;
  }

  function processMarkers() {
    var markers = document.querySelectorAll(".barrel-roll-marker");

    // Clean up classes if no markers are present in the DOM (e.g. navigated away)
    if (markers.length === 0) {
      var el = getTarget();
      if (el) {
        el.classList.remove(activeClass);
        el.classList.remove(tiltedClass);
      }
      return;
    }

    for (var i = 0; i < markers.length; i++) {
      var marker = markers[i];
      if (marker.getAttribute("data-processed") === "true") {
        continue;
      }
      marker.setAttribute("data-processed", "true");

      var action = marker.getAttribute("data-action");
      var target = getTarget();
      if (!target) continue;

      if (action === "roll") {
        // If it's already active, remove and trigger reflow to restart animation
        target.classList.remove(activeClass);
        void target.offsetWidth;

        target.classList.add(activeClass);

        var onEnd = function () {
          target.classList.remove(activeClass);
          target.removeEventListener("animationend", onEnd);
        };
        target.addEventListener("animationend", onEnd);

        // Fallback cleanup in case animationend isn't supported or fails to fire
        setTimeout(function () {
          target.classList.remove(activeClass);
        }, 2100);

      } else if (action === "tilt" || action === "askew") {
        target.classList.add(tiltedClass);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", processMarkers);
  } else {
    processMarkers();
  }

  var observer = new MutationObserver(processMarkers);
  observer.observe(document.body, { childList: true, subtree: true });
})();
