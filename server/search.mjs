import { apiError } from "./errors.mjs";
import { fetchWithTimeout } from "./http.mjs";
import { withRetry } from "./retry.mjs";

export const WEB_SEARCH_RESULT_LIMIT = 5;
export const WEB_SEARCH_TIMEOUT_MS = 9000;

export async function performWebSearch(query, limit = WEB_SEARCH_RESULT_LIMIT) {
  const normalizedQuery = String(query || "").trim().slice(0, 240);
  if (!normalizedQuery) throw apiError(400, "VALIDATION_ERROR", "搜索关键词不能为空。");
  const normalizedLimit = Math.min(8, Math.max(1, Number(limit) || WEB_SEARCH_RESULT_LIMIT));
  try {
    const results = await searchWithFallback(normalizedQuery, normalizedLimit);
    return {
      query: normalizedQuery,
      source: results.source,
      fetchedAt: new Date().toISOString(),
      results: results.items
    };
  } catch (error) {
    if (error.code) throw error;
    if (error.name === "AbortError") {
      throw apiError(504, "WEB_SEARCH_TIMEOUT", "联网搜索超时，请稍后重试。");
    }
    throw apiError(502, "WEB_SEARCH_ERROR", "联网搜索失败。", error.message);
  }
}

async function searchWithFallback(query, limit) {
  const attempts = [
    ["Bing HTML", () => searchBing(query, limit)],
    ["DuckDuckGo HTML", () => searchDuckDuckGo(query, limit)]
  ];
  let lastError = null;
  for (const [source, search] of attempts) {
    try {
      const items = await search();
      if (items.length) return { source, items };
      lastError = apiError(502, "WEB_SEARCH_EMPTY", `${source} 没有返回可用结果。`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || apiError(502, "WEB_SEARCH_ERROR", "联网搜索失败。");
}

async function searchBing(query, limit) {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await withRetry(
    async () => {
      const result = await fetchWithTimeout(
        searchUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
            Accept: "text/html,application/xhtml+xml"
          },
          redirect: "follow"
        },
        WEB_SEARCH_TIMEOUT_MS
      );
      if (result.status >= 500) {
        throw apiError(result.status, "WEB_SEARCH_ERROR", "Bing 搜索服务暂时不可用。");
      }
      return result;
    },
    { retries: 2, baseDelayMs: 120, shouldRetry: isRetryableSearchError }
  );
  if (!response.ok) {
    throw apiError(response.status, "WEB_SEARCH_ERROR", "Bing 搜索服务暂时不可用。");
  }
  const html = await response.text();
  return parseBingResults(html, limit);
}

export function parseBingResults(html, limit = WEB_SEARCH_RESULT_LIMIT) {
  const results = [];
  const blocks = String(html || "").split(/<li class="b_algo"[^>]*>/i).slice(1);
  for (const block of blocks) {
    if (results.length >= limit) break;
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = cleanHtml(titleMatch[2]);
    const url = normalizeResultUrl(decodeHtmlEntities(titleMatch[1]));
    const snippet = cleanHtml(snippetMatch?.[1] || "");
    if (!title || !url || results.some((item) => item.url === url)) continue;
    results.push({
      title: title.slice(0, 160),
      url,
      snippet: snippet.slice(0, 280),
      source: sourceFromUrl(url)
    });
  }
  return results;
}

async function searchDuckDuckGo(query, limit) {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await withRetry(
    async () => {
      const result = await fetchWithTimeout(
        searchUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MemoryAgentWorkbench/0.1)",
            Accept: "text/html,application/xhtml+xml"
          }
        },
        WEB_SEARCH_TIMEOUT_MS
      );
      if (result.status >= 500) {
        throw apiError(result.status, "WEB_SEARCH_ERROR", "搜索服务暂时不可用。");
      }
      return result;
    },
    { retries: 2, baseDelayMs: 120, shouldRetry: isRetryableSearchError }
  );
  if (!response.ok) {
    throw apiError(response.status, "WEB_SEARCH_ERROR", "搜索服务暂时不可用。");
  }
  const html = await response.text();
  return parseDuckDuckGoResults(html, limit);
}

function parseDuckDuckGoResults(html, limit) {
  const results = [];
  const linkPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) && results.length < limit) {
    const block = html.slice(match.index, Math.min(html.length, match.index + 2600));
    const snippetMatch =
      block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const title = cleanHtml(match[2]);
    const url = normalizeResultUrl(decodeHtmlEntities(match[1]));
    const snippet = cleanHtml(snippetMatch?.[1] || "");
    if (!title || !url || results.some((item) => item.url === url)) continue;
    results.push({
      title: title.slice(0, 160),
      url,
      snippet: snippet.slice(0, 280),
      source: sourceFromUrl(url)
    });
  }
  return results;
}

function normalizeResultUrl(rawUrl) {
  let value = String(rawUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) value = `https:${value}`;
  if (value.startsWith("/")) value = `https://duckduckgo.com${value}`;
  try {
    const parsed = new URL(value);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return value.startsWith("http") ? value : "";
  }
}

function sourceFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function cleanHtml(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|\w+);/gi, (_match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return named[entity.toLowerCase()] || "";
  });
}

function isRetryableSearchError(error) {
  return error.name === "AbortError" || error.code === "WEB_SEARCH_ERROR" || error.code === "WEB_SEARCH_TIMEOUT";
}
