import { apiError, classifyProviderError, mapModelError } from "./errors.mjs";
import { fetchWithTimeout } from "./http.mjs";
import { MODEL_MAX_TOKENS } from "./constants.mjs";

export const MODEL_TIMEOUT_MS = 60000;

function normalizeBaseURL(baseURL) {
  return String(baseURL || "").replace(/\/+$/, "");
}

export async function callModel(provider, messages, temperature, options = {}) {
  try {
    if (provider.id === "anthropic") {
      return await callAnthropic(provider, messages, temperature, options);
    }
    return await callOpenAICompatible(provider, messages, temperature, options);
  } catch (error) {
    throw mapModelError(error);
  }
}

export async function callModelJson(provider, messages, temperature = 0) {
  const content = await callModel(provider, messages, temperature);
  const match = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return null;
  try {
    return JSON.parse(match[1] || match[0]);
  } catch {
    return null;
  }
}

export async function callEmbeddings(provider, inputs) {
  const values = (Array.isArray(inputs) ? inputs : [inputs]).map((value) => String(value || "").trim()).filter(Boolean);
  if (!values.length) return [];
  if (!provider.embeddingModel) {
    throw apiError(400, "EMBEDDING_NOT_CONFIGURED", "当前供应商未配置 Embedding 模型。");
  }
  if (provider.id === "anthropic") {
    throw apiError(400, "EMBEDDING_NOT_SUPPORTED", "Anthropic 配置不提供 OpenAI-compatible Embedding 接口。");
  }
  try {
    const response = await fetchWithTimeout(
      `${normalizeBaseURL(provider.baseURL)}/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({ model: provider.embeddingModel, input: values })
      },
      MODEL_TIMEOUT_MS
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
    }
    const rows = Array.isArray(payload?.data) ? [...payload.data].sort((a, b) => Number(a.index) - Number(b.index)) : [];
    const embeddings = rows.map((row) => normalizeEmbedding(row?.embedding));
    if (embeddings.length !== values.length || embeddings.some((embedding) => !embedding.length)) {
      throw apiError(502, "EMBEDDING_RESPONSE_ERROR", "Embedding 接口返回格式异常。");
    }
    return embeddings;
  } catch (error) {
    throw mapModelError(error);
  }
}

function normalizeEmbedding(value) {
  if (!Array.isArray(value)) return [];
  const embedding = value.map(Number);
  return embedding.length && embedding.every(Number.isFinite) ? embedding : [];
}

async function callOpenAICompatible(provider, messages, temperature, options = {}) {
  const response = await fetchWithTimeout(
    `${normalizeBaseURL(provider.baseURL)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: options.maxTokens || MODEL_MAX_TOKENS,
        temperature,
        messages,
        stream: Boolean(options.stream)
      })
    },
    MODEL_TIMEOUT_MS
  );
  if (options.stream) return response;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw apiError(502, "MODEL_RESPONSE_ERROR", "模型没有返回可用内容。");
  return content;
}

async function callAnthropic(provider, messages, temperature, options = {}) {
  const systemMessage = messages.find((message) => message.role === "system")?.content || "";
  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));
  const response = await fetchWithTimeout(
    `${normalizeBaseURL(provider.baseURL)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: MODEL_MAX_TOKENS,
        temperature,
        system: systemMessage,
        messages: chatMessages,
        stream: Boolean(options.stream)
      })
    },
    MODEL_TIMEOUT_MS
  );
  if (options.stream) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
    }
    return response.body;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
  }
  const content = payload?.content?.map((part) => part.text).filter(Boolean).join("\n");
  if (!content) throw apiError(502, "MODEL_RESPONSE_ERROR", "模型没有返回可用内容。");
  return content;
}

export async function streamOpenAICompatible(provider, messages, temperature) {
  if (provider.id === "anthropic") {
    throw classifyProviderError(400, "Anthropic 流式输出将在下一阶段适配。");
  }
  const response = await callOpenAICompatible(provider, messages, temperature, { stream: true });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
  }
  return response.body;
}

export async function* streamModelDeltas(provider, messages, temperature) {
  try {
    if (provider.id === "anthropic") {
      yield* streamAnthropicDeltas(provider, messages, temperature);
      return;
    }
    yield* streamOpenAICompatibleDeltas(provider, messages, temperature);
  } catch (error) {
    throw mapModelError(error);
  }
}

async function* streamOpenAICompatibleDeltas(provider, messages, temperature) {
  const body = await streamOpenAICompatible(provider, messages, temperature);
  let buffer = "";
  for await (const chunk of body) {
    buffer += Buffer.from(chunk).toString("utf8");
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() || "";
    for (const delta of parseOpenAIEventBlocks(eventBlocks)) {
      yield delta;
    }
  }
  if (buffer.trim()) {
    for (const delta of parseOpenAIEventBlocks([buffer])) {
      yield delta;
    }
  }
}

async function* streamAnthropicDeltas(provider, messages, temperature) {
  const body = await callAnthropic(provider, messages, temperature, { stream: true });
  let buffer = "";
  for await (const chunk of body) {
    buffer += Buffer.from(chunk).toString("utf8");
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() || "";
    for (const delta of parseAnthropicEventBlocks(eventBlocks)) {
      yield delta;
    }
  }
  if (buffer.trim()) {
    for (const delta of parseAnthropicEventBlocks([buffer])) {
      yield delta;
    }
  }
}

function parseOpenAIEventBlocks(eventBlocks) {
  const deltas = [];
  for (const eventBlock of eventBlocks) {
    const dataLines = eventBlock
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6).trim());
    for (const data of dataLines) {
      if (!data || data === "[DONE]") continue;
      const payloadChunk = JSON.parse(data);
      const delta = payloadChunk?.choices?.[0]?.delta?.content || "";
      if (delta) deltas.push(delta);
    }
  }
  return deltas;
}

function parseAnthropicEventBlocks(eventBlocks) {
  const deltas = [];
  for (const eventBlock of eventBlocks) {
    const dataLines = eventBlock
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6).trim());
    for (const data of dataLines) {
      if (!data) continue;
      const payloadChunk = JSON.parse(data);
      const delta = payloadChunk?.delta?.text || "";
      if (payloadChunk?.type === "content_block_delta" && delta) deltas.push(delta);
    }
  }
  return deltas;
}
