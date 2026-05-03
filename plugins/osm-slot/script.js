(function () {
  function _loadLeaflet(cb) {
    if (window._leafletLoaded) { cb(); return; }
    if (window._leafletLoading) {
      window._leafletQueue = window._leafletQueue || [];
      window._leafletQueue.push(cb);
      return;
    }
    window._leafletLoading = true;

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => {
      window._leafletLoaded = true;
      window._leafletLoading = false;
      cb();
      (window._leafletQueue || []).forEach(fn => fn());
      window._leafletQueue = [];
    };
    document.head.appendChild(js);
  }

  function _isInDropdown(el) {
    // Walk up the DOM — if we hit a suggestions/autocomplete/dropdown container, skip
    let node = el.parentElement;
    while (node) {
      const cls = (node.className || "").toLowerCase();
      const role = (node.getAttribute("role") || "").toLowerCase();
      if (
        cls.includes("suggest") ||
        cls.includes("autocomplete") ||
        cls.includes("dropdown") ||
        cls.includes("typeahead") ||
        cls.includes("completion") ||
        role === "listbox" ||
        role === "combobox"
      ) return true;
      node = node.parentElement;
    }
    return false;
  }

  function _initMap(el) {
    if (el.dataset.osmInit) return;
    if (_isInDropdown(el)) return; // skip if inside autocomplete dropdown

    el.dataset.osmInit = "1";

    const lat = parseFloat(el.dataset.lat);
    const lon = parseFloat(el.dataset.lon);
    const zoom = parseInt(el.dataset.zoom || "13", 10);
    const name = el.dataset.name || "";

    const map = L.map(el, { zoomControl: true, scrollWheelZoom: false }).setView([lat, lon], zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);

    L.marker([lat, lon]).addTo(map).bindPopup(name).openPopup();
  }

  function _initAll() {
    document.querySelectorAll(".osm-map-container:not([data-osm-init])").forEach(_initMap);
  }

  _loadLeaflet(_initAll);

  const observer = new MutationObserver(() => {
    const pending = document.querySelectorAll(".osm-map-container:not([data-osm-init])");
    if (pending.length > 0) _loadLeaflet(_initAll);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
