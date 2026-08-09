import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAssetUrls,
  applyAssetUrlsInCss,
  assetBasename,
  assetsToPayload,
  lookupAsset,
  parseAssetsPayload,
} from "../../static/js/assets.js";

describe("assetBasename", () => {
  it("keeps plain names", () => {
    assert.equal(assetBasename("logo.png"), "logo.png");
  });

  it("strips directories and query", () => {
    assert.equal(assetBasename("img/logo.png?x=1"), "logo.png");
    assert.equal(assetBasename("a\\b\\logo.png"), "logo.png");
  });
});

describe("lookupAsset / applyAssetUrls", () => {
  const assets = new Map([
    ["logo.png", "data:image/png;base64,AAA"],
    ["Photo.JPG", "data:image/jpeg;base64,BBB"],
  ]);

  it("matches case-insensitively", () => {
    assert.equal(lookupAsset(assets, "LOGO.PNG"), "data:image/png;base64,AAA");
  });

  it("rewrites relative src", () => {
    const html = '<img src="logo.png" alt="x"><img src="https://x/y.png">';
    const out = applyAssetUrls(html, assets);
    assert.match(out, /src="data:image\/png;base64,AAA"/);
    assert.match(out, /src="https:\/\/x\/y\.png"/);
  });

  it("rewrites css url()", () => {
    const css = "div{background:url(logo.png)} span{background:url('https://x/a.png')}";
    const out = applyAssetUrlsInCss(css, assets);
    assert.match(out, /url\("data:image\/png;base64,AAA"\)/);
    assert.match(out, /url\('https:\/\/x\/a\.png'\)/);
  });
});

describe("parseAssetsPayload", () => {
  it("loads valid entries", () => {
    const map = parseAssetsPayload(
      JSON.stringify({ "img/logo.png": "data:image/png;base64,AAA", bad: 1 })
    );
    assert.equal(map.get("logo.png"), "data:image/png;base64,AAA");
    assert.equal(map.size, 1);
  });

  it("round-trips payload", () => {
    const assets = new Map([["a.png", "data:image/png;base64,AA"]]);
    const again = parseAssetsPayload(JSON.stringify(assetsToPayload(assets)));
    assert.equal(again.get("a.png"), "data:image/png;base64,AA");
  });
});
