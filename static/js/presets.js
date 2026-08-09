/**
 * Preset CSS loader: tokens file + shared base, concatenated for editor/PDF.
 */

export const PRESET_KEYS = ["light", "warm", "dark"];
export const PRESET_CSS_VERSION = "editorial-3";

/**
 * @param {string} key
 * @returns {string}
 */
export function presetTokensUrl(key) {
  return `/static/css/presets/preset-${key}.css?v=${PRESET_CSS_VERSION}`;
}

/**
 * @returns {string}
 */
export function presetBaseUrl() {
  return `/static/css/presets/preset-base.css?v=${PRESET_CSS_VERSION}`;
}

/**
 * @param {string} tokensCss
 * @param {string} baseCss
 * @returns {string}
 */
export function assemblePresetCss(tokensCss, baseCss) {
  return `${tokensCss}\n${baseCss}`;
}

/**
 * Fetch theme tokens and shared base in parallel; return assembled CSS.
 * Does not touch the DOM or storage — caller applies on success only.
 *
 * @param {string} key
 * @param {(url: string) => Promise<string>} fetchText
 * @returns {Promise<string>}
 */
export async function loadPresetCss(key, fetchText) {
  if (!PRESET_KEYS.includes(key)) {
    throw new Error(`Preset desconocido: ${key}`);
  }
  const [tokensCss, baseCss] = await Promise.all([
    fetchText(presetTokensUrl(key)),
    fetchText(presetBaseUrl()),
  ]);
  return assemblePresetCss(tokensCss, baseCss);
}
