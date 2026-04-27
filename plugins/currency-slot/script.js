(function () {
  function fmt(n) {
    n = parseFloat(n);
    if (isNaN(n)) return "0";
    if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1)    return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }

  function makeFlag(symbol, code) {
    const display = (symbol || code || "??").slice(0, 3);
    const len = display.length;
    const fs = len <= 1 ? 11 : len <= 2 ? 9 : 8;
    return '<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="' + fs + '" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">' + display + '</text></svg>';
  }

  async function fetchRate(from, to) {
    try {
      const fromIsCrypto = from === "BTC" || from === "ETH";
      const toIsCrypto   = to === "BTC" || to === "ETH";
      
      if (!fromIsCrypto && !toIsCrypto) {
        const res = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.rate ?? null;
      }
      
      // Crypto path via CoinGecko
      const coinId = (fromIsCrypto ? from : to) === "BTC" ? "bitcoin" : "ethereum";
      const vsCurrency = (fromIsCrypto ? to : from).toLowerCase();
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`);
      if (!res.ok) return null;
      const data = await res.json();
      const price = data[coinId]?.[vsCurrency];
      if (!price) return null;
      // If converting FROM crypto, the price IS the rate (e.g. BTC→USD = 60000)
      // If converting TO crypto, invert (e.g. USD→BTC = 1/60000)
      return fromIsCrypto ? price : (1 / price);
    } catch(e) { return null; }
  }

  function animateNumber(element, from, to, duration = 600) {
    const startTime = performance.now();
    const startVal = parseFloat(from) || 0;
    const endVal = parseFloat(to) || 0;
    
    element.classList.add('updating');
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * ease;
      
      element.textContent = fmt(current);
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = fmt(endVal);
        setTimeout(() => element.classList.remove('updating'), 800);
      }
    }
    
    requestAnimationFrame(update);
  }

  function initWrap(wrap) {
    if (wrap.dataset.cxsInit) return;
    wrap.dataset.cxsInit = "1";

    let fromCode = wrap.querySelector("#cxs-from-code")?.textContent?.trim() || "USD";
    let toCode   = wrap.querySelector("#cxs-to-code")?.textContent?.trim()   || "EUR";
    const rateValEl  = wrap.querySelector("#cxs-rate-val");
    let rate = parseFloat(wrap.dataset.rate) || 1;

    const amountEl    = wrap.querySelector("#cxs-amount");
    const resultEl    = wrap.querySelector("#cxs-result");
    const rateFromEl  = wrap.querySelector("#cxs-rate-from");
    const picker      = wrap.querySelector("#cxs-picker");
    const pickerList  = wrap.querySelector("#cxs-picker-list");
    const pickerSearch = wrap.querySelector("#cxs-picker-search");

    if (!amountEl || !resultEl) return;

    let _currencies = null;
    async function fetchCurrencies() {
      if (_currencies) return _currencies;
      try {
        const res = await fetch('https://api.frankfurter.dev/v2/currencies');
        if (!res.ok) return [];
        const data = await res.json();
        _currencies = data.map(c => ({
          code: c.iso_code, name: c.name,
          symbol: c.symbol || c.iso_code.slice(0, 2),
        }));
        _currencies.push({ code: 'BTC', name: 'Bitcoin', symbol: '₿' });
        _currencies.push({ code: 'ETH', name: 'Ethereum', symbol: 'Ξ' });
      } catch(e) { _currencies = []; }
      return _currencies;
    }

    let pickerTarget = null;
    let isPickerOpen = false;
    let previousResult = 0;

    function updateResult(animate = false) {
      const amt = parseFloat(amountEl.value) || 0;
      const newResult = amt * rate;
      
      if (animate && resultEl) {
        animateNumber(resultEl, previousResult, newResult);
      } else if (resultEl) {
        resultEl.textContent = fmt(newResult);
      }
      
      previousResult = newResult;
      if (rateFromEl) rateFromEl.textContent = fromCode;
      if (rateValEl) rateValEl.textContent = fmt(rate) + " " + toCode;
    }

    function updateCurUI(side, code) {
      const cur = (_currencies || []).find(c => c.code === code);
      
      const flagEl = wrap.querySelector("#cxs-" + side + "-flag");
      const codeEl = wrap.querySelector("#cxs-" + side + "-code");
      const nameEl = wrap.querySelector("#cxs-" + side + "-name");
      
      if (flagEl) {
        flagEl.classList.remove('changing');
        void flagEl.offsetWidth; // force reflow
        
        flagEl.classList.add('changing');
        
        setTimeout(() => {
          flagEl.innerHTML = makeFlag(cur?.symbol || code.slice(0, 2), code);
          flagEl.classList.remove('changing');
        }, 50);
      }
      
      if (codeEl) {
        codeEl.style.opacity = '0';
        setTimeout(() => {
          codeEl.textContent = code;
          codeEl.style.transition = 'opacity 0.2s';
          codeEl.style.opacity = '1';
        }, 100);
      }
      
      if (nameEl) {
        nameEl.style.opacity = '0';
        setTimeout(() => {
          nameEl.textContent = cur?.name || code;
          nameEl.style.transition = 'opacity 0.2s';
          nameEl.style.opacity = '1';
        }, 150);
      }
    }

    previousResult = (parseFloat(amountEl.value) || 1) * rate;

    amountEl.addEventListener("input", () => updateResult(false));
    amountEl.addEventListener("keydown", e => {
      if (e.key === "Enter") { 
        e.preventDefault(); 
        updateResult(true);
      }
    });

    wrap.querySelectorAll(".cxs-q").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => btn.style.transform = '', 100);
        amountEl.value = btn.dataset.v;
        updateResult(true);
      });
    });

    const swapBtn = wrap.querySelector("#cxs-swap");
    if (swapBtn) {
      swapBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        
        swapBtn.classList.add('spinning');
        setTimeout(() => swapBtn.classList.remove('spinning'), 500);
        
        [fromCode, toCode] = [toCode, fromCode];
        
        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        
        // Invert the current rate as an immediate fallback
        rate = rate !== 0 ? (1 / rate) : 1;
        updateResult(true);
        
        // Then fetch the live rate and update again if it differs
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null && newRate !== rate) {
          rate = newRate;
          updateResult(true);
        }
      });
    }

    async function openPicker(side) {
      pickerTarget = side;
      isPickerOpen = true;
      
      picker.style.display = 'block';
      requestAnimationFrame(() => {
        picker.classList.add('active');
      });
      
      if (pickerSearch) {
        pickerSearch.value = "";
        setTimeout(() => pickerSearch.focus(), 100);
      }

      if (!_currencies) {
        pickerList.innerHTML = '<div class="cxs-picker-loading">Loading currencies…</div>';
        await fetchCurrencies();
      }
      renderPickerList("");
    }

    function closePicker() {
      if (!isPickerOpen) return;
      isPickerOpen = false;
      picker.classList.remove('active');
      
      setTimeout(() => {
        if (!isPickerOpen) {
          picker.style.display = 'none';
          pickerTarget = null;
        }
      }, 300);
    }

    function renderPickerList(filter) {
      if (!pickerList) return;
      
      // Get selected currency for this picker
      const selectedCode = pickerTarget === "from" ? fromCode : toCode;
      
      // Filter currencies
      const filtered = filter
        ? (_currencies || []).filter(c => c.code.toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter))
        : (_currencies || []);
      
      // Split into selected and others
      const selected = filtered.filter(c => c.code === selectedCode);
      const others = filtered.filter(c => c.code !== selectedCode);
      
      // Combine: selected first, then others
      const sorted = [...selected, ...others];
      
      pickerList.innerHTML = sorted.map((c, i) => {
        const isSelected = c.code === selectedCode;
        return `<div class="cxs-picker-item${isSelected ? ' cxs-picker-item--selected' : ''}" data-code="${c.code}" style="animation-delay: ${i * 0.02}s">
          <span class="cxs-picker-flag">${makeFlag(c.symbol, c.code)}</span>
          <div class="cxs-picker-info">
            <span class="cxs-picker-name">${c.name}</span>
            <span class="cxs-picker-code">${c.code}</span>
          </div>
          ${isSelected ? '<span class="cxs-picker-checkmark">✓</span>' : ''}
        </div>`;
      }).join("");
    }

    const fromBtn = wrap.querySelector("#cxs-from-btn");
    const toBtn = wrap.querySelector("#cxs-to-btn");
    const closeBtn = wrap.querySelector("#cxs-picker-close");
    
    if (fromBtn) {
      fromBtn.addEventListener("click", (e) => { 
        e.stopPropagation();
        e.preventDefault();
        openPicker("from"); 
      });
    }
    
    if (toBtn) {
      toBtn.addEventListener("click", (e) => { 
        e.stopPropagation();
        e.preventDefault();
        openPicker("to"); 
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        closePicker();
      });
    }

    if (pickerSearch) {
      pickerSearch.addEventListener("input", () => {
        renderPickerList(pickerSearch.value.trim().toLowerCase());
      });
    }

    if (pickerList) {
      pickerList.addEventListener("click", async (e) => {
        e.stopPropagation();
        
        const item = e.target.closest(".cxs-picker-item");
        if (!item) return;
        
        const code = item.dataset.code;
        if (pickerTarget === "from") fromCode = code;
        else toCode = code;
        
        closePicker();
        
        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        
        // Fetch the live rate for the new currency pair
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null) rate = newRate;
        updateResult(true);
      });
    }

    const pairsContainer = wrap.querySelector("#cxs-pairs");
    if (pairsContainer) {
      pairsContainer.addEventListener("click", async (e) => {
        const pair = e.target.closest(".cxs-pair");
        if (!pair) return;
        
        pair.style.transform = 'scale(0.95)';
        setTimeout(() => pair.style.transform = '', 100);
        
        fromCode = pair.dataset.from;
        toCode   = pair.dataset.to;
        
        // Reset amount to 1
        amountEl.value = "1";
        
        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        
        // Use the rate displayed on the pair card as an immediate fallback
        const pairRateEl = pair.querySelector(".cxs-pair-rate");
        const cardRate = pairRateEl ? parseFloat(pairRateEl.textContent.replace(/[^0-9.]/g, "")) : null;
        if (cardRate && cardRate > 0) {
          rate = cardRate;
        }
        // Show immediate result with the card rate
        updateResult(true);
        
        // Then fetch the live rate and update again if it differs
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null && newRate !== rate) {
          rate = newRate;
          updateResult(true);
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (isPickerOpen && !picker.contains(e.target)) {
        const isFromBtn = fromBtn && fromBtn.contains(e.target);
        const isToBtn = toBtn && toBtn.contains(e.target);
        
        if (!isFromBtn && !isToBtn) {
          closePicker();
        }
      }
    });
  }

  function scan() {
    document.querySelectorAll(".cxs-wrap:not([data-cxs-init])").forEach(initWrap);
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
