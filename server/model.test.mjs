import { afterEach, describe, expect, it, vi } from "vitest";
import { callEmbeddings } from "./model.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callEmbeddings", () => {
  it("calls an OpenAI-compatible embeddings endpoint and preserves input order", async () => {
    const fetchMock = vi.fn(async (_url, options) => new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callEmbeddings({
      id: "openai-compatible",
      baseURL: "https://example.test/v1/",
      apiKey: "test-key",
      embeddingModel: "embed-test"
    }, ["first", "second"]);

    expect(result).toEqual([[1, 0], [0, 1]]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/v1/embeddings");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: "embed-test", input: ["first", "second"] });
  });

  it("rejects providers without a compatible embedding endpoint", async () => {
    await expect(callEmbeddings({
      id: "anthropic",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: "test-key",
      embeddingModel: "embed-test"
    }, ["text"])).rejects.toMatchObject({ code: "EMBEDDING_NOT_SUPPORTED" });
  });
});
