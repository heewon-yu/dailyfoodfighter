// Run locally: node --test map/tests/video-status.test.mjs
// No GitHub Actions, secrets, network, or third-party packages are needed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const code = await readFile(new URL("../../functions/api/map/video-status.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const { onRequestGet } = await import(moduleUrl);

const PUBLIC = "jNQXAC9IVRw";
const PRIVATE = "AAAAAAAAAAA";
const DELETED = "BBBBBBBBBBB";
const UNLISTED = "CCCCCCCCCCC";

async function mockNetwork(fetchHandler, action) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchHandler;
  try { return await action(); }
  finally { globalThis.fetch = original; }
}
async function check(ids, env = {}) {
  const url = "https://dailyfoodfighter.com/api/map/video-status?ids=" + ids.join(",");
  const result = await onRequestGet({ request: new Request(url), env });
  return { status: result.status, body: await result.json() };
}

test("rejects invalid IDs and batches greater than 30", async () => {
  assert.equal((await check(["bad"])).status, 400);
  assert.equal((await check([])).status, 400);
  assert.equal((await check(Array.from({ length: 31 }, (_, n) => String(n).padStart(11, "0")))).status, 400);
});

test("official Data API keeps public/unlisted and excludes private or deleted IDs", async () => {
  let calls = 0;
  await mockNetwork(async url => {
    assert.match(String(url), /www\.googleapis\.com\/youtube\/v3\/videos/);
    calls++;
    return new Response(JSON.stringify({
      items: [
        { id: PUBLIC, status: { privacyStatus: "public" } },
        { id: UNLISTED, status: { privacyStatus: "unlisted" } }
      ]
    }), { status: 200 });
  }, async () => {
    const { status, body } = await check([PUBLIC, PRIVATE, DELETED, UNLISTED], { YOUTUBE_API_KEY: "test-only" });
    assert.equal(status, 200);
    assert.equal(body.provider, "youtube-data-api");
    assert.equal(body.statuses[PUBLIC], "public");
    assert.equal(body.statuses[UNLISTED], "public");
    assert.equal(body.statuses[PRIVATE], "unavailable");
    assert.equal(body.statuses[DELETED], "unavailable");
  });
  assert.equal(calls, 1);
});

test("oEmbed fallback never removes videos for 429 or request failures", async () => {
  await mockNetwork(async url => {
    const videoId = new URL(new URL(String(url)).searchParams.get("url")).searchParams.get("v");
    if (videoId === PUBLIC) return new Response("{}", { status: 200 });
    if (videoId === PRIVATE) return new Response("Forbidden", { status: 403 });
    if (videoId === DELETED) return new Response("Not Found", { status: 404 });
    if (videoId === UNLISTED) return new Response("Rate limited", { status: 429 });
    throw new Error("Unexpected ID");
  }, async () => {
    const { body } = await check([PUBLIC, PRIVATE, DELETED, UNLISTED]);
    assert.equal(body.provider, "youtube-oembed");
    assert.equal(body.statuses[PUBLIC], "public");
    assert.equal(body.statuses[PRIVATE], "unavailable");
    assert.equal(body.statuses[DELETED], "unavailable");
    assert.equal(body.statuses[UNLISTED], "unknown");
  });
});

test("if YouTube's public health probe fails, do not hide any video", async () => {
  await mockNetwork(async () => new Response("Service unavailable", { status: 503 }), async () => {
    const { body } = await check([PRIVATE, DELETED]);
    assert.equal(body.statuses[PRIVATE], "unknown");
    assert.equal(body.statuses[DELETED], "unknown");
  });
});

test("food and stay source data both use the common availability filter", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /views\.food\.places = representativePlaces\(listings\.filter/);
  assert.match(html, /views\.stay\.places = stayPlaces\.flatMap/);
  assert.match(html, /verifyVideoAvailability\(\);/);
});
