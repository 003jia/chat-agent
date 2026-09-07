import { describe, expect, it } from "vitest";
import { buildDocx, buildMarkdownDocument, buildZipStore, normalizeDocumentInput } from "./office.mjs";

describe("markdown office documents", () => {
  it("renders title, summary and sections", () => {
    const markdown = buildMarkdownDocument({
      title: "会议纪要",
      summary: "本次会议确定了下个迭代的范围。",
      sections: [
        { heading: "结论", paragraphs: ["按时交付", "补充测试"], bullets: ["范围A", "范围B"] },
        { heading: "待办", bullets: ["写测试"] }
      ]
    });

    expect(markdown).toContain("# 会议纪要");
    expect(markdown).toContain("## 结论");
    expect(markdown).toContain("- 范围A");
    expect(markdown).toContain("## 待办");
  });

  it("rejects missing titles and overlong sections", () => {
    expect(() => buildMarkdownDocument({})).toThrowError(/标题不能为空/);
    expect(() => buildMarkdownDocument({
      title: "t",
      sections: Array.from({ length: 21 }, (_item, index) => ({ heading: `h${index}` }))
    })).toThrowError(/章节数/);
  });

  it("normalizes document paths by format", () => {
    expect(normalizeDocumentInput({ title: "周报", path: "docs/周报.md" }, false))
      .toEqual({ title: "周报", path: "docs/周报.md" });
    expect(() => normalizeDocumentInput({ title: "周报", path: "x.txt" }, true))
      .toThrowError(/\.docx 结尾/);
    const auto = normalizeDocumentInput({ title: "周报" }, false);
    expect(auto.path.endsWith(".md")).toBe(true);
    const autoDocx = normalizeDocumentInput({ title: "方案" }, true);
    expect(autoDocx.path.endsWith(".docx")).toBe(true);
  });
});

describe("docx generation", () => {
  it("produces a valid STORE zip with required entries", () => {
    const buffer = buildDocx({
      title: "方案",
      blocks: [
        { type: "heading", text: "概述" },
        { type: "paragraph", text: "正文内容 & 特殊 <字符>" },
        { type: "table", rows: [["名称", "状态"], ["发布", "已确认"]] }
      ]
    });

    expect(buffer.subarray(0, 4).toString("latin1")).toBe("PK\u0003\u0004");
    const entries = parseZipCentralDirectory(buffer);
    expect(entries.map((entry) => entry.name)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml"
    ]);

    for (const entry of entries) {
      const data = extractEntryData(buffer, entry);
      expect(crc32(data)).toBe(entry.crc);
    }
    const documentXml = extractEntryData(buffer, entries[2]).toString("utf8");
    expect(documentXml).toContain("<w:body>");
    expect(documentXml).toContain("正文内容 &amp; 特殊 &lt;字符&gt;");
    expect(documentXml).toContain("名称");
    expect(documentXml).toContain("已确认");
  });

  it("rejects invalid blocks and table shapes", () => {
    expect(() => buildDocx({ title: "t", blocks: [{ type: "nope", text: "x" }] })).toThrowError(/不支持的内容块类型/);
    expect(() => buildDocx({ title: "t", blocks: [{ type: "table", rows: [["a"], ["b", "c"]] }] })).toThrowError(/行列数必须一致/);
    expect(() => buildDocx({ title: "t", blocks: [{ type: "table", rows: [[], []] }] })).toThrowError(/包含单元格/);
  });
});

describe("zip store builder", () => {
  it("preserves entry data round-trip", () => {
    const buffer = buildZipStore([
      { name: "a.txt", data: Buffer.from("hello", "utf8") },
      { name: "dir/b.bin", data: Buffer.from([0, 1, 2, 255]) }
    ]);
    const entries = parseZipCentralDirectory(buffer);
    expect(entries.length).toBe(2);
    expect(extractEntryData(buffer, entries[0]).toString("utf8")).toBe("hello");
    expect([...extractEntryData(buffer, entries[1])]).toEqual([0, 1, 2, 255]);
  });
});

function parseZipCentralDirectory(buffer) {
  const entries = [];
  const endIndex = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const centralOffset = buffer.readUInt32LE(endIndex + 16);
  const count = buffer.readUInt16LE(endIndex + 10);
  let offset = centralOffset;
  for (let index = 0; index < count; index++) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const crc = buffer.readUInt32LE(offset + 16);
    const localOffset = buffer.readUInt32LE(offset + 42);
    entries.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      crc,
      localOffset
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractEntryData(buffer, entry) {
  const localHeader = entry.localOffset;
  const nameLength = buffer.readUInt16LE(localHeader + 26);
  const extraLength = buffer.readUInt16LE(localHeader + 28);
  const compressedSize = buffer.readUInt32LE(localHeader + 18);
  const dataStart = localHeader + 30 + nameLength + extraLength;
  return buffer.subarray(dataStart, dataStart + compressedSize);
}

function crc32(buffer) {
  const table = buildTable();
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let table = null;
function buildTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}