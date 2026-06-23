// lolcat-4play client-side CAPTCHA helper
(function() {
  // Hook EventSource for streaming searches
  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function(url, ...args) {
      dismissCaptchaAlert();
      const source = new OriginalEventSource(url, ...args);
      if (typeof url === "string" && url.includes("/api/search/stream")) {
        source.addEventListener("message", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.timing) {
              checkTiming(data.timing);
            }
            if (data.engineTimings) {
              data.engineTimings.forEach(checkTiming);
            }
          } catch (err) {
            // ignore
          }
        });
      }
      return source;
    };
    Object.assign(window.EventSource, OriginalEventSource);
    window.EventSource.prototype = OriginalEventSource.prototype;
  }

  // Hook fetch for standard searches/retries
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function(...args) {
      const url = args[0];
      if (typeof url === "string" && (url.includes("/api/search") || url.includes("/api/search/retry"))) {
        dismissCaptchaAlert();
        try {
          const response = await originalFetch.apply(this, args);
          const cloned = response.clone();
          cloned.json().then(data => {
            if (data?.engineTimings) {
              data.engineTimings.forEach(checkTiming);
            }
          }).catch(() => {});
          return response;
        } catch (err) {
          return originalFetch.apply(this, args);
        }
      }
      return originalFetch.apply(this, args);
    };
  }

  function checkTiming(t) {
    if (!t) return;
    const isCaptcha = t.status === "captcha" || 
      (t.errorReason && (
        t.errorReason.includes("lolcat-4play") && 
        (t.errorReason.includes("blocked") || t.errorReason.includes("captcha"))
      ));
    if (isCaptcha) {
      showCaptchaAlert(t.name);
    }
  }

  function dismissCaptchaAlert() {
    const alert = document.getElementById("degoog-4play-captcha-alert");
    if (alert) alert.remove();
  }

  function showCaptchaAlert(engineName) {
    if (document.getElementById("degoog-4play-captcha-alert")) return;

    const alertDiv = document.createElement("div");
    alertDiv.id = "degoog-4play-captcha-alert";
    alertDiv.className = "degoog-4play-captcha-alert-container";
    alertDiv.innerHTML = `
      <div class="degoog-4play-captcha-content">
        <div class="degoog-4play-captcha-icon">⚠️</div>
        <div class="degoog-4play-captcha-body">
          <strong>${engineName} CAPTCHA detected</strong>
          <p>A Firefox tab was kept open for you to solve the bot check. Please open Firefox, complete the CAPTCHA, and search again.</p>
        </div>
        <button class="degoog-4play-captcha-close" aria-label="Close alert">&times;</button>
      </div>
    `;

    // Bind close button handler
    alertDiv.querySelector(".degoog-4play-captcha-close").addEventListener("click", () => {
      alertDiv.remove();
    });

    document.body.appendChild(alertDiv);
  }
})();
