(function () {
  "use strict";

  const activeAnimations = new WeakMap();

  function getT(key) {
    const attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    const el = document.querySelector("[data-undecideds-slot]");
    return (el && el.getAttribute(attrName)) || key;
  }

  function initAll(root) {
    (root || document)
      .querySelectorAll(".undecideds-slot[data-undecideds-slot]:not([data-undecideds-init])")
      .forEach(initSlot);
  }

  function initSlot(slot) {
    slot.dataset.undecidedsInit = "1";

    const tabs = Array.from(slot.querySelectorAll(".undecideds-slot__tab-btn"));
    const panels = Array.from(slot.querySelectorAll(".undecideds-slot__panel"));
    initTabScroller(slot);
    
    function switchTab(targetTab) {
      slot.dataset.activeTab = targetTab;
      tabs.forEach(btn => {
        const isActive = btn.dataset.tab === targetTab;
        btn.setAttribute("aria-selected", String(isActive));
        btn.classList.toggle("is-active", isActive);
      });
      panels.forEach(panel => {
        if (panel.dataset.panel === targetTab) {
          panel.removeAttribute("hidden");
        } else {
          panel.setAttribute("hidden", "");
        }
      });
      scrollActiveTabIntoView(slot);
      updateTabScrollNav(slot);
    }

    tabs.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

    switchTab(slot.dataset.activeTab || "coin");
    initCoinFlip(slot);
    initRollDie(slot);
    initPickNumber(slot);
    initYesNo(slot);
    scheduleEntranceAnimation(slot);
  }
  function scheduleEntranceAnimation(slot) {
    const activeTab = slot.dataset.activeTab || "coin";
    const autoCoin = slot.dataset.autoCoinResult || "";
    const autoDiceD6 = slot.dataset.autoDiceResultD6 || "";
    const autoDiceD20 = slot.dataset.autoDiceResultD20 || "";
    const autoNum = slot.dataset.autoNumResult || "";
    const autoYesno = slot.dataset.autoYesnoResult || "";
    const autoYesnoMsg = slot.dataset.autoYesnoMsg || "";

    const hasAuto = autoCoin || autoDiceD6 || autoDiceD20 || autoNum || autoYesno;
    if (!hasAuto) return;

    function fireEntrance() {
      setTimeout(() => {
        if (activeTab === "coin" && autoCoin) {
          animateCoinFlip(slot, autoCoin);
        } else if (activeTab === "dice") {
          const dieType = slot.dataset.autoDieType || slot.dataset.dieType || "d6";
          if (dieType === "d20" && autoDiceD20) {
            rollD20(slot, parseInt(autoDiceD20, 10));
          } else if (autoDiceD6) {
            rollD6(slot, parseInt(autoDiceD6, 10));
          }
        } else if (activeTab === "number" && autoNum) {
          const min = parseInt(slot.dataset.numMin || "1", 10);
          const max = parseInt(slot.dataset.numMax || "100", 10);
          rollNumber(slot, parseInt(autoNum, 10), min, max);
        } else if (activeTab === "yesno" && autoYesno) {
          slot._autoYesnoMsg = autoYesnoMsg;
          spinYesNoWheel(slot, autoYesno);
        }
      }, 120);
    }

    if (!window.IntersectionObserver) {
      fireEntrance();
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs.disconnect();
            fireEntrance();
          }
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(slot);
  }

  function initCoinFlip(slot) {
    const btn = slot.querySelector("[data-coin-flip-btn]");
    const coin = slot.querySelector("[data-coin-element]");
    if (!btn || !coin) return;

    btn.addEventListener("click", () => {
      const result = Math.random() < 0.5 ? "heads" : "tails";
      animateCoinFlip(slot, result);
    });

    setCoinPose(coin, coin.dataset.side || "heads");
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
    title.textContent = getT("flipping");
    ticker.textContent = getT("spinning");
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
    if (title) title.textContent = result === "heads" ? getT("heads") : getT("tails");
    if (ticker) ticker.textContent = getT("landed") + " " + (result === "heads" ? getT("heads") : getT("tails"));
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

    // Initial pose for D20
    const d20Canvas = slot.querySelector("[data-d20-canvas]");
    if (d20Canvas) {
      const d20Controller = initD20(slot);
      slot._d20Controller = d20Controller;
      if (d20Controller) {
        const initialFace = parseInt(d20Canvas.dataset.initialVal || "20", 10);
        d20Controller.showFace(initialFace);
      }
    }
  }

  function setD6Pose(die, face) {
    die.style.transform = d6PoseTransform(face, 0);
  }

  function d6PoseTransform(face, rotations) {
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
    const spin = Math.max(0, rotations || 0) * 360;
    return `rotateX(${spin + angle.x + tilt.x}deg) rotateY(${spin + angle.y + tilt.y}deg) rotateZ(${tilt.z}deg)`;
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
    title.textContent = getT("rolling");
    ticker.textContent = getT("rollingText");

    if (prefersReducedMotion()) {
      die.dataset.face = String(result);
      setD6Pose(die, result);
      title.textContent = getT("rolled") + " " + result;
      ticker.textContent = getT("landed") + " " + result;
      btn.disabled = false;
      return;
    }

    const extraRotations = 3 + randomInt(3);

    die.style.transition = "transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1.05)";
    die.style.transform = d6PoseTransform(result, extraRotations);

    setTimeout(() => {
      die.style.transition = "";
      die.dataset.face = String(result);
      setD6Pose(die, result);
      title.textContent = getT("rolled") + " " + result;
      ticker.textContent = getT("landed") + " " + result;
      btn.disabled = false;
    }, 1200);
  }

  function rollD20(slot, result) {
    const d20 = slot.querySelector("[data-die-d20-element]");
    const title = slot.querySelector("[data-dice-result-text]");
    const ticker = slot.querySelector("[data-dice-ticker]");
    const btn = slot.querySelector("[data-dice-roll-btn]");

    if (!d20 || !title || !ticker || !btn) return;

    btn.disabled = true;
    title.textContent = getT("rolling");
    ticker.textContent = getT("rollingText");

    const d20Controller = slot._d20Controller;

    if (prefersReducedMotion() || !d20Controller) {
      if (d20Controller) d20Controller.showFace(result);
      title.textContent = getT("rolled") + " " + result;
      ticker.textContent = getT("landed") + " " + result;
      btn.disabled = false;
      return;
    }

    d20Controller.animateRoll(result, 1200, () => {
      title.textContent = getT("rolled") + " " + result;
      ticker.textContent = getT("landed") + " " + result;
      btn.disabled = false;
    });
  }

  function initD20(slot) {
    const canvas = slot.querySelector("[data-d20-canvas]");
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 12 Vertices of regular icosahedron
    const t = (1 + Math.sqrt(5)) / 2;
    const rawVertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    const vertices = rawVertices.map(v => {
      const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
      return { x: v[0]/len, y: v[1]/len, z: v[2]/len };
    });

    // 20 Faces
    const faces = [
      [0, 11, 5],  [0, 5, 1],   [0, 1, 7],   [0, 7, 10],  [0, 10, 11],
      [1, 5, 9],   [5, 11, 4],  [11, 10, 2], [10, 7, 6],  [7, 1, 8],
      [3, 9, 4],   [3, 4, 2],   [3, 2, 6],   [3, 6, 8],   [3, 8, 9],
      [4, 9, 5],   [2, 4, 11],  [6, 2, 10],  [8, 6, 7],   [9, 8, 1]
    ];

    // Ensure all normals point outward
    faces.forEach(f => {
      const A = vertices[f[0]];
      const B = vertices[f[1]];
      const C = vertices[f[2]];
      const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
      const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const cx = (A.x + B.x + C.x)/3;
      const cy = (A.y + B.y + C.y)/3;
      const cz = (A.z + B.z + C.z)/3;
      if (nx*cx + ny*cy + nz*cz < 0) {
        const tmp = f[1];
        f[1] = f[2];
        f[2] = tmp;
      }
    });

    // Precalculate face normals
    const faceNormals = faces.map(f => {
      const A = vertices[f[0]];
      const B = vertices[f[1]];
      const C = vertices[f[2]];
      const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
      const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      return { x: nx/len, y: ny/len, z: nz/len };
    });

    // Pair opposite faces and assign numbers 1 to 20
    const faceNumbers = new Array(20).fill(0);
    const paired = new Set();
    let pairIndex = 0;
    const pairValues = [
      [20, 1], [19, 2], [18, 3], [17, 4], [16, 5],
      [15, 6], [14, 7], [13, 8], [12, 9], [11, 10]
    ];
    for (let i = 0; i < 20; i++) {
      if (paired.has(i)) continue;
      let bestJ = -1;
      let minDot = 1;
      for (let j = 0; j < 20; j++) {
        if (i === j || paired.has(j)) continue;
        const dot = faceNormals[i].x * faceNormals[j].x + faceNormals[i].y * faceNormals[j].y + faceNormals[i].z * faceNormals[j].z;
        if (dot < minDot) {
          minDot = dot;
          bestJ = j;
        }
      }
      if (bestJ !== -1) {
        const vals = pairValues[pairIndex++];
        faceNumbers[i] = vals[0];
        faceNumbers[bestJ] = vals[1];
        paired.add(i);
        paired.add(bestJ);
      }
    }

    // Precalculate local u and v axes for text drawing on each face
    const faceAxes = faces.map((f, idx) => {
      const A = vertices[f[0]];
      const B = vertices[f[1]];
      const C = vertices[f[2]];
      const n = faceNormals[idx];

      const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
      const uLen = Math.sqrt(ux*ux + uy*uy + uz*uz);
      const u = { x: ux/uLen, y: uy/uLen, z: uz/uLen };

      const vx = n.y * u.z - n.z * u.y;
      const vy = n.z * u.x - n.x * u.z;
      const vz = n.x * u.y - n.y * u.x;
      const v = { x: vx, y: vy, z: vz };

      return { u, v };
    });

    // Helper: Matrix vector multiplication
    function rotateVector(v, m) {
      return {
        x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
        y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
        z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
      };
    }

    // Helper: Get target rotation matrix to align normal to +z axis
    function getFaceTargetRotation(n) {
      let ux, uy, uz;
      const xyLen = Math.sqrt(n.x*n.x + n.y*n.y);
      if (xyLen > 0.001) {
        ux = -n.y / xyLen;
        uy = n.x / xyLen;
        uz = 0;
      } else {
        ux = 1;
        uy = 0;
        uz = 0;
      }
      const vx = n.y * uz - n.z * uy;
      const vy = n.z * ux - n.x * uz;
      const vz = n.x * uy - n.y * ux;
      return [
        [ux, uy, uz],
        [vx, vy, vz],
        [n.x, n.y, n.z]
      ];
    }

    // Helper: Multiply 3x3 matrices
    function multiplyMatrices(A, B) {
      const C = [[0,0,0],[0,0,0],[0,0,0]];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          C[i][j] = A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j];
        }
      }
      return C;
    }

    // Helper: Rotation matrix from Euler angles
    function getSpinMatrix(rx, ry, rz) {
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);

      const Rx = [
        [1, 0, 0],
        [0, cx, -sx],
        [0, sx, cx]
      ];
      const Ry = [
        [cy, 0, sy],
        [0, 1, 0],
        [-sy, 0, cy]
      ];
      const Rz = [
        [cz, -sz, 0],
        [sz, cz, 0],
        [0, 0, 1]
      ];

      const RyRx = multiplyMatrices(Ry, Rx);
      return multiplyMatrices(Rz, RyRx);
    }

    let currentMatrix = [[1,0,0],[0,1,0],[0,0,1]];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rectWidth = canvas.clientWidth || 100;
      const rectHeight = canvas.clientHeight || 100;
      const nextWidth = Math.round(rectWidth * dpr);
      const nextHeight = Math.round(rectHeight * dpr);

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    }

    // Render the 3D die
    function render(matrix) {
      resize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const computedStyle = getComputedStyle(slot);
      const primaryColor = computedStyle.getPropertyValue("--undecideds-primary").trim() || "#4285f4";

      const width = canvas.width;
      const height = canvas.height;
      const xc = width / 2;
      const yc = height / 2;
      const scale = width * 0.42;

      // Light source
      const Lx = 0.408, Ly = 0.408, Lz = 0.816;

      // Project vertices
      const projVertices = vertices.map(v => {
        const rot = rotateVector(v, matrix);
        return {
          x: xc + rot.x * scale,
          y: yc - rot.y * scale,
          z: rot.z
        };
      });

      faces.forEach((f, idx) => {
        const rotNormal = rotateVector(faceNormals[idx], matrix);

        // Backface culling
        if (rotNormal.z > 0) {
          const p0 = projVertices[f[0]];
          const p1 = projVertices[f[1]];
          const p2 = projVertices[f[2]];

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.closePath();

          ctx.fillStyle = primaryColor;
          ctx.fill();

          // Lighting shading overlay
          const d = rotNormal.x * Lx + rotNormal.y * Ly + rotNormal.z * Lz;
          if (d > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${d * 0.3})`;
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(0, 0, 0, ${-d * 0.4})`;
            ctx.fill();
          }

          // Outline
          ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Subtle highlight edge
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.stroke();

          // Face number
          const num = faceNumbers[idx];
          const A = vertices[f[0]];
          const B = vertices[f[1]];
          const C = vertices[f[2]];
          const cx = (A.x + B.x + C.x) / 3;
          const cy = (A.y + B.y + C.y) / 3;
          const cz = (A.z + B.z + C.z) / 3;
          const rotCentroid = rotateVector({ x: cx, y: cy, z: cz }, matrix);
          const screen_x = xc + rotCentroid.x * scale;
          const screen_y = yc - rotCentroid.y * scale;

          const u_rot = rotateVector(faceAxes[idx].u, matrix);
          const v_rot = rotateVector(faceAxes[idx].v, matrix);

          ctx.save();
          const textScale = 0.34;
          const x_u = (u_rot.x * textScale * scale) / 24;
          const y_u = (-u_rot.y * textScale * scale) / 24;
          const x_v = (-v_rot.x * textScale * scale) / 24;
          const y_v = (v_rot.y * textScale * scale) / 24;

          ctx.setTransform(x_u, y_u, x_v, y_v, screen_x, screen_y);

          ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Shadow/stroke for contrast
          ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
          ctx.lineWidth = 3.5;
          ctx.strokeText(String(num), 0, 0);

          ctx.fillStyle = "#ffffff";
          ctx.fillText(String(num), 0, 0);

          ctx.restore();
        }
      });
    }

    function showFace(number) {
      const faceIdx = faceNumbers.indexOf(number);
      if (faceIdx === -1) return;
      const targetRot = getFaceTargetRotation(faceNormals[faceIdx]);
      currentMatrix = targetRot;
      render(targetRot);
    }

    let animId = null;
    function animateRoll(result, duration, callback) {
      if (animId) cancelAnimationFrame(animId);

      const faceIdx = faceNumbers.indexOf(result);
      if (faceIdx === -1) return;

      const targetRot = getFaceTargetRotation(faceNormals[faceIdx]);

      const initRx = (4 + Math.random() * 3) * Math.PI * 2;
      const initRy = (5 + Math.random() * 3) * Math.PI * 2;
      const initRz = (3 + Math.random() * 2) * Math.PI * 2;

      const startTime = Date.now();

      function tick() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (progress >= 1) {
          currentMatrix = targetRot;
          render(targetRot);
          animId = null;
          if (callback) callback();
        } else {
          const factor = Math.pow(1 - progress, 2.5);
          const rx = initRx * factor;
          const ry = initRy * factor;
          const rz = initRz * factor;

          const spinMat = getSpinMatrix(rx, ry, rz);
          const combinedMat = multiplyMatrices(spinMat, targetRot);

          render(combinedMat);
          animId = requestAnimationFrame(tick);
        }
      }

      animId = requestAnimationFrame(tick);
    }

    return {
      showFace,
      animateRoll
    };
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
    title.textContent = getT("picking");
    ticker.textContent = getT("rangeText").replace("{min}", min).replace("{max}", max);

    // Pad to the digit width of the widest boundary so all slots are shown
    // (e.g. result=42 in range 1–1,000,000 → "0000042", 7 slots)
    const maxLen = Math.max(
      String(Math.abs(min)).length,
      String(Math.abs(max)).length,
      String(Math.abs(result)).length
    );
    const isNeg = result < 0;
    const paddedStr = (isNeg ? "-" : "") + String(Math.abs(result)).padStart(maxLen, "0");

    if (prefersReducedMotion()) {
      renderStaticNumber(roller, paddedStr);
      title.textContent = getT("picked") + " " + result;
      btn.disabled = false;
      return;
    }

    roller.innerHTML = "";
    const digits = paddedStr.split("");
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
      renderStaticNumber(roller, paddedStr);
      title.textContent = getT("picked") + " " + result;
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
    title.textContent = getT("deciding");
    ticker.textContent = getT("spinning");

    const msgList = result === "yes" 
      ? [
          getT("absolutely"),
          getT("yesDefinitely"),
          getT("certain"),
          getT("withoutADoubt"),
          getT("outlookGood"),
          getT("mostLikely"),
          getT("signsPointToYes")
        ]
      : [
          getT("noWay"),
          getT("maybeNextTime"),
          getT("dontCountOnIt"),
          getT("sourcesSayNo"),
          getT("doubtful"),
          getT("outlookNotGood"),
          getT("absolutelyNot")
        ];
    const finalMsg = slot._autoYesnoMsg || msgList[Math.floor(Math.random() * msgList.length)];

    if (prefersReducedMotion()) {
      title.textContent = finalMsg;
      slot._autoYesnoMsg = undefined;
      ticker.textContent = getT("landed") + " " + (result === "yes" ? getT("yes") : getT("no"));
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
    // Geometry: CSS rotate(R) shifts every point clockwise by R, so the
    // original angle that ends up under the top pointer is (360 - R) % 360.
    // Inverting: to bring slice--N (center at N*45+22.5° on the unrotated
    // wheel) under the pointer, we need R = 360 - (s*45+22.5).
    // ± 14° jitter stays well inside one 45° slice so result is always correct.
    const targetSliceAngle = (337.5 - s * 45 + 360) % 360;

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
      slot._autoYesnoMsg = undefined;
      ticker.textContent = getT("landed") + " " + (result === "yes" ? getT("yes") : getT("no"));
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
