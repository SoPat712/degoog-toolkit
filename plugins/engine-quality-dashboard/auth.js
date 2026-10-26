const COOKIE = "settings-token";

export function sessionHeaders(request) {
  const token = request.headers.get("x-settings-token") || "";
  const cookie = (request.headers.get("cookie") || "").split(";")
    .map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`)) || "";
  if (token.length > 512 || cookie.length > 1024) return null;
  if (!token && !cookie.slice(COOKIE.length + 1)) return null;
  return { Accept: "application/json", ...(token ? { "x-settings-token": token } : {}), ...(cookie ? { Cookie: cookie } : {}) };
}

export function basePath(value = process.env.DEGOOG_BASE_URL || "") {
  const raw = String(value).trim().replace(/\/+$/, "");
  const path = /^https?:\/\//i.test(raw) ? new URL(raw).pathname.replace(/\/+$/, "") : raw;
  if (!path || path === "/") return "";
  if (!path.startsWith("/") || path.includes("//") || /[?#\\\u0000-\u0020]/.test(path) || path.split("/").some(part => part === "." || part === "..")) throw new Error("Invalid base path");
  return path;
}

export async function authorize(request, { fetcher = fetch, port = process.env.DEGOOG_PORT, prefix = process.env.DEGOOG_BASE_URL } = {}) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return 403;
  const headers = sessionHeaders(request);
  if (!headers) return 401;
  const n = Number(port || 4444);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 503;
  try {
    // Never forward an admin session to a request-controlled host or redirect.
    const response = await fetcher(`http://127.0.0.1:${n}${basePath(prefix)}/api/settings/auth`, {
      headers, redirect: "error", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return 503;
    const result = await response.json();
    return result?.required === true && result.valid === true ? 200 : 401;
  } catch { return 503; }
}

export function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store", Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", ...extra,
  } });
}
