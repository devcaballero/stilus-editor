/**
 * Document asset URL helpers (pure; no DOM / localStorage).
 */

/**
 * @param {string} pathOrUrl
 * @returns {string}
 */
export function assetBasename(pathOrUrl) {
  const cleaned = String(pathOrUrl || "")
    .trim()
    .split(/[?#]/)[0];
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || "";
}

/**
 * @param {Map<string, string>} assets
 * @param {string} name
 * @returns {string | null}
 */
export function lookupAsset(assets, name) {
  if (!name || !assets || assets.size === 0) {
    return null;
  }
  if (assets.has(name)) {
    return assets.get(name) || null;
  }
  try {
    const decoded = decodeURIComponent(name);
    if (decoded !== name && assets.has(decoded)) {
      return assets.get(decoded) || null;
    }
  } catch {
    /* ignore */
  }
  const lower = name.toLowerCase();
  for (const [key, value] of assets) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return null;
}

/**
 * Rewrite relative image URLs in HTML to embedded data URLs.
 * @param {string} html
 * @param {Map<string, string>} assets
 * @returns {string}
 */
export function applyAssetUrls(html, assets) {
  if (!assets || assets.size === 0) {
    return html;
  }
  return html.replace(
    /\b(src|href)=(["'])([^"']+)\2/gi,
    (match, attr, quote, url) => {
      if (/^(data:|https?:|blob:|\/\/|#|mailto:)/i.test(url)) {
        return match;
      }
      const dataUrl = lookupAsset(assets, assetBasename(url));
      if (!dataUrl) {
        return match;
      }
      return `${attr}=${quote}${dataUrl}${quote}`;
    }
  );
}

/**
 * Rewrite url(...) in CSS that point to uploaded asset filenames.
 * @param {string} cssText
 * @param {Map<string, string>} assets
 * @returns {string}
 */
export function applyAssetUrlsInCss(cssText, assets) {
  if (!assets || assets.size === 0) {
    return cssText;
  }
  return cssText.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, _quote, url) => {
      const trimmed = url.trim();
      if (/^(data:|https?:|blob:|\/\/)/i.test(trimmed)) {
        return match;
      }
      const dataUrl = lookupAsset(assets, assetBasename(trimmed));
      if (!dataUrl) {
        return match;
      }
      return `url("${dataUrl}")`;
    }
  );
}

/**
 * Parse persisted assets JSON into a Map (name → data URL).
 * @param {string | null | undefined} raw
 * @returns {Map<string, string>}
 */
export function parseAssetsPayload(raw) {
  const out = new Map();
  if (!raw) {
    return out;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return out;
    }
    for (const [name, dataUrl] of Object.entries(parsed)) {
      if (
        typeof name === "string" &&
        typeof dataUrl === "string" &&
        dataUrl.startsWith("data:image/")
      ) {
        out.set(assetBasename(name), dataUrl);
      }
    }
  } catch {
    /* corrupt storage */
  }
  return out;
}

/**
 * @param {Map<string, string>} assets
 * @returns {Record<string, string>}
 */
export function assetsToPayload(assets) {
  /** @type {Record<string, string>} */
  const payload = {};
  for (const [name, dataUrl] of assets) {
    payload[name] = dataUrl;
  }
  return payload;
}
