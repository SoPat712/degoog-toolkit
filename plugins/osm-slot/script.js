(function () {
  function _initGeoButtons() {
    document.querySelectorAll(".places-geo-btn:not([data-places-init])").forEach(function (btn) {
      btn.dataset.placesInit = "1";
      btn.addEventListener("click", async function () {
        if (!navigator.geolocation) {
          btn.textContent = "Not supported";
          btn.disabled = true;
          return;
        }
        btn.textContent = "Locating…";
        btn.disabled = true;

        navigator.geolocation.getCurrentPosition(
          async function (pos) {
            try {
              const res = await fetch(
                "/api/plugin/" + __PLUGIN_ID__ + "/refresh",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    query: btn.dataset.query || "",
                  }),
                }
              );
              if (!res.ok) throw new Error("Refresh failed");
              const data = await res.json();
              const wrap = btn.closest(".places-wrap");
              if (wrap && data.html) {
                const temp = document.createElement("div");
                temp.innerHTML = data.html;
                const newWrap = temp.firstElementChild;
                if (newWrap) wrap.replaceWith(newWrap);
              } else {
                btn.textContent = "No results";
                btn.disabled = true;
              }
            } catch (e) {
              btn.textContent = "Refresh failed";
              btn.disabled = false;
            }
          },
          function (err) {
            btn.textContent = "Location denied";
            btn.disabled = true;
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    });
  }

  _initGeoButtons();

  var observer = new MutationObserver(_initGeoButtons);
  observer.observe(document.body, { childList: true, subtree: true });
})();
