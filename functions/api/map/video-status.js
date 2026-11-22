// Cloudflare Pages Function: check public YouTube video availability without GitHub Actions or D1.
// Supports an optional YOUTUBE_API_KEY for batched official checks; otherwise uses public oEmbed.
const MAX_BATCH = 30;
const CACHE_SECONDS = 3 * 60 * 60;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function response(data, status = 200, cacheSeconds = CACHE_SECONDS) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=" + cacheSeconds,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function checkViaDataApi(ids, key) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "status");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", key);
  const result = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!result.ok) throw new Error("YouTube Data API returned " + result.status);
  const payload = await result.json();
  if (!Array.isArray(payload.items)) throw new Error("Invalid YouTube Data API response");
  const publicIds = new Set(
    payload.items
      .filter(item => item && item.status && item.status.privacyStatus !== "private")
      .map(item => item.id)
  );
  return Object.fromEntries(ids.map(id => [id, publicIds.has(id) ? "public" : "unavailable"]));
}

async function checkOembed(id) {
  const url = "https://www.youtube.com/oembed?url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + id) + "&format=json";
  try {
    const result = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (result.status === 200) return "public";
    if (result.status === 403 || result.status === 404) return "unavailable";
    // 401 may mean that a still-public video has embedding disabled.
    // 429/5xx and other failures must never be interpreted as video deletion.
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function checkViaOembed(ids) {
  // A known public video acts as a health probe; if YouTube blocks this worker,
  // do not accidentally remove every place from the map.
  if (await checkOembed("jNQXAC9IVRw") !== "public") {
    return Object.fromEntries(ids.map(id => [id, "unknown"]));
  }
  const statuses = {};
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      statuses[id] = await checkOembed(id);
    }
  }));
  return statuses;
}

export async function onRequestGet({ request, env }) {
  const rawIds = new URL(request.url).searchParams.get("ids") || "";
  const ids = [...new Set(rawIds.split(",").filter(Boolean))].sort();
  if (!ids.length || ids.length > MAX_BATCH || ids.some(id => !VIDEO_ID.test(id))) {
    return response({ error: "Provide 1-30 valid 11-character YouTube IDs in ids." }, 400, 0);
  }

  const cacheUrl = new URL(request.url);
  cacheUrl.search = "?ids=" + ids.join(",");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  let statuses;
  let provider = "youtube-oembed";
  if (env && env.YOUTUBE_API_KEY) {
    try {
      statuses = await checkViaDataApi(ids, env.YOUTUBE_API_KEY);
      provider = "youtube-data-api";
    } catch {
      // Invalid key, quota exhaustion, or temporary API outage: preserve the map
      // unless independently confirmed unavailable by oEmbed.
    }
  }
  if (!statuses) statuses = await checkViaOembed(ids);
  const hasKnownStatus = Object.values(statuses).some(status => status !== "unknown");
  const result = response(
    { statuses, checkedAt: new Date().toISOString(), provider },
    200,
    hasKnownStatus ? CACHE_SECONDS : 60
  );
  if (cache) {
    try {
      await cache.put(cacheKey, result.clone());
    } catch {
      // Cloudflare cache is optional; a cache failure must not break the map.
    }
  }
  return result;
}
