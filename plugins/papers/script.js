document.addEventListener("click", async (event) => {
  const button = event.target.closest(".papers-card [data-paper-citation]");
  if (!button || button.disabled) return;

  const card = button.closest(".papers-card");
  const translate = (key, fallback) => card.getAttribute(`data-t-${key}`) || fallback;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = translate("copying", "Copying…");
  try {
    const params = new URLSearchParams({
      doi: button.dataset.doi,
      format: button.dataset.paperCitation,
    });
    const response = await fetch(
      `/api/plugin/${__PLUGIN_ID__}/citation?${params}`,
    );
    if (!response.ok) throw new Error("Citation unavailable");
    await navigator.clipboard.writeText(await response.text());
    button.textContent = translate("copied", "Copied");
  } catch {
    button.textContent = translate("retry", "Try again");
  } finally {
    window.setTimeout(() => {
      button.textContent = originalLabel;
      button.disabled = false;
    }, 1600);
  }
});
