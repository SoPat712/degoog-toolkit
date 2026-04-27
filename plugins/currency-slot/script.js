(function () {
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

        // Invert the current rate as an immediate fallback
        rate = rate !== 0 ? 1 / rate : 1;
        updateResult(true);

        // Then fetch the live rate and update again if it differs
        const newRate = await fetchRate(fromCode, toCode);
        if (newRate !== null && newRate !== rate) {
          rate = newRate;
          updateResult(true);
        }
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

        pair.style.transform = "scale(0.95)";
        setTimeout(() => (pair.style.transform = ""), 100);

        fromCode = pair.dataset.from;
        toCode = pair.dataset.to;

        // Reset amount to 1
        amountEl.value = "1";

        updateCurUI("from", fromCode);
        updateCurUI("to", toCode);

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
