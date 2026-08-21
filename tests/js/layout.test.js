import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PANEL_ORDER,
  normalizePanelOrder,
  swapPanelOrder,
} from "../../static/js/layout.js";

describe("normalizePanelOrder", () => {
  it("returns the default for missing or short values", () => {
    assert.deepEqual(normalizePanelOrder(undefined), [...DEFAULT_PANEL_ORDER]);
    assert.deepEqual(normalizePanelOrder(["md"]), [...DEFAULT_PANEL_ORDER]);
  });

  it("rejects duplicates and unknown ids", () => {
    assert.deepEqual(
      normalizePanelOrder(["md", "css", "md"]),
      [...DEFAULT_PANEL_ORDER]
    );
    assert.deepEqual(
      normalizePanelOrder(["md", "css", "foo"]),
      [...DEFAULT_PANEL_ORDER]
    );
  });

  it("keeps a valid permutation", () => {
    assert.deepEqual(normalizePanelOrder(["preview", "md", "css"]), [
      "preview",
      "md",
      "css",
    ]);
  });
});

describe("swapPanelOrder", () => {
  it("swaps two stacked editors", () => {
    assert.deepEqual(swapPanelOrder(DEFAULT_PANEL_ORDER, "md", "css"), [
      "css",
      "md",
      "preview",
    ]);
  });

  it("swaps an editor with the side panel", () => {
    assert.deepEqual(swapPanelOrder(DEFAULT_PANEL_ORDER, "md", "preview"), [
      "preview",
      "css",
      "md",
    ]);
  });

  it("is a no-op for the same id or an unknown panel", () => {
    assert.deepEqual(swapPanelOrder(DEFAULT_PANEL_ORDER, "md", "md"), [
      ...DEFAULT_PANEL_ORDER,
    ]);
    assert.deepEqual(swapPanelOrder(DEFAULT_PANEL_ORDER, "md", "other"), [
      ...DEFAULT_PANEL_ORDER,
    ]);
  });
});
