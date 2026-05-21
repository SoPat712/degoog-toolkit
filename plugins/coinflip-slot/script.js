(function () {
  "use strict";

  const activeAnimations = new WeakMap();

  function initAll(root) {
    const scope = root || document;
    scope
      .querySelectorAll(
        ".coinflip-slot[data-coinflip-slot]:not([data-coinflip-init])",
      )
      .forEach(initSlot);
  }

  function initSlot(slot) {
    slot.dataset.coinflipInit = "1";

    const initialResult = normalizeResult(slot.dataset.result);
    const button = slot.querySelector("[data-coinflip-reroll]");

    if (button) {
      button.addEventListener("click", function () {
        const result = randomResult();
        slot.dataset.flips = String(6 + randomInt(4));
        animateFlip(slot, result);
      });
    }

    setCoinPose(slot, initialResult);
    animateFlip(slot, initialResult);
  }

  function animateFlip(slot, result) {
    clearAnimation(slot);

    if (prefersReducedMotion()) {
      land(slot, result);
      return;
    }

    const coin = slot.querySelector("[data-coinflip-coin]");
    const disc = slot.querySelector("[data-coinflip-disc]");
    const resultEl = slot.querySelector("[data-coinflip-result]");
    const ticker = slot.querySelector("[data-coinflip-ticker]");
    const button = slot.querySelector("[data-coinflip-reroll]");
    const flips = Math.max(4, parseInt(slot.dataset.flips || "7", 10) || 7);

    if (!coin || !disc || !resultEl || !ticker) return;
    if (!coin.animate || !disc.animate) {
      land(slot, result);
      return;
    }

    const start = rotationFor(normalizeResult(slot.dataset.result));
    const target = rotationFor(result);
    const finish = finishAngle(start, target, flips);
    const centerSpin = 360;
    const tailReveal = nextTailAngleAfter(start);
    const travel = finish - start;
    const midAngle = Math.max(tailReveal + 180, start + travel * 0.42);
    const lateAngle = Math.max(midAngle + 360, start + travel * 0.76);

    slot.classList.add("is-flipping");
    resultEl.textContent = "Flipping...";
    ticker.textContent = "spinning";
    if (button) button.disabled = true;
    coin.dataset.side = "spinning";

    const flipAnimation = coin.animate(
      [
        {
          transform: coinTransform(start, -10, 0),
          filter: "brightness(0.96)",
          easing: "cubic-bezier(.54,0,.72,.18)",
        },
        {
          transform: coinTransform(tailReveal, 12, -16),
          filter: "brightness(1.12)",
          offset: 0.28,
          easing: "cubic-bezier(.18,.72,.18,1)",
        },
        {
          transform: coinTransform(tailReveal + 16, 15, -18),
          filter: "brightness(1.15)",
          offset: 0.36,
          easing: "cubic-bezier(.16,.76,.22,1)",
        },
        {
          transform: coinTransform(Math.floor(midAngle), -13, -26),
          filter: "brightness(1.06)",
          offset: 0.62,
          easing: "cubic-bezier(.18,.76,.22,1)",
        },
        {
          transform: coinTransform(Math.floor(lateAngle), 8, -12),
          filter: "brightness(1.09)",
          offset: 0.82,
          easing: "cubic-bezier(.18,.76,.22,1)",
        },
        {
          transform: coinTransform(finish, -7, 0),
          filter: "brightness(1)",
        },
      ],
      {
        duration: 1250 + Math.min(flips, 9) * 80,
        easing: "linear",
        fill: "forwards",
      },
    );

    const spinAnimation = disc.animate(
      [
        { transform: "rotateZ(0deg)" },
        { transform: `rotateZ(${centerSpin}deg)` },
      ],
      {
        duration: 1250 + Math.min(flips, 9) * 80,
        easing: "cubic-bezier(.18,.76,.22,1)",
        fill: "forwards",
      },
    );

    activeAnimations.set(slot, { flipAnimation, spinAnimation });
    flipAnimation.onfinish = function () {
      const active = activeAnimations.get(slot);
      if (!active || active.flipAnimation !== flipAnimation) return;
      activeAnimations.delete(slot);
      flipAnimation.cancel();
      spinAnimation.cancel();
      land(slot, result);
    };
  }

  function land(slot, result) {
    clearAnimation(slot);

    const resultEl = slot.querySelector("[data-coinflip-result]");
    const ticker = slot.querySelector("[data-coinflip-ticker]");
    const button = slot.querySelector("[data-coinflip-reroll]");
    const cleanResult = normalizeResult(result);
    const label = cleanResult === "heads" ? "Heads" : "Tails";

    slot.classList.remove("is-flipping");
    slot.dataset.result = cleanResult;
    setCoinPose(slot, cleanResult);
    if (resultEl) resultEl.textContent = label;
    if (ticker) ticker.textContent = "landed " + cleanResult;
    if (button) button.disabled = false;
  }

  function setCoinPose(slot, result) {
    const coin = slot.querySelector("[data-coinflip-coin]");
    const disc = slot.querySelector("[data-coinflip-disc]");
    if (!coin) return;
    const cleanResult = normalizeResult(result);
    coin.dataset.side = cleanResult;
    coin.style.transform = coinTransform(rotationFor(cleanResult), -7, 0);
    if (disc) disc.style.transform = "rotateZ(0deg)";
  }

  function coinTransform(yDegrees, xDegrees, yOffset) {
    return `translateY(${yOffset}px) rotateX(${xDegrees}deg) rotateY(${yDegrees}deg)`;
  }

  function finishAngle(start, target, rotations) {
    let angle = rotations * 360 + target;
    while (angle <= start + 360) angle += 360;
    return angle;
  }

  function nextTailAngleAfter(start) {
    let angle = 180;
    while (angle <= start + 1) angle += 360;
    return angle;
  }

  function clearAnimation(slot) {
    const animations = activeAnimations.get(slot);
    if (animations) {
      animations.flipAnimation?.cancel();
      animations.spinAnimation?.cancel();
    }
    activeAnimations.delete(slot);
  }

  function rotationFor(value) {
    return normalizeResult(value) === "tails" ? 180 : 0;
  }

  function normalizeResult(value) {
    return String(value || "").toLowerCase() === "tails" ? "tails" : "heads";
  }

  function randomResult() {
    return randomInt(2) === 0 ? "heads" : "tails";
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
    if (window.__coinflipSlotObserver) return;
    window.__coinflipSlotObserver = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (
            node.matches &&
            node.matches(
              ".coinflip-slot[data-coinflip-slot]:not([data-coinflip-init])",
            )
          ) {
            initSlot(node);
          } else if (node.querySelectorAll) {
            initAll(node);
          }
        }
      }
    });
    window.__coinflipSlotObserver.observe(document.body, {
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
