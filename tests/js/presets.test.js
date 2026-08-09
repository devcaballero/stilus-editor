import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PRESET_CSS_VERSION,
  PRESET_KEYS,
  assemblePresetCss,
  loadPresetCss,
  presetBaseUrl,
  presetTokensUrl,
} from "../../static/js/presets.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const presetsDir = join(root, "static/css/presets");

/**
 * @param {string} name
 * @returns {string}
 */
function readPreset(name) {
  return readFileSync(join(presetsDir, name), "utf8");
}

describe("preset URLs", () => {
  it("versions tokens and base with editorial-3", () => {
    assert.equal(PRESET_CSS_VERSION, "editorial-3");
    assert.equal(
      presetTokensUrl("dark"),
      "/static/css/presets/preset-dark.css?v=editorial-3"
    );
    assert.equal(
      presetBaseUrl(),
      "/static/css/presets/preset-base.css?v=editorial-3"
    );
  });
});

describe("assemblePresetCss / loadPresetCss", () => {
  it("concatenates tokens then base", () => {
    assert.equal(assemblePresetCss("TOKENS", "BASE"), "TOKENS\nBASE");
  });

  it("fetches in parallel and assembles in tokens→base order", async () => {
    /** @type {string[]} */
    const urls = [];
    /** @type {Record<string, string>} */
    const responses = {
      [presetTokensUrl("dark")]: "/*tokens*/",
      [presetBaseUrl()]: "/*base*/",
    };
    const fetchText = async (url) => {
      urls.push(url);
      await Promise.resolve();
      if (!(url in responses)) {
        throw new Error(`unexpected ${url}`);
      }
      return responses[url];
    };

    const css = await loadPresetCss("dark", fetchText);
    assert.equal(css, "/*tokens*/\n/*base*/");
    assert.deepEqual(urls.sort(), [presetBaseUrl(), presetTokensUrl("dark")].sort());
  });

  it("rejects unknown preset without fetching", async () => {
    let called = false;
    await assert.rejects(
      () =>
        loadPresetCss("nope", async () => {
          called = true;
          return "";
        }),
      /Preset desconocido/
    );
    assert.equal(called, false);
  });

  it("fails entirely if base fetch fails (no partial CSS returned)", async () => {
    const fetchText = async (url) => {
      if (url === presetTokensUrl("light")) {
        return ":root{--bg:#fff}";
      }
      throw new Error("No se pudo cargar base (500)");
    };
    await assert.rejects(() => loadPresetCss("light", fetchText), /base/);
  });

  it("fails entirely if tokens fetch fails", async () => {
    const fetchText = async (url) => {
      if (url === presetBaseUrl()) {
        return "/*base*/";
      }
      throw new Error("No se pudo cargar tokens (404)");
    };
    await assert.rejects(() => loadPresetCss("warm", fetchText), /tokens|404/);
  });
});

describe("assembled preset equivalence", () => {
  const expectedTokens = {
    dark: {
      "--bg": "#10141a",
      "--gold": "#c9a34a",
      "--hero-glow-a": "rgba(201, 163, 74, 0.16)",
      "--hero-glow-b": "rgba(201, 163, 74, 0.05)",
    },
    light: {
      "--bg": "#ffffff",
      "--gold": "#005bb7",
      "--hero-glow-a": "rgba(0, 91, 183, 0.12)",
      "--hero-glow-b": "rgba(0, 91, 183, 0.04)",
    },
    warm: {
      "--bg": "#faf8f3",
      "--gold": "#8a5a20",
      "--hero-glow-a": "rgba(138, 90, 32, 0.14)",
      "--hero-glow-b": "rgba(138, 90, 32, 0.05)",
    },
  };

  for (const key of PRESET_KEYS) {
    it(`assembles ${key} with critical rules and theme vars`, () => {
      const tokens = readPreset(`preset-${key}.css`);
      const base = readPreset("preset-base.css");
      const css = assemblePresetCss(tokens, base);

      assert.equal(css.includes("@import"), false);
      assert.match(css, /@page\s+cover\s*\{/);
      assert.match(css, /@font-face\s*\{/);
      assert.match(css, /\.hero::before\s*\{/);
      assert.match(css, /\.closing\s*\{/);
      assert.match(css, /url\("fonts\/Lora-Regular\.woff2"\)/);
      assert.match(css, /var\(--hero-glow-a\)/);
      assert.match(css, /var\(--hero-glow-b\)/);

      // Tokens precede base in the assembled string.
      const tokensIdx = css.indexOf(":root");
      const fontFaceIdx = css.indexOf("@font-face");
      assert.ok(tokensIdx >= 0 && fontFaceIdx > tokensIdx);

      for (const [prop, value] of Object.entries(expectedTokens[key])) {
        const re = new RegExp(
          `${prop.replace(/-/g, "\\-")}\\s*:\\s*${value.replace(/[()]/g, "\\$&")}\\s*;`
        );
        assert.match(css, re, `${key} missing ${prop}: ${value}`);
      }

      // Theme file must not redefine shared type faces (avoid clobbering base).
      assert.equal(/\-\-font-body\s*:/.test(tokens), false);
    });
  }
});
