import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findCssValueColors,
  isCssValuePosition,
} from "../../static/js/cssColors.js";

describe("isCssValuePosition", () => {
  it("accepts colors after a property colon", () => {
    assert.equal(isCssValuePosition("  --primary-dark: #1e3a5f;", 18), true);
  });

  it("rejects hash selectors", () => {
    assert.equal(isCssValuePosition("#hero {", 0), false);
  });
});

describe("findCssValueColors", () => {
  it("finds hex values and skips id selectors", () => {
    const line = "  --white: #ffffff; #hero { color: #1a1a1a; }";
    const found = findCssValueColors("  --white: #ffffff;");
    assert.deepEqual(found, [{ index: 11, value: "#ffffff" }]);
    assert.deepEqual(
      findCssValueColors("#hero { color: #1a1a1a; }"),
      [{ index: 15, value: "#1a1a1a" }]
    );
    assert.equal(findCssValueColors(line).length >= 1, true);
  });

  it("finds rgb() in a value", () => {
    const found = findCssValueColors("  color: rgb(30, 58, 95);");
    assert.equal(found.length, 1);
    assert.equal(found[0].value, "rgb(30, 58, 95)");
  });
});
