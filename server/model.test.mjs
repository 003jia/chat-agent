import { afterEach, describe, expect, it, vi } from "vitest";
import { callEmbeddings, callModel } from "./model.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callModel", () => {
  it("rejects an insecure remote HTTP baseURL before any network call", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callModel({
      id: "openai-compatible",
      baseURL: "http://api.example.test/v1",
      apiKey: "test-key",
      model: "gpt-test"
    }, [{ role: "user", content: "hi" }], 0)).rejects.toMatchObject({ status: 400, code: "PROVIDER_URL_INSECURE" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts loopback HTTP and normalizes trailing slashes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const content = await callModel({
      id: "openai-compatible",
      baseURL: "http://127.0.0.1:11434/v1/",
      apiKey: "test-key",
      model: "gpt-test"
    }, [{ role: "user", content: "hi" }], 0);

    expect(content).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });
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
