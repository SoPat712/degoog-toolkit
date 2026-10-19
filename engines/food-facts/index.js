export const type = "consumer";
export const site = "https://world.openfoodfacts.org";
export const outgoingHosts = ["search.openfoodfacts.org"];

const API_URL = "https://search.openfoodfacts.org/search";
const FIELDS = ["code", "product_name", "brands", "quantity", "image_front_small_url", "nutriscore_grade"];

function failure(context, status, message, httpStatus) {
  if (context?.engineError) return context.engineError(status, message, {engine:"Food Facts", httpStatus});
  return Object.assign(new Error(message), {status, httpStatus});
}

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export default class FoodFactsEngine {
  name = "Food Facts";
  bangShortcut = "foodfacts";
  isClientExposed = false;
  pageSize = 20;

  settingsSchema = [{
    key: "pageSize", label: "Results per page", type: "select",
    options: ["10", "20", "40"], default: "20",
    description: "Number of products to request from Open Food Facts.",
  }];

  configure(settings = {}) {
    if (["10", "20", "40"].includes(String(settings.pageSize))) this.pageSize = Number(settings.pageSize);
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const q = text(query);
    if (!q) return [];
    const pageNumber = Math.max(1, Math.floor(Number(page) || 1));
    const lang = text(context?.lang).split(/[-_]/)[0].toLowerCase();
    const params = new URLSearchParams({q, page: String(pageNumber), page_size: String(this.pageSize), fields: FIELDS.join(",")});
    if (/^[a-z]{2,3}$/.test(lang)) params.set("langs", lang);
    context?.signal?.throwIfAborted();
    const response = await (context?.fetch ?? fetch)(`${API_URL}?${params}`, {
      headers: {Accept:"application/json", "User-Agent":"degoog-toolkit Food Facts/1.0 (https://github.com/SoPat712/degoog-toolkit)"},
      ...(context?.signal ? {signal:context.signal} : {}),
    });
    context?.sentinel?.(response, this.name);
    if (!response.ok) throw failure(context, response.status === 429 ? "rate_limited" : response.status >= 500 ? "network" : "blocked", `Food Facts returned HTTP ${response.status}`, response.status);
    let payload;
    try { payload = await response.json(); }
    catch {
      context?.signal?.throwIfAborted();
      throw failure(context, "parse_error", "Food Facts returned invalid JSON", response.status);
    }
    context?.signal?.throwIfAborted();
    if (!Array.isArray(payload?.hits) || payload.errors?.length) {
      throw failure(context, "parse_error", "Food Facts returned an unexpected search response", response.status);
    }
    if (payload.timed_out === true) throw failure(context, "timeout", "Food Facts search timed out upstream", response.status);
    if (Number.isInteger(payload.page_count) && payload.page_count > 0) context?.pagination?.({total:payload.page_count});
    const seen = new Set();
    return payload.hits.flatMap(item => {
      const code = text(item?.code);
      const title = text(item?.product_name);
      if (!/^\d{1,30}$/.test(code) || !title || seen.has(code)) return [];
      seen.add(code);
      const brands = Array.isArray(item.brands) ? item.brands.map(text).filter(Boolean).join(", ") : text(item.brands);
      const grade = text(item.nutriscore_grade).toLowerCase();
      const snippet = [brands, text(item.quantity), /^[a-e]$/.test(grade) ? `Nutri-Score ${grade.toUpperCase()}` : ""].filter(Boolean).join(" · ");
      const result = {title, url:`${site}/product/${code}`, snippet, source:this.name};
      const thumbnail = text(item.image_front_small_url);
      if (/^https:\/\//i.test(thumbnail)) result.thumbnail = thumbnail;
      return [result];
    });
  }
}
