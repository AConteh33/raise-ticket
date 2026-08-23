function isLocalHostname(host) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function getApiBase() {
  const host = window.location.hostname;
  if (isLocalHostname(host)) return "";
  return (window.APP_CONFIG?.apiBase || "").replace(/\/$/, "");
}

function apiUrl(path) {
  const base = getApiBase();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

const imageBlobCache = new Map();

function toImagePath(urlOrPath) {
  if (!urlOrPath) return "";
  return urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
}

function apiFetch(path, options = {}) {
  const base = getApiBase();
  const useCredentials = Boolean(base) || options.credentials;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = new Headers(options.headers || {});

  if (base) {
    headers.set("ngrok-skip-browser-warning", "true");
  }

  if (isFormData) {
    headers.delete("Content-Type");
  }

  return fetch(apiUrl(path), {
    ...options,
    headers: [...headers.keys()].length ? headers : undefined,
    credentials: useCredentials ? "include" : options.credentials || "same-origin",
  });
}

async function loadImageBlobUrl(urlOrPath) {
  const path = toImagePath(urlOrPath);
  if (!path) throw new Error("Missing image path");

  const cached = imageBlobCache.get(path);
  if (cached) return cached;

  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Invalid image response");
  }

  const blobUrl = URL.createObjectURL(await res.blob());
  imageBlobCache.set(path, blobUrl);
  return blobUrl;
}

function pruneImageCache(activePaths) {
  const keep = activePaths instanceof Set ? activePaths : new Set(activePaths);
  for (const [path, blobUrl] of imageBlobCache) {
    if (!keep.has(path)) {
      URL.revokeObjectURL(blobUrl);
      imageBlobCache.delete(path);
    }
  }
}

window.Api = { apiUrl, apiFetch, loadImageBlobUrl, pruneImageCache, toImagePath };
