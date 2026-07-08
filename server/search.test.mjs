import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, parseBingResults } from "./search.mjs";

describe("decodeHtmlEntities", () => {
  it("decodes named, decimal, and hexadecimal HTML entities", () => {
    expect(decodeHtmlEntities("A&amp;B&nbsp;&#20320;&#x597D;&unknown;")).toBe("A&B 你好");
  });
});

describe("parseBingResults", () => {
  it("extracts and cleans Bing result cards", () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com/path?a=1&amp;b=2">Example &amp; Title</a></h2>
        <p>Snippet with <strong>bold</strong> and &quot;quote&quot;.</p>
      </li>
      <li class="b_algo">
        <h2><a href="https://second.example/article">Second</a></h2>
        <p>Another snippet.</p>
      </li>
    `;

    const results = parseBingResults(html, 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Example & Title",
      snippet: "Snippet with bold and \"quote\".",
      source: "example.com"
    });
    expect(results[0].url).toContain("https://example.com/path");
    expect(results[0].url).toContain("a=1");
  });
});
