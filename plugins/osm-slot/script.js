(function () {
  const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

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
    const tileUrl = _pickTileUrl(el.dataset.tileUrl);

    const map = L.map(el, { zoomControl: true, scrollWheelZoom: false }).setView([lat, lon], zoom);

    L.tileLayer(tileUrl, {
      attribution: _tileAttribution(tileUrl),
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);

    const marker = L.marker([lat, lon]).addTo(map).bindPopup(_escapeHtml(name)).openPopup();
    _bindOsmMatchNav(el, map, marker);
  }

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function _bindOsmMatchNav(el, map, marker) {
    if (el.dataset.osmNavBound) return;
    const header = el.previousElementSibling;
    if (!header || !header.classList.contains("osm-slot-header")) return;
    const raw = el.getAttribute("data-osm-candidates");
    let candidates = [];
    try {
      candidates = raw ? JSON.parse(decodeURIComponent(raw)) : [];
    } catch (_) {
      return;
    }
    if (!Array.isArray(candidates) || candidates.length < 2) return;
    el.dataset.osmNavBound = "1";

    const prev = header.querySelector(".osm-slot-nav-prev");
    const next = header.querySelector(".osm-slot-nav-next");
    const curEl = header.querySelector(".osm-slot-nav-cur");
    const cityEl = header.querySelector(".osm-slot-city");
    const openLink = header.querySelector(".osm-slot-open");
    let idx = 0;

    function syncChrome() {
      if (prev) prev.disabled = idx <= 0;
      if (next) next.disabled = idx >= candidates.length - 1;
      if (curEl) curEl.textContent = String(idx + 1);
    }

    function applyIndex(i) {
      if (i < 0 || i >= candidates.length) return;
      idx = i;
      const c = candidates[idx];
      map.setView([c.lat, c.lon], c.zoom);
      marker.setLatLng([c.lat, c.lon]);
      const pop = marker.getPopup();
      if (pop) pop.setContent(_escapeHtml(c.displayName || ""));
      if (cityEl) cityEl.textContent = c.shortName || "";
      if (openLink) {
        openLink.href = `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}&zoom=${c.zoom}`;
      }
      syncChrome();
    }

    if (prev) {
      prev.addEventListener("click", () => applyIndex(idx - 1));
    }
    if (next) {
      next.addEventListener("click", () => applyIndex(idx + 1));
    }
    syncChrome();
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

  function _pickTileUrl(value) {
    if (typeof value !== "string") return DEFAULT_TILE_URL;
    const url = value.trim();
    if (!url) return DEFAULT_TILE_URL;
    if (!/^https?:\/\//i.test(url)) return DEFAULT_TILE_URL;
    if (!url.includes("{z}") || !url.includes("{x}") || !url.includes("{y}")) {
      return DEFAULT_TILE_URL;
    }
    return url;
  }

  function _tileAttribution(tileUrl) {
    if (/maptiler\.com/i.test(tileUrl)) {
      return '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    }
    return '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  }
})();
