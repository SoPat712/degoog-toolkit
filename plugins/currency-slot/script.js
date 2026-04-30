(function () {
  const HISTORY_PERIODS = [1, 5, 30, 365, 1825, "max"];
  const historyCache = new Map();
  const historyInFlight = new Map();

  function historyKey(from, to, days) {
    return `${from}|${to}|${days}`;
  }

  function getGroupForDays(days) {
    const numericDays = days === "max" ? 10000 : parseInt(days, 10) || 30;
    if (numericDays > 365) return "month";
    if (numericDays > 90) return "week";
    return "";
  }

  function buildHistoryUrl(from, to, days) {
    let startDate;
    if (days === "max") {
      startDate = "1999-01-04";
    } else {
      const numDays = parseInt(days, 10) || 30;
      const dt = new Date(Date.now() - numDays * 86400000);
      startDate = dt.toISOString().slice(0, 10);
    }
    const group = getGroupForDays(days);
    const groupParam = group ? `&group=${group}` : "";
    return `https://api.frankfurter.dev/v2/rates?from=${startDate}&quotes=${to}&base=${from}${groupParam}`;
  }

  function fmt(n) {
    n = parseFloat(n);
    if (isNaN(n)) return "0";
    if (n >= 1000)
      return n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    if (n >= 1)
      return n.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
  }

  function makeFlag(symbol, code) {
    const display = (symbol || code || "??").slice(0, 3);
    const len = display.length;
    const fs = len <= 1 ? 11 : len <= 2 ? 9 : 8;
    return (
      '<svg viewBox="0 0 20 20" width="20" height="20"><rect width="20" height="20" rx="5" fill="#525252"/><text x="10" y="14" font-size="' +
      fs +
      '" font-weight="600" fill="#e0e0e0" text-anchor="middle" font-family="sans-serif">' +
      display +
      "</text></svg>"
    );
  }

  async function fetchRate(from, to) {
    try {
      const fromIsCrypto = from === "BTC" || from === "ETH";
      const toIsCrypto = to === "BTC" || to === "ETH";

      if (!fromIsCrypto && !toIsCrypto) {
        const res = await fetch(
          `https://api.frankfurter.dev/v2/rate/${from}/${to}`,
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.rate ?? null;
      }

      // Crypto path via CoinGecko
      const coinId =
        (fromIsCrypto ? from : to) === "BTC" ? "bitcoin" : "ethereum";
      const vsCurrency = (fromIsCrypto ? to : from).toLowerCase();
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const price = data[coinId]?.[vsCurrency];
      if (!price) return null;
      // If converting FROM crypto, the price IS the rate (e.g. BTC→USD = 60000)
      // If converting TO crypto, invert (e.g. USD→BTC = 1/60000)
      return fromIsCrypto ? price : 1 / price;
    } catch (e) {
      return null;
    }
  }

  function animateNumber(element, from, to, duration = 600) {
    const startTime = performance.now();
    const startVal = parseFloat(from) || 0;
    const endVal = parseFloat(to) || 0;

    element.classList.add("updating");

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
        setTimeout(() => element.classList.remove("updating"), 800);
      }
    }

    requestAnimationFrame(update);
  }

  function initWrap(wrap) {
    if (wrap.dataset.cxsInit) return;
    wrap.dataset.cxsInit = "1";

    let fromCode =
      wrap.querySelector("#cxs-from-code")?.textContent?.trim() || "USD";
    let toCode =
      wrap.querySelector("#cxs-to-code")?.textContent?.trim() || "EUR";
    const rateValEl = wrap.querySelector("#cxs-rate-val");
    let rate = parseFloat(wrap.dataset.rate) || 1;

    const amountEl = wrap.querySelector("#cxs-amount");
    const resultEl = wrap.querySelector("#cxs-result");
    const rateFromEl = wrap.querySelector("#cxs-rate-from");
    const picker = wrap.querySelector("#cxs-picker");
    const pickerList = wrap.querySelector("#cxs-picker-list");
    const pickerSearch = wrap.querySelector("#cxs-picker-search");

    if (!amountEl || !resultEl) {
      console.warn(
        "[currency-slot] Missing amountEl or resultEl, skipping init",
      );
      return;
    }

    const CURRENCIES = [
      { code: "AED", name: "United Arab Emirates Dirham", symbol: "د.إ" },
      { code: "AFN", name: "Afghan Afghani", symbol: "؋" },
      { code: "ALL", name: "Albanian Lek", symbol: "L" },
      { code: "AMD", name: "Armenian Dram", symbol: "֏" },
      { code: "ANG", name: "Netherlands Antillean Gulden", symbol: "ƒ" },
      { code: "AOA", name: "Angolan Kwanza", symbol: "Kz" },
      { code: "ARS", name: "Argentine Peso", symbol: "$" },
      { code: "AUD", name: "Australian Dollar", symbol: "A$" },
      { code: "AWG", name: "Aruban Florin", symbol: "ƒ" },
      { code: "AZN", name: "Azerbaijani Manat", symbol: "₼" },
      {
        code: "BAM",
        name: "Bosnia and Herzegovina Convertible Mark",
        symbol: "KM",
      },
      { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$" },
      { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
      { code: "BGN", name: "Bulgarian Lev", symbol: "лв" },
      { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
      { code: "BIF", name: "Burundian Franc", symbol: "FBu" },
      { code: "BMD", name: "Bermudian Dollar", symbol: "$" },
      { code: "BND", name: "Brunei Dollar", symbol: "B$" },
      { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs" },
      { code: "BRL", name: "Brazilian Real", symbol: "R$" },
      { code: "BSD", name: "Bahamian Dollar", symbol: "B$" },
      { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu" },
      { code: "BWP", name: "Botswana Pula", symbol: "P" },
      { code: "BYN", name: "Belarusian Ruble", symbol: "Br" },
      { code: "BZD", name: "Belize Dollar", symbol: "BZ$" },
      { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
      { code: "CDF", name: "Congolese Franc", symbol: "FC" },
      { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
      { code: "CLP", name: "Chilean Peso", symbol: "$" },
      { code: "CNH", name: "Chinese Renminbi Yuan Offshore", symbol: "¥" },
      { code: "CNY", name: "Chinese Renminbi Yuan", symbol: "¥" },
      { code: "COP", name: "Colombian Peso", symbol: "$" },
      { code: "CRC", name: "Costa Rican Colón", symbol: "₡" },
      { code: "CUP", name: "Cuban Peso", symbol: "$" },
      { code: "CVE", name: "Cape Verdean Escudo", symbol: "$" },
      { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
      { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj" },
      { code: "DKK", name: "Danish Krone", symbol: "kr" },
      { code: "DOP", name: "Dominican Peso", symbol: "RD$" },
      { code: "DZD", name: "Algerian Dinar", symbol: "د.ج" },
      { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
      { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk" },
      { code: "ETB", name: "Ethiopian Birr", symbol: "Br" },
      { code: "EUR", name: "Euro", symbol: "€" },
      { code: "FJD", name: "Fijian Dollar", symbol: "FJ$" },
      { code: "FKP", name: "Falkland Pound", symbol: "£" },
      { code: "GBP", name: "British Pound", symbol: "£" },
      { code: "GEL", name: "Georgian Lari", symbol: "₾" },
      { code: "GGP", name: "Guernsey Pound", symbol: "£" },
      { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
      { code: "GIP", name: "Gibraltar Pound", symbol: "£" },
      { code: "GMD", name: "Gambian Dalasi", symbol: "D" },
      { code: "GNF", name: "Guinean Franc", symbol: "FG" },
      { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q" },
      { code: "GYD", name: "Guyanese Dollar", symbol: "G$" },
      { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
      { code: "HNL", name: "Honduran Lempira", symbol: "L" },
      { code: "HTG", name: "Haitian Gourde", symbol: "G" },
      { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
      { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
      { code: "ILS", name: "Israeli New Shekel", symbol: "₪" },
      { code: "IMP", name: "Isle of Man Pound", symbol: "£" },
      { code: "INR", name: "Indian Rupee", symbol: "₹" },
      { code: "IQD", name: "Iraqi Dinar", symbol: "ع.د" },
      { code: "IRR", name: "Iranian Rial", symbol: "﷼" },
      { code: "ISK", name: "Icelandic Króna", symbol: "kr" },
      { code: "JEP", name: "Jersey Pound", symbol: "£" },
      { code: "JMD", name: "Jamaican Dollar", symbol: "J$" },
      { code: "JOD", name: "Jordanian Dinar", symbol: "JD" },
      { code: "JPY", name: "Japanese Yen", symbol: "¥" },
      { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
      { code: "KGS", name: "Kyrgyzstani Som", symbol: "сом" },
      { code: "KHR", name: "Cambodian Riel", symbol: "៛" },
      { code: "KMF", name: "Comorian Franc", symbol: "CF" },
      { code: "KRW", name: "South Korean Won", symbol: "₩" },
      { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك" },
      { code: "KYD", name: "Cayman Islands Dollar", symbol: "CI$" },
      { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸" },
      { code: "LAK", name: "Lao Kip", symbol: "₭" },
      { code: "LBP", name: "Lebanese Pound", symbol: "ل.ل" },
      { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
      { code: "LRD", name: "Liberian Dollar", symbol: "L$" },
      { code: "LSL", name: "Lesotho Loti", symbol: "L" },
      { code: "LYD", name: "Libyan Dinar", symbol: "LD" },
      { code: "MAD", name: "Moroccan Dirham", symbol: "MAD" },
      { code: "MDL", name: "Moldovan Leu", symbol: "L" },
      { code: "MGA", name: "Malagasy Ariary", symbol: "Ar" },
      { code: "MKD", name: "Macedonian Denar", symbol: "ден" },
      { code: "MMK", name: "Myanmar Kyat", symbol: "K" },
      { code: "MNT", name: "Mongolian Tögrög", symbol: "₮" },
      { code: "MOP", name: "Macanese Pataca", symbol: "MOP$" },
      { code: "MRO", name: "Mauritanian Ouguiya", symbol: "UM" },
      { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM" },
      { code: "MUR", name: "Mauritian Rupee", symbol: "₨" },
      { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf" },
      { code: "MWK", name: "Malawian Kwacha", symbol: "MK" },
      { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
      { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
      { code: "MZN", name: "Mozambican Metical", symbol: "MT" },
      { code: "NAD", name: "Namibian Dollar", symbol: "N$" },
      { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
      { code: "NIO", name: "Nicaraguan Córdoba", symbol: "C$" },
      { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
      { code: "NPR", name: "Nepalese Rupee", symbol: "₨" },
      { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
      { code: "OMR", name: "Omani Rial", symbol: "ر.ع." },
      { code: "PAB", name: "Panamanian Balboa", symbol: "B/." },
      { code: "PEN", name: "Peruvian Sol", symbol: "S/." },
      { code: "PGK", name: "Papua New Guinean Kina", symbol: "K" },
      { code: "PHP", name: "Philippine Peso", symbol: "₱" },
      { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
      { code: "PLN", name: "Polish Złoty", symbol: "zł" },
      { code: "PYG", name: "Paraguayan Guaraní", symbol: "₲" },
      { code: "QAR", name: "Qatari Riyal", symbol: "QR" },
      { code: "RON", name: "Romanian Leu", symbol: "lei" },
      { code: "RSD", name: "Serbian Dinar", symbol: "din" },
      { code: "RUB", name: "Russian Ruble", symbol: "₽" },
      { code: "RWF", name: "Rwandan Franc", symbol: "RF" },
      { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
      { code: "SBD", name: "Solomon Islands Dollar", symbol: "SI$" },
      { code: "SCR", name: "Seychellois Rupee", symbol: "₨" },
      { code: "SDG", name: "Sudanese Pound", symbol: "ج.س." },
      { code: "SEK", name: "Swedish Krona", symbol: "kr" },
      { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
      { code: "SHP", name: "Saint Helenian Pound", symbol: "£" },
      { code: "SLE", name: "New Leone", symbol: "Le" },
      { code: "SOS", name: "Somali Shilling", symbol: "Sh" },
      { code: "SRD", name: "Surinamese Dollar", symbol: "$" },
      { code: "SSP", name: "South Sudanese Pound", symbol: "£" },
      { code: "STN", name: "São Tomé and Príncipe Dobra", symbol: "Db" },
      { code: "SVC", name: "Salvadoran Colón", symbol: "₡" },
      { code: "SYP", name: "Syrian Pound", symbol: "£S" },
      { code: "SZL", name: "Swazi Lilangeni", symbol: "E" },
      { code: "THB", name: "Thai Baht", symbol: "฿" },
      { code: "TJS", name: "Tajikistani Somoni", symbol: "SM" },
      { code: "TMT", name: "Turkmenistani Manat", symbol: "T" },
      { code: "TND", name: "Tunisian Dinar", symbol: "د.ت" },
      { code: "TOP", name: "Tongan Paʻanga", symbol: "T$" },
      { code: "TRY", name: "Turkish Lira", symbol: "₺" },
      { code: "TTD", name: "Trinidad and Tobago Dollar", symbol: "TT$" },
      { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
      { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh" },
      { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
      { code: "UGX", name: "Ugandan Shilling", symbol: "USh" },
      { code: "USD", name: "United States Dollar", symbol: "$" },
      { code: "UYU", name: "Uruguayan Peso", symbol: "$U" },
      { code: "UZS", name: "Uzbekistan Som", symbol: "сўм" },
      { code: "VES", name: "Venezuelan Bolívar Soberano", symbol: "Bs.S" },
      { code: "VND", name: "Vietnamese Đồng", symbol: "₫" },
      { code: "VUV", name: "Vanuatu Vatu", symbol: "VT" },
      { code: "WST", name: "Samoan Tala", symbol: "WS$" },
      { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA" },
      { code: "XAG", name: "Silver (Troy Ounce)", symbol: "XAG" },
      { code: "XAU", name: "Gold (Troy Ounce)", symbol: "XAU" },
      { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$" },
      { code: "XCG", name: "Caribbean Guilder", symbol: "CMg" },
      { code: "XDR", name: "Special Drawing Rights", symbol: "SDR" },
      { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
      { code: "XPD", name: "Palladium", symbol: "XPD" },
      { code: "XPF", name: "CFP Franc", symbol: "₣" },
      { code: "XPT", name: "Platinum", symbol: "XPT" },
      { code: "YER", name: "Yemeni Rial", symbol: "﷼" },
      { code: "ZAR", name: "South African Rand", symbol: "R" },
      { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK" },
      { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZiG" },
      { code: "BTC", name: "Bitcoin", symbol: "₿" },
      { code: "ETH", name: "Ethereum", symbol: "Ξ" },
    ];

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
      const cur = CURRENCIES.find((c) => c.code === code);
      if (!cur) console.warn("[currency-slot] Currency not found:", code);

      const flagEl = wrap.querySelector("#cxs-" + side + "-flag");
      const codeEl = wrap.querySelector("#cxs-" + side + "-code");
      const nameEl = wrap.querySelector("#cxs-" + side + "-name");

      if (flagEl) {
        flagEl.classList.remove("changing");
        void flagEl.offsetWidth; // force reflow

        flagEl.classList.add("changing");

        setTimeout(() => {
          flagEl.innerHTML = makeFlag(cur?.symbol || code.slice(0, 2), code);
          flagEl.classList.remove("changing");
        }, 50);
      }

      if (codeEl) {
        codeEl.style.opacity = "0";
        setTimeout(() => {
          codeEl.textContent = code;
          codeEl.style.transition = "opacity 0.2s";
          codeEl.style.opacity = "1";
        }, 100);
      }

      if (nameEl) {
        nameEl.style.opacity = "0";
        setTimeout(() => {
          nameEl.textContent = cur?.name || code;
          nameEl.style.transition = "opacity 0.2s";
          nameEl.style.opacity = "1";
        }, 150);
      }
    }

    previousResult = (parseFloat(amountEl.value) || 1) * rate;

    amountEl.addEventListener("input", () => updateResult(false));
    amountEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        updateResult(true);
      }
    });

    wrap.querySelectorAll(".cxs-q").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        btn.style.transform = "scale(0.95)";
        setTimeout(() => (btn.style.transform = ""), 100);
        amountEl.value = btn.dataset.v;
        updateResult(true);
      });
    });

    const swapBtn = wrap.querySelector("#cxs-swap");
    if (swapBtn) {
      swapBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();

        swapBtn.classList.add("spinning");
        setTimeout(() => swapBtn.classList.remove("spinning"), 500);

        [fromCode, toCode] = [toCode, fromCode];

        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        showChartLoading();

        // Invert the current rate as an immediate fallback
        rate = rate !== 0 ? 1 / rate : 1;
        updateResult(true);

        // Then fetch the live rate and update again if it differs
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null && newRate !== rate) {
          rate = newRate;
          updateResult(true);
        }

        if (chartBody) loadChart(currentDays);
      });
    }

    function openPicker(side) {
      pickerTarget = side;
      isPickerOpen = true;
      renderPickerList("");

      picker.style.display = "block";
      requestAnimationFrame(() => {
        picker.classList.add("active");
      });

      if (pickerSearch) {
        pickerSearch.value = "";
        setTimeout(() => pickerSearch.focus(), 100);
      }
    }

    function closePicker() {
      if (!isPickerOpen) return;
      isPickerOpen = false;
      picker.classList.remove("active");

      setTimeout(() => {
        if (!isPickerOpen) {
          picker.style.display = "none";
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
        ? CURRENCIES.filter(
            (c) =>
              c.code.toLowerCase().includes(filter) ||
              c.name.toLowerCase().includes(filter),
          )
        : CURRENCIES;

      // Split into selected and others
      const selected = filtered.filter((c) => c.code === selectedCode);
      const others = filtered.filter((c) => c.code !== selectedCode);

      // Combine: selected first, then others
      const sorted = [...selected, ...others];

      pickerList.innerHTML = sorted
        .map((c, i) => {
          const isSelected = c.code === selectedCode;
          return `<div class="cxs-picker-item${isSelected ? " cxs-picker-item--selected" : ""}" data-code="${c.code}" style="animation-delay: ${i * 0.02}s">
          <span class="cxs-picker-flag">${makeFlag(c.symbol, c.code)}</span>
          <div class="cxs-picker-info">
            <span class="cxs-picker-name">${c.name}</span>
            <span class="cxs-picker-code">${c.code}</span>
          </div>
          ${isSelected ? '<span class="cxs-picker-checkmark">✓</span>' : ""}
        </div>`;
        })
        .join("");
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
        showChartLoading();

        // Fetch the live rate for the new currency pair
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null) rate = newRate;
        updateResult(true);

        if (chartBody) loadChart(currentDays);
      });
    }

    const pairsContainer = wrap.querySelector("#cxs-pairs");
    if (pairsContainer) {
      pairsContainer.addEventListener("click", async (e) => {
        const pair = e.target.closest(".cxs-pair");
        if (!pair) return;

        pair.style.transform = "scale(0.95)";
        setTimeout(() => (pair.style.transform = ""), 100);

        fromCode = pair.dataset.from;
        toCode = pair.dataset.to;

        // Reset amount to 1
        amountEl.value = "1";

        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);
        showChartLoading();

        // Use the rate displayed on the pair card as an immediate fallback
        const pairRateEl = pair.querySelector(".cxs-pair-rate");
        const cardRate = pairRateEl
          ? parseFloat(pairRateEl.textContent.replace(/[^0-9.]/g, ""))
          : null;
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

        if (chartBody) loadChart(currentDays);
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

    /* ── Chart ── */
    const chartBody = wrap.querySelector("#cxs-chart-body");
    const chartStats = wrap.querySelector("#cxs-chart-stats");
    const chartTitle = wrap.querySelector("#cxs-chart-title");
    let currentDays = 30;
    let prefetchTimer = null;
    let chartRequestId = 0;

    function showChartLoading() {
      if (!chartBody) return;
      if (chartTitle) chartTitle.textContent = fromCode + " / " + toCode;
      chartBody.innerHTML = '<div class="cxs-chart-loading">Loading chart...</div>';
      if (chartStats) chartStats.innerHTML = "";
    }

    function prefetchHistory(from, to, activeDays) {
      const periods = HISTORY_PERIODS.filter((p) => p !== activeDays);
      for (const period of periods) {
        fetchHistory(from, to, period);
      }
    }

    function schedulePrefetch() {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchHistory(fromCode, toCode, currentDays);
      }, 60);
    }

    async function loadChart(days) {
      currentDays = days;
      const requestId = ++chartRequestId;
      const activeFrom = fromCode;
      const activeTo = toCode;
      showChartLoading();
      const data = await fetchHistory(activeFrom, activeTo, days);
      if (requestId !== chartRequestId) return;
      renderChart(chartBody, chartStats, data, activeFrom, activeTo, days);
      schedulePrefetch();
    }

    wrap.querySelectorAll(".cxs-period").forEach((btn) => {
      btn.addEventListener("click", () => {
        wrap
          .querySelectorAll(".cxs-period")
          .forEach((b) => b.classList.remove("cxs-period--active"));
        btn.classList.add("cxs-period--active");
        loadChart(
          btn.dataset.days === "max" ? "max" : parseInt(btn.dataset.days, 10),
        );
      });
    });

    if (chartBody) loadChart(30);
  }

  async function fetchHistory(from, to, days) {
    try {
      if (from === "BTC" || from === "ETH" || to === "BTC" || to === "ETH")
        return null;
      const key = historyKey(from, to, days);
      if (historyCache.has(key)) return historyCache.get(key);
      if (historyInFlight.has(key)) return historyInFlight.get(key);

      const req = (async () => {
        const res = await fetch(buildHistoryUrl(from, to, days));
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data)) return null;
        const normalized = data.map((d) => ({ date: d.date, rate: d.rate }));
        historyCache.set(key, normalized);
        return normalized;
      })();

      historyInFlight.set(key, req);
      try {
        return await req;
      } finally {
        historyInFlight.delete(key);
      }
    } catch (e) {
      return null;
    }
  }

  function renderChart(
    container,
    statsContainer,
    data,
    fromCode,
    toCode,
    days,
  ) {
    if (!container) return;
    if (!data || data.length < 2) {
      container.innerHTML =
        '<div style="padding:1rem;text-align:center;color:var(--text-secondary);font-size:0.85rem;">No chart data available for this pair</div>';
      if (statsContainer) statsContainer.innerHTML = "";
      return;
    }

    /* ── helpers ── */
    function fmtRate(n) {
      return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
    }

    var numericDays = days === "max" ? 10000 : parseInt(days, 10) || 30;

    function fmtDate(dateStr) {
      var d = new Date(dateStr);
      var months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      if (numericDays <= 5) return months[d.getMonth()] + " " + d.getDate();
      if (numericDays <= 365) return months[d.getMonth()] + " " + d.getDate();
      return months[d.getMonth()] + " " + d.getFullYear().toString().slice(2);
    }

    function buildPath(points) {
      if (!points.length) return "";
      var d = "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
      for (var i = 1; i < points.length; i++) {
        var p0 = points[i - 1];
        var p1 = points[i];
        var cx = (p0.x + p1.x) / 2;
        d +=
          " C " +
          cx.toFixed(2) +
          " " +
          p0.y.toFixed(2) +
          ", " +
          cx.toFixed(2) +
          " " +
          p1.y.toFixed(2) +
          ", " +
          p1.x.toFixed(2) +
          " " +
          p1.y.toFixed(2);
      }
      return d;
    }

    var svgNS = "http://www.w3.org/2000/svg";
    function svgEl(tag) {
      return document.createElementNS(svgNS, tag);
    }
    function setAttrs(el, attrs) {
      for (var k in attrs)
        if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
      return el;
    }

    /* ── data stats ── */
    var rates = data.map(function (d) {
      return d.rate;
    });
    var min = Math.min.apply(null, rates);
    var max = Math.max.apply(null, rates);
    var avg =
      rates.reduce(function (a, b) {
        return a + b;
      }, 0) / rates.length;
    var change = rates[rates.length - 1] - rates[0];
    var changePercent = (change / rates[0]) * 100;

    /* ── layout ── */
    var W = container.clientWidth || 400;
    var H = 200;
    var padL = 60,
      padR = 10,
      padT = 15,
      padB = 30;
    var chartW = W - padL - padR;
    var chartH = H - padT - padB;
    var range = max - min || 1;

    /* ── compute point coords ── */
    var pts = rates.map(function (r, i) {
      return {
        x: padL + (i / (rates.length - 1)) * chartW,
        y: padT + chartH - ((r - min) / range) * chartH,
      };
    });

    /* ── clear container, set up relative positioning for tooltip ── */
    container.innerHTML = "";
    container.style.position = "relative";

    /* ── SVG ── */
    var svg = svgEl("svg");
    setAttrs(svg, {
      viewBox: "0 0 " + W + " " + H,
      preserveAspectRatio: "xMidYMid meet",
      class: "cxs-chart-svg",
      width: "100%",
      height: "100%",
    });

    /* gradient def */
    var defs = svgEl("defs");
    var grad = svgEl("linearGradient");
    setAttrs(grad, { id: "cxs-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
    var stop1 = svgEl("stop");
    setAttrs(stop1, {
      offset: "0%",
      "stop-color": "var(--primary, #6c8cff)",
      "stop-opacity": "0.3",
    });
    var stop2 = svgEl("stop");
    setAttrs(stop2, {
      offset: "100%",
      "stop-color": "var(--primary, #6c8cff)",
      "stop-opacity": "0",
    });
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    /* ── 1. Horizontal grid lines + Y-axis labels (4 lines) ── */
    for (var gi = 0; gi < 4; gi++) {
      var frac = gi / 3;
      var yVal = min + frac * range;
      var yPx = padT + chartH - frac * chartH;

      var gridLine = svgEl("line");
      setAttrs(gridLine, {
        x1: padL,
        y1: yPx.toFixed(2),
        x2: W - padR,
        y2: yPx.toFixed(2),
        class: "cxs-chart-grid-line",
      });
      svg.appendChild(gridLine);

      var yLabel = svgEl("text");
      setAttrs(yLabel, {
        x: padL - 8,
        y: (yPx + 4).toFixed(2),
        class: "cxs-chart-y-label",
        "text-anchor": "end",
      });
      yLabel.textContent = fmtRate(yVal);
      svg.appendChild(yLabel);
    }

    /* ── 2. X-axis date labels ── */
    var xStep = Math.max(1, Math.floor(data.length / 6));
    for (var xi = 0; xi < data.length; xi += xStep) {
      var xLabel = svgEl("text");
      setAttrs(xLabel, {
        x: pts[xi].x.toFixed(2),
        y: (H - 6).toFixed(2),
        class: "cxs-chart-x-label",
        "text-anchor": "middle",
      });
      xLabel.textContent = fmtDate(data[xi].date);
      svg.appendChild(xLabel);
    }
    /* always show last label if not already included */
    var lastIdx = data.length - 1;
    if (lastIdx % xStep !== 0) {
      var lastLabel = svgEl("text");
      setAttrs(lastLabel, {
        x: pts[lastIdx].x.toFixed(2),
        y: (H - 6).toFixed(2),
        class: "cxs-chart-x-label",
        "text-anchor": "middle",
      });
      lastLabel.textContent = fmtDate(data[lastIdx].date);
      svg.appendChild(lastLabel);
    }

    /* ── 3. Smooth line + area fill ── */
    var linePath = buildPath(pts);

    /* area fill: close path down to baseline */
    var areaPath =
      linePath +
      " L " +
      pts[pts.length - 1].x.toFixed(2) +
      " " +
      (padT + chartH).toFixed(2) +
      " L " +
      pts[0].x.toFixed(2) +
      " " +
      (padT + chartH).toFixed(2) +
      " Z";

    var fillEl = svgEl("path");
    setAttrs(fillEl, {
      d: areaPath,
      class: "cxs-chart-fill",
      fill: "url(#cxs-grad)",
    });
    svg.appendChild(fillEl);

    var lineEl = svgEl("path");
    setAttrs(lineEl, { d: linePath, class: "cxs-chart-line" });
    svg.appendChild(lineEl);

    /* ── 5. Hover highlight group (guide line + dot) ── */
    var hlGroup = svgEl("g");
    hlGroup.setAttribute("class", "cxs-chart-hl");
    hlGroup.style.display = "none";

    var hlLine = svgEl("line");
    setAttrs(hlLine, {
      x1: 0,
      y1: padT,
      x2: 0,
      y2: padT + chartH,
      class: "cxs-chart-hl-line",
    });
    hlGroup.appendChild(hlLine);

    var hlDot = svgEl("circle");
    setAttrs(hlDot, { cx: 0, cy: 0, r: 4, class: "cxs-chart-hl-dot" });
    hlGroup.appendChild(hlDot);

    svg.appendChild(hlGroup);

    /* ── 4. Invisible hit zones for hover ── */
    var hitW = chartW / data.length;
    for (var hi = 0; hi < data.length; hi++) {
      var hitRect = svgEl("rect");
      setAttrs(hitRect, {
        x: (pts[hi].x - hitW / 2).toFixed(2),
        y: padT,
        width: hitW.toFixed(2),
        height: chartH,
        class: "cxs-chart-hit",
        "data-i": hi,
      });
      svg.appendChild(hitRect);
    }

    container.appendChild(svg);

    /* ── 6. HTML tooltip ── */
    var tooltip = container.querySelector(".cxs-chart-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "cxs-chart-tooltip";
      container.appendChild(tooltip);
    }
    tooltip.style.display = "none";

    function drawHighlight(i) {
      hlGroup.style.display = "";
      hlLine.setAttribute("x1", pts[i].x.toFixed(2));
      hlLine.setAttribute("x2", pts[i].x.toFixed(2));
      hlDot.setAttribute("cx", pts[i].x.toFixed(2));
      hlDot.setAttribute("cy", pts[i].y.toFixed(2));
    }

    function clearHighlight() {
      hlGroup.style.display = "none";
    }

    function showTooltip(i, evt) {
      var rate = data[i].rate;
      tooltip.innerHTML =
        '<div class="cxs-tt-date">' +
        fmtDate(data[i].date) +
        "</div>" +
        '<div class="cxs-tt-rate">1 ' +
        fromCode +
        " = " +
        fmtRate(rate) +
        " " +
        toCode +
        "</div>";
      tooltip.style.display = "";
      tooltip.classList.add("cxs-chart-tooltip--visible");

      /* position relative to container */
      var containerRect = container.getBoundingClientRect();
      var svgRect = svg.getBoundingClientRect();
      var scaleX = svgRect.width / W;
      var pixelX = svgRect.left - containerRect.left + pts[i].x * scaleX;
      var ttW = tooltip.offsetWidth || 100;
      var left = pixelX - ttW / 2;
      /* clamp */
      if (left < 0) left = 0;
      if (left + ttW > containerRect.width) left = containerRect.width - ttW;
      tooltip.style.left = left + "px";
      tooltip.style.top = "0px";
    }

    function hideTooltip() {
      tooltip.style.display = "none";
      tooltip.classList.remove("cxs-chart-tooltip--visible");
    }

    /* attach events to hit zones */
    svg.querySelectorAll(".cxs-chart-hit").forEach(function (rect) {
      rect.addEventListener("mouseenter", function (e) {
        var i = parseInt(rect.getAttribute("data-i"), 10);
        drawHighlight(i);
        showTooltip(i, e);
      });
      rect.addEventListener("mousemove", function (e) {
        var i = parseInt(rect.getAttribute("data-i"), 10);
        showTooltip(i, e);
      });
    });

    container.addEventListener("mouseleave", function () {
      clearHighlight();
      hideTooltip();
    });

    /* ── 7. Stats section ── */
    if (statsContainer) {
      var sign = change >= 0 ? "+" : "";
      var dirClass =
        change >= 0 ? "cxs-stat-value--up" : "cxs-stat-value--down";
      statsContainer.innerHTML =
        '<div class="cxs-stat">' +
        '<span class="cxs-stat-label">Low</span>' +
        '<span class="cxs-stat-value">' +
        fmtRate(min) +
        "</span>" +
        "</div>" +
        '<div class="cxs-stat">' +
        '<span class="cxs-stat-label">High</span>' +
        '<span class="cxs-stat-value">' +
        fmtRate(max) +
        "</span>" +
        "</div>" +
        '<div class="cxs-stat">' +
        '<span class="cxs-stat-label">Average</span>' +
        '<span class="cxs-stat-value">' +
        fmtRate(avg) +
        "</span>" +
        "</div>" +
        '<div class="cxs-stat">' +
        '<span class="cxs-stat-label">Change</span>' +
        '<span class="cxs-stat-value ' +
        dirClass +
        '">' +
        sign +
        changePercent.toFixed(2) +
        "%</span>" +
        "</div>";
    }
  }

  function scan() {
    document
      .querySelectorAll(".cxs-wrap:not([data-cxs-init])")
      .forEach(initWrap);
  }

  new MutationObserver(scan).observe(document.body, {
    childList: true,
    subtree: true,
  });
  scan();
})();
