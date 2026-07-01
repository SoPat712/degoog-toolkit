(function () {
  const form = document.getElementById("settings-auth-form");
  if (!form) return;

  const gate = document.querySelector(".settings-auth-gate-inner");
  const errorEl = document.getElementById("settings-auth-error");
  if (!gate || !errorEl) return;

  const BUTTON_CLASS = "oidc-settings-gate__button";
  const WRAP_CLASS = "oidc-settings-gate__actions";
  const HINT_CLASS = "oidc-settings-gate__hint";

  async function loadGate() {
    let response;
    try {
      response = await fetch("/api/settings/auth", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
    } catch {
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return;
    }

    if (!data || typeof data.loginUrl !== "string" || !data.loginUrl) {
      return;
    }

    const providerLabel =
      typeof data.providerLabel === "string" && data.providerLabel.trim()
        ? data.providerLabel.trim()
        : "OIDC";

    form.hidden = true;
    form.setAttribute("aria-hidden", "true");

    const wrapper = document.createElement("div");
    wrapper.className = WRAP_CLASS;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-right-to-bracket";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = `Sign in with ${providerLabel}`;
    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener("click", function () {
      window.location.assign(data.loginUrl);
    });

    const hint = document.createElement("p");
    hint.className = HINT_CLASS;
    hint.textContent =
      "This degoog admin panel is protected by OpenID Connect.";

    wrapper.appendChild(button);
    wrapper.appendChild(hint);

    errorEl.insertAdjacentElement("beforebegin", wrapper);
  }

  loadGate();
})();
