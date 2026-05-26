(function () {
  "use strict";

  const activeAnimations = new WeakMap();

  const YES_MESSAGES = [
    "Absolutely!",
    "Yes, definitely!",
    "It is certain.",
    "Without a doubt!",
    "Outlook good.",
    "Most likely!",
    "Signs point to yes."
  ];

  const NO_MESSAGES = [
    "No way!",
    "Maybe next time.",
    "Don't count on it.",
    "My sources say no.",
    "Very doubtful.",
    "Outlook not so good.",
    "Absolutely not!"
  ];

  function initAll(root) {
    const scope = root || document;
    scope
      .querySelectorAll(
        ".undecideds-slot[data-undecideds-slot]:not([data-undecideds-init])",
      )
      .forEach(initSlot);
  }

  function initSlot(slot) {
    slot.dataset.undecidedsInit = "1";

    // 1. Tab switching setup
    const tabs = Array.from(slot.querySelectorAll(".undecideds-slot__tab-btn"));
    const panels = Array.from(slot.querySelectorAll(".undecideds-slot__panel"));
    initTabScroller(slot);
    
    function switchTab(targetTab) {
      slot.dataset.activeTab = targetTab;
      tabs.forEach(btn => {
        const isActive = btn.dataset.tab === targetTab;
        btn.setAttribute("aria-selected", String(isActive));
        if (isActive) {
          btn.classList.add("is-active");
        } else {
          btn.classList.remove("is-active");
        }
      });
      panels.forEach(panel => {
        const isTarget = panel.dataset.panel === targetTab;
        if (isTarget) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "");
        }
      });
      scrollActiveTabIntoView(slot);
      updateTabScrollNav(slot);
    }

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Initialize to parsed active tab
    const initialTab = slot.dataset.activeTab || "coin";
    switchTab(initialTab);

    // 2. Coin Flip Logic
    initCoinFlip(slot);

    // 3. Roll Die Logic
    initRollDie(slot);

    // 4. Pick Number Logic
    initPickNumber(slot);

    // 5. Yes or No Logic
    initYesNo(slot);
  }

  // --- COIN FLIP ---
  function initCoinFlip(slot) {
    const btn = slot.querySelector("[data-coin-flip-btn]");
    const coin = slot.querySelector("[data-coin-element]");
    if (!btn || !coin) return;

    btn.addEventListener("click", () => {
      const result = Math.random() < 0.5 ? "heads" : "tails";
      animateCoinFlip(slot, result);
    });

    // Initial pose
    const initialResult = coin.dataset.side || "heads";
    setCoinPose(coin, initialResult);
  }

  function animateCoinFlip(slot, result) {
    clearAnimation(slot);

    const coin = slot.querySelector("[data-coin-element]");
    const title = slot.querySelector("[data-coin-result-text]");
    const ticker = slot.querySelector("[data-coin-ticker]");
    const btn = slot.querySelector("[data-coin-flip-btn]");
    const faces = Array.from(slot.querySelectorAll(".undecideds-slot__coin-face"));

    if (!coin || !title || !ticker || !btn) return;

    if (prefersReducedMotion()) {
      landCoin(slot, result);
      return;
    }

    const flips = 6 + randomInt(4);
    const start = coin.dataset.side === "tails" ? 180 : 0;
    const target = result === "tails" ? 180 : 0;
    const finish = finishAngle(start, target, flips);
    const duration = 1200 + flips * 80;

    btn.disabled = true;
    title.textContent = "Flipping...";
    ticker.textContent = "spinning";
    coin.dataset.side = "spinning";

    const state = { frameId: 0 };
    activeAnimations.set(slot, state);
    const startTime = performance.now();

    function frame(now) {
      if (activeAnimations.get(slot) !== state) return;

      const t = Math.min((now - startTime) / duration, 1);
      const yProgress = easeOutRamp(t);
      const yDegrees = start + (finish - start) * yProgress;
      
      const lift = Math.sin(Math.PI * t);
      const xDegrees = -7 + lift * 25;
      const yOffset = -lift * 40;
      const brightness = 0.95 + lift * 0.15;

      coin.style.transform = `translateY(${yOffset}px) rotateX(${xDegrees}deg) rotateY(${yDegrees}deg)`;
      
      faces.forEach(face => {
        face.style.filter = `brightness(${brightness.toFixed(3)})`;
      });

      if (t < 1) {
        state.frameId = requestAnimationFrame(frame);
      } else {
        activeAnimations.delete(slot);
        landCoin(slot, result);
      }
    }

    state.frameId = requestAnimationFrame(frame);
  }

  function landCoin(slot, result) {
    const coin = slot.querySelector("[data-coin-element]");
    const title = slot.querySelector("[data-coin-result-text]");
    const ticker = slot.querySelector("[data-coin-ticker]");
    const btn = slot.querySelector("[data-coin-flip-btn]");

    if (coin) {
      coin.dataset.side = result;
      setCoinPose(coin, result);
    }
    if (title) title.textContent = result === "heads" ? "Heads" : "Tails";
    if (ticker) ticker.textContent = "landed " + result;
    if (btn) btn.disabled = false;
  }

  function setCoinPose(coin, result) {
    const deg = result === "tails" ? 180 : 0;
    coin.style.transform = `translateY(0) rotateX(-7deg) rotateY(${deg}deg)`;
    const faces = coin.querySelectorAll(".undecideds-slot__coin-face");
    faces.forEach(face => { face.style.filter = ""; });
  }

  // --- ROLL DIE ---
  function initRollDie(slot) {
    const btn = slot.querySelector("[data-dice-roll-btn]");
    const toggleD6 = slot.querySelector('[data-select-dice="d6"]');
    const toggleD20 = slot.querySelector('[data-select-dice="d20"]');
    const d6Element = slot.querySelector("[data-die-d6-element]");
    const d20Element = slot.querySelector("[data-die-d20-element]");

    if (!btn) return;

    let activeType = slot.dataset.dieType || "d6";

    function updateDieSelector(type) {
      activeType = type;
      slot.dataset.dieType = type;
      
      if (toggleD6 && toggleD20) {
        toggleD6.classList.toggle("is-active", type === "d6");
        toggleD6.setAttribute("aria-pressed", String(type === "d6"));
        toggleD20.classList.toggle("is-active", type === "d20");
        toggleD20.setAttribute("aria-pressed", String(type === "d20"));
      }

      if (d6Element && d20Element) {
        if (type === "d6") {
          d6Element.removeAttribute("hidden");
          d6Element.style.display = "block";
          d20Element.setAttribute("hidden", "");
          d20Element.style.display = "none";
        } else {
          d20Element.removeAttribute("hidden");
          d20Element.style.display = "block";
          d6Element.setAttribute("hidden", "");
          d6Element.style.display = "none";
        }
      }
    }

    if (toggleD6) toggleD6.addEventListener("click", () => updateDieSelector("d6"));
    if (toggleD20) toggleD20.addEventListener("click", () => updateDieSelector("d20"));

    // Initial select
    updateDieSelector(activeType);

    btn.addEventListener("click", () => {
      if (activeType === "d6") {
        const result = randomInt(6) + 1;
        rollD6(slot, result);
      } else {
        const result = randomInt(20) + 1;
        rollD20(slot, result);
      }
    });

    // Initial pose for D6
    if (d6Element) {
      const initialFace = parseInt(d6Element.dataset.face || "1", 10);
      setD6Pose(d6Element, initialFace);
    }
  }

  function setD6Pose(die, face) {
    const faceAngles = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: -90 },
      3: { x: -90, y: 0 },
      4: { x: 90, y: 0 },
      5: { x: 0, y: 90 },
      6: { x: 180, y: 0 }
    };
    const angle = faceAngles[face] || { x: 0, y: 0 };
    const tilt = idleD6Tilt(face);
    die.style.transform = `rotateX(${angle.x + tilt.x}deg) rotateY(${angle.y + tilt.y}deg) rotateZ(${tilt.z}deg)`;
  }

  function idleD6Tilt(face) {
    const oddTilt = face % 2 === 0 ? -1 : 1;
    return {
      x: oddTilt * 12,
      y: oddTilt * -14,
      z: oddTilt * 3
    };
  }

  function rollD6(slot, result) {
    const die = slot.querySelector("[data-die-d6-element]");
    const title = slot.querySelector("[data-dice-result-text]");
    const ticker = slot.querySelector("[data-dice-ticker]");
    const btn = slot.querySelector("[data-dice-roll-btn]");

    if (!die || !title || !ticker || !btn) return;

    btn.disabled = true;
    title.textContent = "Rolling...";
    ticker.textContent = "rolling";

    if (prefersReducedMotion()) {
      die.dataset.face = String(result);
      setD6Pose(die, result);
      title.textContent = `Rolled ${result}`;
      ticker.textContent = `landed ${result}`;
      btn.disabled = false;
      return;
    }

    const faceAngles = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: -90 },
      3: { x: -90, y: 0 },
      4: { x: 90, y: 0 },
      5: { x: 0, y: 90 },
      6: { x: 180, y: 0 }
    };

    const targetAngle = faceAngles[result];
    const extraRotations = 3 + randomInt(3);
    const targetX = extraRotations * 360 + targetAngle.x;
    const targetY = extraRotations * 360 + targetAngle.y;
    // Add random Z tilt for extra realism
    const targetZ = randomInt(45) - 22;

    die.style.transition = "transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1.05)";
    die.style.transform = `rotateX(${targetX}deg) rotateY(${targetY}deg) rotateZ(${targetZ}deg)`;

    setTimeout(() => {
      die.style.transition = "";
      die.dataset.face = String(result);
      setD6Pose(die, result);
      title.textContent = `Rolled ${result}`;
      ticker.textContent = `landed ${result}`;
      btn.disabled = false;
    }, 1200);
  }

  function rollD20(slot, result) {
    const d20 = slot.querySelector("[data-die-d20-element]");
    const textVal = slot.querySelector("[data-d20-text-value]");
    const title = slot.querySelector("[data-dice-result-text]");
    const ticker = slot.querySelector("[data-dice-ticker]");
    const btn = slot.querySelector("[data-dice-roll-btn]");

    if (!d20 || !textVal || !title || !ticker || !btn) return;

    btn.disabled = true;
    title.textContent = "Rolling...";
    ticker.textContent = "rolling";

    if (prefersReducedMotion()) {
      textVal.textContent = String(result);
      title.textContent = `Rolled ${result}`;
      ticker.textContent = `landed ${result}`;
      btn.disabled = false;
      return;
    }

    // Spin SVG in 3D space
    d20.style.transition = "transform 1.2s cubic-bezier(0.15, 0.85, 0.35, 1.05)";
    // Rotate on multiple axes
    d20.style.transform = "rotate3d(1, 2.5, -1.5, 720deg) scale(0.9)";

    // Flash numbers in the center
    let flashes = 0;
    const interval = setInterval(() => {
      textVal.textContent = String(randomInt(20) + 1);
      flashes++;
      if (flashes >= 16) {
        clearInterval(interval);
        textVal.textContent = String(result);
      }
    }, 60);

    setTimeout(() => {
      d20.style.transition = "";
      d20.style.transform = "rotate3d(0, 0, 0, 0deg) scale(1)";
      title.textContent = `Rolled ${result}`;
      ticker.textContent = `landed ${result}`;
      btn.disabled = false;
    }, 1200);
  }

  // --- PICK NUMBER ---
  function initPickNumber(slot) {
    const minInput = slot.querySelector("[data-num-min-val]");
    const maxInput = slot.querySelector("[data-num-max-val]");
    const btn = slot.querySelector("[data-num-pick-btn]");
    const roller = slot.querySelector("[data-number-roller-container]");

    if (!btn || !roller) return;

    // Render initial boxed number
    const initialVal = roller.dataset.initialVal || "42";
    renderStaticNumber(roller, initialVal);

    btn.addEventListener("click", () => {
      let min = parseInt(minInput.value, 10);
      let max = parseInt(maxInput.value, 10);

      if (isNaN(min)) min = 1;
      if (isNaN(max)) max = 100;

      if (min > max) {
        const temp = min;
        min = max;
        max = temp;
        minInput.value = min;
        maxInput.value = max;
      }

      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      rollNumber(slot, result, min, max);
    });
  }

  function renderStaticNumber(roller, val) {
    roller.innerHTML = "";
    const str = String(val);
    const digits = str.split("");
    digits.forEach(digit => {
      const slotDiv = document.createElement("div");
      slotDiv.className = "undecideds-slot__digit-slot";
      if (digit === "-") {
        slotDiv.className += " undecideds-slot__digit-slot--static";
        slotDiv.innerHTML = "<span>-</span>";
      } else {
        const stripDiv = document.createElement("div");
        stripDiv.className = "undecideds-slot__digit-strip";
        const span = document.createElement("span");
        span.textContent = digit;
        stripDiv.appendChild(span);
        slotDiv.appendChild(stripDiv);
      }
      roller.appendChild(slotDiv);
    });
  }

  function rollNumber(slot, result, min, max) {
    const roller = slot.querySelector("[data-number-roller-container]");
    const title = slot.querySelector("[data-num-result-text]");
    const ticker = slot.querySelector("[data-num-ticker]");
    const btn = slot.querySelector("[data-num-pick-btn]");

    if (!roller || !title || !ticker || !btn) return;

    btn.disabled = true;
    title.textContent = "Picking...";
    ticker.textContent = `range: ${min} to ${max}`;

    if (prefersReducedMotion()) {
      renderStaticNumber(roller, result);
      title.textContent = `Picked ${result}`;
      btn.disabled = false;
      return;
    }

    roller.innerHTML = "";
    const str = String(result);
    const digits = str.split("");
    const itemHeight = 40; // matches vertical span height in CSS

    digits.forEach((digit, index) => {
      const slotDiv = document.createElement("div");
      slotDiv.className = "undecideds-slot__digit-slot";

      if (digit === "-") {
        slotDiv.className += " undecideds-slot__digit-slot--static";
        slotDiv.innerHTML = "<span>-</span>";
        roller.appendChild(slotDiv);
        return;
      }

      const stripDiv = document.createElement("div");
      stripDiv.className = "undecideds-slot__digit-strip";

      const targetDigit = parseInt(digit, 10);
      const numbers = [];
      // Populate strip: 0-9 twice, then target
      for (let i = 0; i <= 9; i++) numbers.push(i);
      for (let i = 0; i <= 9; i++) numbers.push(i);
      numbers.push(targetDigit);

      numbers.forEach(num => {
        const span = document.createElement("span");
        span.textContent = String(num);
        stripDiv.appendChild(span);
      });

      slotDiv.appendChild(stripDiv);
      roller.appendChild(slotDiv);

      stripDiv.style.transform = "translateY(0px)";
      // force repaint
      stripDiv.getBoundingClientRect();

      const delay = index * 100;
      stripDiv.style.transition = `transform 1s cubic-bezier(0.15, 0.85, 0.35, 1) ${delay}ms`;
      // We want to land on the last index (index 20)
      stripDiv.style.transform = `translateY(-${20 * itemHeight}px)`;
    });

    // Calculate total duration based on last digit finish
    const totalDuration = 1000 + (digits.length - 1) * 100;
    setTimeout(() => {
      renderStaticNumber(roller, result);
      title.textContent = `Picked ${result}`;
      btn.disabled = false;
    }, totalDuration);
  }

  // --- YES OR NO ---
  function initYesNo(slot) {
    const btn = slot.querySelector("[data-yesno-decide-btn]");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const result = Math.random() < 0.5 ? "yes" : "no";
      spinYesNoWheel(slot, result);
    });
  }

  let currentWheelAngle = 0;

  function spinYesNoWheel(slot, result) {
    const wheel = slot.querySelector("[data-wheel-spinner-element]");
    const title = slot.querySelector("[data-yesno-result-text]");
    const ticker = slot.querySelector("[data-yesno-ticker]");
    const btn = slot.querySelector("[data-yesno-decide-btn]");

    if (!wheel || !title || !ticker || !btn) return;

    btn.disabled = true;
    title.textContent = "Deciding...";
    ticker.textContent = "spinning";

    const msgList = result === "yes" ? YES_MESSAGES : NO_MESSAGES;
    const finalMsg = msgList[Math.floor(Math.random() * msgList.length)];

    if (prefersReducedMotion()) {
      title.textContent = finalMsg;
      ticker.textContent = "landed " + result;
      btn.disabled = false;
      return;
    }

    // 8 slices on the wheel (45 deg each)
    // YES: 0, 2, 4, 6
    // NO: 1, 3, 5, 7
    const slices = result === "yes" ? [0, 2, 4, 6] : [1, 3, 5, 7];
    const s = slices[Math.floor(Math.random() * slices.length)];
    
    // Add random slice offset of +- 14deg so it does not land perfectly on center line
    const offset = (Math.random() * 28) - 14;
    
    // Keep angle positive and accumulate to ensure spinning forward
    const baseSpins = 4 * 360; 
    const targetSliceAngle = (360 - s * 45) % 360;
    
    // Calculate new absolute target angle relative to current rotation
    const baseTarget = Math.ceil(currentWheelAngle / 360) * 360;
    currentWheelAngle = baseTarget + baseSpins + targetSliceAngle + offset;

    wheel.style.transition = "transform 2.2s cubic-bezier(0.1, 0.8, 0.15, 1)";
    wheel.style.transform = `rotate(${currentWheelAngle}deg)`;

    // Visual pointer tick animation
    const pointer = slot.querySelector(".undecideds-slot__wheel-pointer-icon");
    let tickCount = 0;
    const totalTicks = 32;
    const tickInterval = setInterval(() => {
      if (tickCount >= totalTicks) {
        clearInterval(tickInterval);
        return;
      }
      if (pointer) {
        pointer.classList.add("is-ticking");
        setTimeout(() => pointer.classList.remove("is-ticking"), 50);
      }
      tickCount++;
    }, 2200 / totalTicks);

    setTimeout(() => {
      title.textContent = finalMsg;
      ticker.textContent = "landed " + result;
      btn.disabled = false;
    }, 2250);
  }

  // --- HELPERS ---
  function initTabScroller(slot) {
    const scrollEl = slot.querySelector("[data-undecideds-tabs]");
    const prevBtn = slot.querySelector('[data-undecideds-tab-scroll="left"]');
    const nextBtn = slot.querySelector('[data-undecideds-tab-scroll="right"]');
    if (!scrollEl || !prevBtn || !nextBtn) return;

    const scrollByStep = direction => {
      const distance = tabScrollStep(scrollEl) * (direction === "left" ? -1 : 1);
      scrollEl.scrollBy({
        left: distance,
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
      window.setTimeout(() => updateTabScrollNav(slot), 180);
    };

    prevBtn.addEventListener("click", () => scrollByStep("left"));
    nextBtn.addEventListener("click", () => scrollByStep("right"));
    scrollEl.addEventListener("scroll", () => updateTabScrollNav(slot), { passive: true });

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => updateTabScrollNav(slot));
      observer.observe(scrollEl);
    } else {
      window.addEventListener("resize", () => updateTabScrollNav(slot), { passive: true });
    }

    updateTabScrollNav(slot);
  }

  function tabScrollStep(scrollEl) {
    const item = scrollEl.querySelector(".undecideds-slot__tab-btn");
    if (!item) return Math.max(1, Math.floor(scrollEl.clientWidth * 0.8));
    const rect = item.getBoundingClientRect();
    return Math.max(1, Math.ceil(rect.width * 1.25));
  }

  function updateTabScrollNav(slot) {
    const scrollEl = slot.querySelector("[data-undecideds-tabs]");
    const prevBtn = slot.querySelector('[data-undecideds-tab-scroll="left"]');
    const nextBtn = slot.querySelector('[data-undecideds-tab-scroll="right"]');
    if (!scrollEl || !prevBtn || !nextBtn) return;

    const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
    const hasOverflow = maxScroll > 2;
    prevBtn.disabled = !hasOverflow || scrollEl.scrollLeft <= 2;
    nextBtn.disabled = !hasOverflow || scrollEl.scrollLeft >= maxScroll - 2;
  }

  function scrollActiveTabIntoView(slot) {
    const activeTab = slot.querySelector(".undecideds-slot__tab-btn.is-active");
    if (!activeTab) return;
    activeTab.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }

  function finishAngle(start, target, rotations) {
    let angle = rotations * 360 + target;
    while (angle <= start + 360) angle += 360;
    return angle;
  }

  function easeOutRamp(t) {
    const ramp = 0.18;
    const velocity = 1 / (1 - ramp / 2);
    if (t < ramp) return (velocity * t * t) / (2 * ramp);
    return velocity * (t - ramp / 2);
  }

  function clearAnimation(slot) {
    const state = activeAnimations.get(slot);
    if (state?.frameId) cancelAnimationFrame(state.frameId);
    activeAnimations.delete(slot);
  }

  function randomInt(max) {
    const limit = Math.max(1, Math.floor(max));
    if (window.crypto && window.crypto.getRandomValues) {
      const bucket = new Uint32Array(1);
      window.crypto.getRandomValues(bucket);
      return bucket[0] % limit;
    }
    return Math.floor(Math.random() * limit);
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function boot() {
    initAll(document);
    if (window.__undecidedsSlotObserver) return;
    window.__undecidedsSlotObserver = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (
            node.matches &&
            node.matches(
              ".undecideds-slot[data-undecideds-slot]:not([data-undecideds-init])",
            )
          ) {
            initSlot(node);
          } else if (node.querySelectorAll) {
            initAll(node);
          }
        }
      }
    });
    window.__undecidedsSlotObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
