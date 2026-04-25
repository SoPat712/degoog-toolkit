(function () {
  function fmt(n) {
    n = parseFloat(n);
    if (isNaN(n)) return "0";
    if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1)    return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }

  async function fetchRate(from, to) {
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&symbols=${to}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.rates?.[to] ?? null;
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
    const rateText   = rateValEl?.textContent || "1";
    let rate = parseFloat(rateText.replace(/[^0-9.]/g, "")) || 1;

    const amountEl    = wrap.querySelector("#cxs-amount");
    const resultEl    = wrap.querySelector("#cxs-result");
    const rateFromEl  = wrap.querySelector("#cxs-rate-from");
    const picker      = wrap.querySelector("#cxs-picker");
    const pickerList  = wrap.querySelector("#cxs-picker-list");
    const pickerSearch = wrap.querySelector("#cxs-picker-search");

    if (!amountEl || !resultEl) return;

    let CURRENCIES = [];
    try { 
      CURRENCIES = JSON.parse(wrap.dataset.currencies || "[]"); 
    } catch(e) {}

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
      const cur = CURRENCIES.find(c => c.code === code);
      if (!cur) return;
      
      const flagEl = wrap.querySelector("#cxs-" + side + "-flag");
      const codeEl = wrap.querySelector("#cxs-" + side + "-code");
      const nameEl = wrap.querySelector("#cxs-" + side + "-name");
      
      if (flagEl) {
        flagEl.classList.remove('changing');
        void flagEl.offsetWidth; // force reflow
        
        flagEl.classList.add('changing');
        
        setTimeout(() => {
          flagEl.innerHTML = cur.flag;
          flagEl.classList.remove('changing');
        }, 50);
      }
      
      if (codeEl) {
        codeEl.style.opacity = '0';
        setTimeout(() => {
          codeEl.textContent = cur.code;
          codeEl.style.transition = 'opacity 0.2s';
          codeEl.style.opacity = '1';
        }, 100);
      }
      
      if (nameEl) {
        nameEl.style.opacity = '0';
        setTimeout(() => {
          nameEl.textContent = cur.name;
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
        
        const oldResult = previousResult;
        
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null) rate = newRate;
        
        const newResult = (parseFloat(amountEl.value) || 0) * rate;
        animateNumber(resultEl, oldResult, newResult);
        previousResult = newResult;
        
        if (rateFromEl) rateFromEl.textContent = fromCode;
        if (rateValEl) rateValEl.textContent = fmt(rate) + " " + toCode;
      });
    }

    function openPicker(side) {
      pickerTarget = side;
      isPickerOpen = true;
      renderPickerList("");
      
      picker.style.display = 'block';
      requestAnimationFrame(() => {
        picker.classList.add('active');
      });
      
      if (pickerSearch) {
        pickerSearch.value = "";
        setTimeout(() => pickerSearch.focus(), 100);
      }
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
      const filtered = filter
        ? CURRENCIES.filter(c => c.code.toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter))
        : CURRENCIES;
      
      pickerList.innerHTML = filtered.map((c, i) =>
        `<div class="cxs-picker-item" data-code="${c.code}" style="animation-delay: ${i * 0.02}s">
          <span class="cxs-picker-flag">${c.flag}</span>
          <span class="cxs-picker-code">${c.code}</span>
          <span class="cxs-picker-name">${c.name}</span>
        </div>`
      ).join("");
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
        
        const oldResult = previousResult;
        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null) rate = newRate;
        
        const newResult = (parseFloat(amountEl.value) || 0) * rate;
        animateNumber(resultEl, oldResult, newResult);
        previousResult = newResult;
        
        if (rateFromEl) rateFromEl.textContent = fromCode;
        if (rateValEl) rateValEl.textContent = fmt(rate) + " " + toCode;
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
        
        const oldResult = previousResult;
        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null) rate = newRate;
        
        const newResult = (parseFloat(amountEl.value) || 0) * rate;
        animateNumber(resultEl, oldResult, newResult);
        previousResult = newResult;
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
