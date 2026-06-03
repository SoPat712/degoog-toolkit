(function () {
  var REFRESH_TIMEOUT_MS = 22000;
  var TILE_SIZE = 256;

  function _setButtonState(btn, text, disabled) {
    btn.textContent = text;
    btn.disabled = disabled;
  }

  var GEO_TIMEOUT_MS = 8000;

  function _initGeoButtons() {
    document.querySelectorAll(".places-geo-btn:not([data-places-init])").forEach(function (btn) {
      btn.dataset.placesInit = "1";
      btn.addEventListener("click", function () {
        if (btn.dataset.placesBusy === "true") return;
        btn.dataset.placesBusy = "true";
        _setButtonState(btn, "Locating\u2026", true);

        // Post to the refresh route. lat/lon may be null — the server then resolves
        // an approximate location via IP geolocation (no browser CORS dependency).
        async function _sendRefreshRequest(lat, lon) {
          _setButtonState(btn, "Searching\u2026", true);
          var controller = new AbortController();
          var timeout = window.setTimeout(function () {
            controller.abort();
          }, REFRESH_TIMEOUT_MS);

          var hasCoords = typeof lat === "number" && typeof lon === "number" &&
            isFinite(lat) && isFinite(lon);

          try {
            var res = await fetch("/api/plugin/" + __PLUGIN_ID__ + "/refresh", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                lat: hasCoords ? lat : null,
                lon: hasCoords ? lon : null,
                query: btn.dataset.query || "",
              }),
            });
            if (!res.ok) throw new Error("Refresh failed (" + res.status + ")");
            var data = await res.json();
            var wrap = btn.closest(".places-wrap");
            if (wrap && data && data.html) {
              var temp = document.createElement("div");
              temp.innerHTML = data.html.trim();
              var newWrap = temp.firstElementChild;
              if (newWrap) {
                wrap.replaceWith(newWrap);
                _initGeoButtons();
                _initPlaceCards();
                _initInteractiveMaps();
                _initDirectionsModals();
                _initHoursToggles();
                return; // old btn is detached; finally still clears its busy flag
              }
            }
            _setButtonState(btn, "No results nearby", false);
          } catch (e) {
            _setButtonState(
              btn,
              e && e.name === "AbortError" ? "Timed out \u2014 try again" : "Couldn't refresh",
              false
            );
          } finally {
            window.clearTimeout(timeout);
            btn.dataset.placesBusy = "false";
          }
        }

        // Prefer precise browser geolocation; on denial/timeout/no-API, fall back
        // to server-side IP geolocation by sending null coords.
        if (!navigator.geolocation) {
          _sendRefreshRequest(null, null);
          return;
        }

        var settled = false;
        var geoTimer = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          _sendRefreshRequest(null, null);
        }, GEO_TIMEOUT_MS);

        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (settled) return;
            settled = true;
            window.clearTimeout(geoTimer);
            _sendRefreshRequest(pos.coords.latitude, pos.coords.longitude);
          },
          function (err) {
            if (settled) return;
            settled = true;
            window.clearTimeout(geoTimer);
            console.warn("[places] Browser geolocation unavailable, using server IP geo:", err && err.message);
            _sendRefreshRequest(null, null);
          },
          { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60000 }
        );
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Place cards                                                         */
  /* ------------------------------------------------------------------ */

  var loggingTimeout = null;
  function _logClientSummary() {
    document.querySelectorAll(".places-wrap").forEach(function (wrap) {
      var version = wrap.dataset.placesVersion || "unknown";
      var cards = wrap.querySelectorAll(".places-card[data-place-card]");
      if (cards.length === 0) return;

      console.log("[Places Client v" + version + "] Active Place Cards Summary:");
      cards.forEach(function (card, idx) {
        var name = card.querySelector(".places-name")?.textContent || "Unknown";
        var dist = card.querySelector(".places-distance")?.textContent || "Unknown";
        var hasPhone = !card.querySelector(".places-action-call")?.classList.contains("places-disabled");
        var hasWebsite = !card.querySelector(".places-action-website")?.classList.contains("places-disabled");
        var address = card.querySelector(".places-address")?.title || "Unknown";
        var hoursBadge = card.querySelector(".places-hours")?.textContent || "NONE";
        var hoursDetail = card.querySelector(".places-today-hours")?.textContent || "NONE";
        var lat = card.dataset.lat || "unknown";
        var lon = card.dataset.lon || "unknown";
        console.log(
          "  [" + idx + "] Name: " + name + 
          " | Dist: " + dist + 
          " | Lat: " + lat + 
          " | Lon: " + lon + 
          " | Phone: " + (hasPhone ? "AVAILABLE" : "MISSING") + 
          " | Website: " + (hasWebsite ? "AVAILABLE" : "MISSING") +
          " | Hours Badge: " + hoursBadge +
          " | Hours Detail: " + hoursDetail +
          " | Address: " + address
        );
      });

      if (wrap.dataset.placesApis) {
        try {
          var apis = JSON.parse(wrap.dataset.placesApis);
          if (apis.debug) {
            console.log("[Places Client v" + version + "] Query plan:");
            console.log(
              "  Original: " + (apis.debug.originalQuery || "?") +
              " | Search text: " + (apis.debug.searchText || "?") +
              " | Near hint: " + (apis.debug.placeHint || "none") +
              " | Mode: " + (apis.debug.planMode || "?") +
              "/" + (apis.debug.planConfidence || "?") +
              " | Radius: " + (apis.debug.searchRadiusMiles != null ? apis.debug.searchRadiusMiles + " mi" : "?")
            );
          }
          if (apis.searchCenter) {
            console.log(
              "[Places Client v" + version + "] Search center: " +
              (apis.searchCenter.label || "?") +
              " (" + apis.searchCenter.lat + ", " + apis.searchCenter.lon + ")"
            );
          }
          console.log("[Places Client v" + version + "] API Execution Status:");
          Object.keys(apis).forEach(function (key) {
            if (key === "debug" || key === "searchCenter") return;
            var api = apis[key];
            if (!api || typeof api !== "object") return;
            var statusStr = api.status;
            if (api.configured === false) {
              statusStr = "not configured";
            }
            var detail = "Status: " + statusStr;
            if (api.count !== undefined) detail += " | Results: " + api.count;
            if (api.cached) detail += " | Cached: yes";
            if (api.source) detail += " | Source: " + api.source;
            if (api.mode) detail += " | Mode: " + api.mode;
            if (api.query) detail += " | Hint/query: " + api.query;
            if (api.label) detail += " | Resolved: " + api.label;
            if (api.lat != null && api.lon != null) detail += " | Coords: " + api.lat + ", " + api.lon;
            if (api.endpoint) detail += " | Endpoint: " + api.endpoint;
            if (api.radiusMiles != null) detail += " | Radius: " + api.radiusMiles + " mi";
            if (api.request) detail += " | Request: " + api.request;
            if (api.categories) detail += " | Categories: " + api.categories;
            if (api.error) detail += " | Error: " + api.error;
            console.log("  - " + key + ": " + detail);
          });
        } catch (err) {
          console.warn("[Places Client] Failed to parse API status:", err);
        }
      }
    });
  }

  function _initPlaceCards() {
    var newCardsFound = false;
    document.querySelectorAll(".places-card[data-place-card]:not([data-places-card-init])").forEach(function (card) {
      card.dataset.placesCardInit = "1";
      newCardsFound = true;
      card.addEventListener("click", function (event) {
        if (event.target.closest("a,button")) return;
        _selectPlace(card);
      });
      card.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("a,button")) return;
        event.preventDefault();
        _selectPlace(card);
      });
    });
    if (newCardsFound) {
      if (loggingTimeout) clearTimeout(loggingTimeout);
      loggingTimeout = setTimeout(_logClientSummary, 100);
    }
  }

  function _selectPlace(card) {
    var wrap = card.closest(".places-wrap");
    if (!wrap) return;

    var lat = Number(card.dataset.lat);
    var lon = Number(card.dataset.lon);
    var name = card.dataset.placeName || "";
    var idx = Number(card.dataset.placeIndex);
    var panel = wrap.querySelector("[data-map-panel]");
    if (!panel || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    wrap.querySelectorAll(".places-card-selected").forEach(function (selected) {
      selected.classList.remove("places-card-selected");
    });
    card.classList.add("places-card-selected");

    panel.dataset.placeName = name;
    panel.setAttribute("aria-label", "Map centered on " + name);

    var link = panel.querySelector("[data-map-link]");
    if (link) {
      link.href = _osmViewUrl(lat, lon);
    }

    var tileMap = panel.querySelector(".places-tile-map");
    if (tileMap) {
      var state = _getMapState(tileMap);
      // Recenter on the selected place; keep all pins, just mark this one active.
      state.lat = lat;
      state.lon = lon;
      // Clicking a marker/card should zoom to a place-focused level so the
      // selected location is clearly visible.
      state.zoom = Math.max(16, Number(state.zoom) || 15);
      state.offsetX = 0;
      state.offsetY = 0;
      if (Number.isFinite(idx)) state.activeIndex = idx;
      tileMap.dataset.lat = String(lat);
      tileMap.dataset.lon = String(lon);
      tileMap.dataset.zoom = String(state.zoom);
      tileMap.setAttribute("aria-label", "Map for " + name);
      _renderTiles(tileMap, state);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Interactive tile map                                                */
  /* ------------------------------------------------------------------ */

  function _getMapState(mapEl) {
    if (!mapEl._mapState) {
      var points = [];
      try {
        points = JSON.parse(mapEl.dataset.placesPoints || "[]");
      } catch (e) {
        points = [];
      }
      points = (Array.isArray(points) ? points : []).filter(function (p) {
        return p && isFinite(p.lat) && isFinite(p.lon);
      });

      mapEl._mapState = {
        points: points,
        lat: Number(mapEl.dataset.lat),
        lon: Number(mapEl.dataset.lon),
        zoom: Number(mapEl.dataset.zoom || 15),
        activeIndex: 0,
        fitDone: mapEl.dataset.fitBounds !== "1",
        dragging: false,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
      };
    }
    return mapEl._mapState;
  }

  // Largest integer zoom (clamped 2..18) where all pins fit in the container,
  // with light padding. Single point keeps the default ~15 zoom.
  function _fitZoom(points, width, height, defaultZoom) {
    if (!points || points.length <= 1) return defaultZoom;

    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    points.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    });

    var padFactor = 1.25; // ~20% breathing room around the outermost pins
    for (var z = 18; z >= 2; z--) {
      var nw = _latLonToTile(maxLat, minLon, z); // top-left tile coords
      var se = _latLonToTile(minLat, maxLon, z); // bottom-right tile coords
      var pxW = Math.abs(se.x - nw.x) * TILE_SIZE * padFactor;
      var pxH = Math.abs(se.y - nw.y) * TILE_SIZE * padFactor;
      if (pxW <= width && pxH <= height) return z;
    }
    return 2;
  }

  function _initInteractiveMaps() {
    document.querySelectorAll(".places-tile-map:not([data-places-map-init])").forEach(function (mapEl) {
      mapEl.dataset.placesMapInit = "1";
      var state = _getMapState(mapEl);
      _renderTiles(mapEl, state);

      if (typeof ResizeObserver === "function") {
        var observer = new ResizeObserver(function () {
          _renderTiles(mapEl, state);
        });
        observer.observe(mapEl);
      } else {
        window.addEventListener("resize", function () {
          _renderTiles(mapEl, state);
        });
      }

      // Mouse drag helpers
      function onMouseMove(e) {
        if (!state.dragging) return;
        state.offsetX = e.clientX - state.startX;
        state.offsetY = e.clientY - state.startY;
        _renderTiles(mapEl, state);
      }

      function onMouseUp() {
        if (!state.dragging) return;
        state.dragging = false;
        mapEl.style.cursor = "grab";

        var newCenter = _pixelOffsetToLatLon(state.offsetX, state.offsetY, state.lat, state.lon, state.zoom);
        state.lat = newCenter.lat;
        state.lon = newCenter.lon;
        state.offsetX = 0;
        state.offsetY = 0;

        mapEl.dataset.lat = String(state.lat);
        mapEl.dataset.lon = String(state.lon);

        var panel = mapEl.closest("[data-map-panel]");
        if (panel) {
          panel.dataset.lat = String(state.lat);
          panel.dataset.lon = String(state.lon);
          var link = panel.querySelector("[data-map-link]");
          if (link) link.href = _osmViewUrl(state.lat, state.lon);
        }

        _renderTiles(mapEl, state);

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      mapEl.addEventListener("mousedown", function (e) {
        if (e.target.closest("button, a")) return;
        state.dragging = true;
        state.startX = e.clientX;
        state.startY = e.clientY;
        mapEl.style.cursor = "grabbing";
        e.preventDefault();

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      // Touch drag helpers
      function onTouchMove(e) {
        if (!state.dragging || e.touches.length !== 1) return;
        e.preventDefault();
        state.offsetX = e.touches[0].clientX - state.startX;
        state.offsetY = e.touches[0].clientY - state.startY;
        _renderTiles(mapEl, state);
      }

      function onTouchEnd() {
        if (!state.dragging) return;
        state.dragging = false;

        var newCenter = _pixelOffsetToLatLon(state.offsetX, state.offsetY, state.lat, state.lon, state.zoom);
        state.lat = newCenter.lat;
        state.lon = newCenter.lon;
        state.offsetX = 0;
        state.offsetY = 0;

        mapEl.dataset.lat = String(state.lat);
        mapEl.dataset.lon = String(state.lon);

        var panel = mapEl.closest("[data-map-panel]");
        if (panel) {
          panel.dataset.lat = String(state.lat);
          panel.dataset.lon = String(state.lon);
          var link = panel.querySelector("[data-map-link]");
          if (link) link.href = _osmViewUrl(state.lat, state.lon);
        }

        _renderTiles(mapEl, state);

        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
      }

      mapEl.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        state.dragging = true;
        state.startX = e.touches[0].clientX;
        state.startY = e.touches[0].clientY;

        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
        document.addEventListener("touchcancel", onTouchEnd);
      }, { passive: true });

      // Scroll zoom
      mapEl.addEventListener("wheel", function (e) {
        e.preventDefault();
        if (e.deltaY < 0) state.zoom = Math.min(19, state.zoom + 1);
        else state.zoom = Math.max(2, state.zoom - 1);
        mapEl.dataset.zoom = String(state.zoom);
        _renderTiles(mapEl, state);
      }, { passive: false });

      // Zoom buttons
      var zoomIn = mapEl.querySelector("[data-zoom-in]");
      var zoomOut = mapEl.querySelector("[data-zoom-out]");

      if (zoomIn) {
        zoomIn.addEventListener("click", function (e) {
          e.stopPropagation();
          state.zoom = Math.min(19, state.zoom + 1);
          mapEl.dataset.zoom = String(state.zoom);
          _renderTiles(mapEl, state);
        });
      }

      if (zoomOut) {
        zoomOut.addEventListener("click", function (e) {
          e.stopPropagation();
          state.zoom = Math.max(2, state.zoom - 1);
          mapEl.dataset.zoom = String(state.zoom);
          _renderTiles(mapEl, state);
        });
      }

      // Pin click -> select the matching card (highlights row, recenters, marks pin active).
      mapEl.addEventListener("click", function (e) {
        var pinEl = e.target.closest(".places-pin");
        if (!pinEl) return;
        e.stopPropagation();
        var idx = Number(pinEl.dataset.placeIndex);
        if (!Number.isFinite(idx)) return;
        var wrap = mapEl.closest(".places-wrap");
        if (!wrap) return;
        var card = wrap.querySelector('.places-card[data-place-index="' + idx + '"]');
        if (card) _selectPlace(card);
      });
    });
  }

  function _renderTiles(mapEl, state) {
    var layer = mapEl.querySelector(".places-tile-layer");
    if (!layer) return;

    var template = mapEl.dataset.tileTemplate || "";
    var width = Math.max(mapEl.clientWidth, TILE_SIZE);
    var height = Math.max(mapEl.clientHeight, TILE_SIZE);

    if (!template || !Number.isFinite(state.lat) || !Number.isFinite(state.lon) || !Number.isFinite(state.zoom)) {
      return;
    }

    // Fit all pins on the first render once the container has a real size.
    if (!state.fitDone && mapEl.clientWidth > 0 && state.points && state.points.length > 1) {
      state.zoom = _fitZoom(state.points, width, height, Number(mapEl.dataset.zoom || 15));
      mapEl.dataset.zoom = String(state.zoom);
      state.fitDone = true;
    }

    var center = _latLonToTile(state.lat, state.lon, state.zoom);
    var centerPxX = center.x * TILE_SIZE;
    var centerPxY = center.y * TILE_SIZE;

    var viewCenterX = width / 2 + state.offsetX;
    var viewCenterY = height / 2 + state.offsetY;

    var startX = Math.floor((centerPxX - viewCenterX) / TILE_SIZE);
    var endX = Math.floor((centerPxX - viewCenterX + width) / TILE_SIZE);
    var startY = Math.floor((centerPxY - viewCenterY) / TILE_SIZE);
    var endY = Math.floor((centerPxY - viewCenterY + height) / TILE_SIZE);
    var maxTile = Math.pow(2, state.zoom);

    var html = "";
    for (var x = startX; x <= endX; x += 1) {
      for (var y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;

        var wrappedX = ((x % maxTile) + maxTile) % maxTile;
        var left = Math.round(x * TILE_SIZE - centerPxX + viewCenterX);
        var top = Math.round(y * TILE_SIZE - centerPxY + viewCenterY);
        var src = _tileUrl(template, state.zoom, wrappedX, y);

        html +=
          '<img class="places-tile" alt="" draggable="false" src="' +
          _escapeAttr(src) +
          '" style="left:' +
          left +
          "px;top:" +
          top +
          'px">';
      }
    }

    layer.innerHTML = html;

    _renderPins(mapEl, state, {
      centerPxX: centerPxX,
      centerPxY: centerPxY,
      viewCenterX: viewCenterX,
      viewCenterY: viewCenterY,
    });
  }

  function _renderPins(mapEl, state, geom) {
    var layer = mapEl.querySelector(".places-pin-layer");
    if (!layer) return;

    var points = state.points || [];
    if (points.length === 0) {
      layer.innerHTML = "";
      return;
    }

    var html = "";
    points.forEach(function (pt) {
      var tile = _latLonToTile(pt.lat, pt.lon, state.zoom);
      var left = Math.round(tile.x * TILE_SIZE - geom.centerPxX + geom.viewCenterX);
      var top = Math.round(tile.y * TILE_SIZE - geom.centerPxY + geom.viewCenterY);
      var active = pt.index === state.activeIndex ? " places-pin-active" : "";
      var label = pt.index + 1;
      html +=
        '<button class="places-pin' + active + '" type="button" data-place-index="' + pt.index +
        '" style="left:' + left + "px;top:" + top + 'px" title="' + _escapeAttr(pt.name || "") +
        '" aria-label="' + _escapeAttr(pt.name || "") + '"><span class="places-pin-label">' +
        label + "</span></button>";
    });

    layer.innerHTML = html;
  }

  function _pixelOffsetToLatLon(offsetX, offsetY, lat, lon, zoom) {
    var center = _latLonToTile(lat, lon, zoom);
    var newTileX = center.x - offsetX / TILE_SIZE;
    var newTileY = center.y - offsetY / TILE_SIZE;
    return _tileToLatLon(newTileX, newTileY, zoom);
  }

  function _tileToLatLon(x, y, zoom) {
    var n = Math.pow(2, zoom);
    var lon = (x / n) * 360 - 180;
    var latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    var lat = latRad * 180 / Math.PI;
    return { lat: lat, lon: lon };
  }

  function _latLonToTile(lat, lon, zoom) {
    var sinLat = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
    var scale = Math.pow(2, zoom);
    return {
      x: ((lon + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
    };
  }

  function _tileUrl(template, zoom, x, y) {
    return template
      .replace(/\{z\}/g, String(zoom))
      .replace(/\{x\}/g, String(x))
      .replace(/\{y\}/g, String(y));
  }

  function _osmViewUrl(lat, lon) {
    return (
      "https://www.openstreetmap.org/?mlat=" +
      encodeURIComponent(lat) +
      "&mlon=" +
      encodeURIComponent(lon) +
      "#map=15/" +
      encodeURIComponent(lat) +
      "/" +
      encodeURIComponent(lon)
    );
  }

  function _escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ------------------------------------------------------------------ */
  /* Directions modal                                                    */
  /* ------------------------------------------------------------------ */

  function _initDirectionsModals() {
    document.querySelectorAll(".places-wrap:not([data-places-modal-init])").forEach(function (wrap) {
      wrap.dataset.placesModalInit = "1";

      var modal = wrap.querySelector("[data-places-modal]");
      if (!modal) return;

      // Open modal on Directions button click
      wrap.querySelectorAll("[data-directions-btn]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();

          var name = btn.dataset.placeName || "";
          var lat = btn.dataset.lat || "";
          var lon = btn.dataset.lon || "";
          var address = btn.dataset.address || "";

          var appleUrl = "https://maps.apple.com/?q=" + encodeURIComponent(name) + "&ll=" + lat + "," + lon;
          var googleUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name + " " + address);
          var osmUrl = "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=15/" + lat + "/" + lon;

          var appleLink = modal.querySelector('[data-modal-option="apple"]');
          var googleLink = modal.querySelector('[data-modal-option="google"]');
          var osmLink = modal.querySelector('[data-modal-option="osm"]');

          if (appleLink) appleLink.href = appleUrl;
          if (googleLink) googleLink.href = googleUrl;
          if (osmLink) osmLink.href = osmUrl;

          modal.hidden = false;
        });
      });

      // Close modal
      modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          modal.hidden = true;
        });
      });

      // Close on Escape
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) {
          modal.hidden = true;
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Expandable full-week hours                                          */
  /* ------------------------------------------------------------------ */

  function _initHoursToggles() {
    document.querySelectorAll("[data-hours-toggle]:not([data-hours-init])").forEach(function (btn) {
      btn.dataset.hoursInit = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var card = btn.closest(".places-card");
        if (!card) return;
        var week = card.querySelector("[data-week-hours]");
        if (!week) return;
        var willOpen = week.hidden;
        week.hidden = !willOpen;
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        btn.classList.toggle("places-hours-toggle-open", willOpen);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  _initGeoButtons();
  _initPlaceCards();
  _initInteractiveMaps();
  _initDirectionsModals();
  _initHoursToggles();

  // Handle failed tile image retries
  document.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "IMG" && e.target.classList.contains("places-tile")) {
      var img = e.target;
      var retryCount = parseInt(img.dataset.retryCount || "0", 10);
      if (retryCount < 3) {
        img.dataset.retryCount = String(retryCount + 1);
        var baseSrc = img.src.split(/[?&]_retry=/)[0];
        var separator = baseSrc.indexOf("?") !== -1 ? "&" : "?";
        var delay = 1000 * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s
        setTimeout(function () {
          img.src = baseSrc + separator + "_retry=" + (retryCount + 1);
        }, delay);
      }
    }
  }, true);

  var observer = new MutationObserver(function () {
    _initGeoButtons();
    _initPlaceCards();
    _initInteractiveMaps();
    _initDirectionsModals();
    _initHoursToggles();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
