/**
 * @file 办公文档产物生成：结构化 Markdown 文档与极简 .docx（无第三方依赖）。
 * .docx 用 STORE（不压缩）ZIP 打包 WordprocessingML，满足常见办公交付场景。
 */
import { createId } from "./ids.mjs";
import { apiError } from "./errors.mjs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_EXTENSION = "docx";
const DOC_EXTENSION = "md";
const MAX_DOC_SECTIONS = 20;
const MAX_DOC_PARAGRAPHS = 200;
const MAX_DOC_TABLE_ROWS = 100;
const MAX_DOC_TABLE_COLUMNS = 20;
const MAX_TEXT_FRAGMENT_LENGTH = 200_000;

const CRC_TABLE = buildCrc32Table();

/**
 * 生成结构化 Markdown 办公文档内容。
 *
 * @param {object} input - 文档输入
 * @param {string} input.title - 文档标题
 * @param {string} [input.summary] - 开头摘要
 * @param {Array} [input.sections] - 章节列表
 * @returns {string} Markdown 文本
 */
export function buildMarkdownDocument(input) {
  const title = normalizeTitle(input?.title);
  const lines = [`# ${title}`];
  const summary = String(input?.summary || "").trim();
  if (summary) lines.push("", summary);
  const sections = normalizeSections(input?.sections);
  for (const section of sections) {
    lines.push("", `## ${section.heading}`);
    for (const paragraph of section.paragraphs || []) {
      lines.push("", paragraph);
    }
    if (section.bullets?.length) lines.push("", ...section.bullets.map((item) => `- ${item}`));
  }
  lines.push("", `---`, "", `*由 Memory Agent 生成的办公文档。`);
  return `${lines.join("\n")}\n`;
}

/**
 * 生成 .docx 文件内容（ZIP STORE 打包）。
 *
 * @param {object} input - 文档输入
 * @param {string} input.title - 文档标题
 * @param {Array} [input.blocks] - 内容块（{ type: "paragraph" | "heading" | "table", ... }）
 * @returns {Buffer} .docx 字节
 */
export function buildDocx(input) {
  const title = normalizeTitle(input?.title);
  const blocks = normalizeDocxBlocks(input?.blocks);
  const xml = buildDocumentXml(title, blocks);
  const entries = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(contentTypesXml(), "utf8")
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(relsXml(), "utf8")
    },
    {
      name: "word/document.xml",
      data: Buffer.from(xml, "utf8")
    }
  ];
  return buildZipStore(entries);
}

/**
 * 校验文档工具输入并生成章节参数。
 *
 * @param {object} input - 工具输入
 * @param {boolean} docx - 是否为 docx 模式
 * @returns {{ title: string, path: string }} 规范化后的输入
 */
export function normalizeDocumentInput(input, docx) {
  const title = normalizeTitle(input?.title);
  const extension = docx ? DOCX_EXTENSION : DOC_EXTENSION;
  let filePath = String(input?.path || "").trim();
  if (!filePath) {
    filePath = `${slugify(title)}.${extension}`;
  } else if (docx && !filePath.toLowerCase().endsWith(`.${DOCX_EXTENSION}`)) {
    throw apiError(400, "OFFICE_PATH_INVALID", ".docx 文档路径必须以 .docx 结尾。");
  } else if (!docx && !filePath.toLowerCase().endsWith(`.${DOC_EXTENSION}`)) {
    throw apiError(400, "OFFICE_PATH_INVALID", "Markdown 文档路径必须以 .md 结尾。");
  }
  return { title, path: filePath };
}

function normalizeTitle(value) {
  const title = String(value || "").trim().slice(0, 200);
  if (!title) throw apiError(400, "OFFICE_TITLE_REQUIRED", "文档标题不能为空。");
  return title;
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  if (sections.length > MAX_DOC_SECTIONS) {
    throw apiError(400, "OFFICE_VALIDATION", `章节数不能超过 ${MAX_DOC_SECTIONS} 个。`);
  }
  const normalized = [];
  for (const section of sections) {
    const heading = String(section?.heading || "").trim().slice(0, 200);
    if (!heading) continue;
    const paragraphs = (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, MAX_DOC_PARAGRAPHS)
      .map((item) => item.slice(0, MAX_TEXT_FRAGMENT_LENGTH));
    const bullets = (Array.isArray(section?.bullets) ? section.bullets : [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, MAX_DOC_PARAGRAPHS)
      .map((item) => item.slice(0, MAX_TEXT_FRAGMENT_LENGTH));
    normalized.push({ heading, paragraphs, bullets });
  }
  return normalized;
}

function normalizeDocxBlocks(blocks) {
  if (blocks === undefined || blocks === null) return [];
  if (!Array.isArray(blocks)) {
    throw apiError(400, "OFFICE_VALIDATION", "blocks 必须是数组。");
  }
  if (blocks.length > MAX_DOC_PARAGRAPHS) {
    throw apiError(400, "OFFICE_VALIDATION", `内容块不能超过 ${MAX_DOC_PARAGRAPHS} 个。`);
  }
  const normalized = [];
  for (const block of blocks) {
    const type = String(block?.type || "paragraph");
    if (type === "paragraph" || type === "heading") {
      const text = String(block?.text || "").trim().slice(0, MAX_TEXT_FRAGMENT_LENGTH);
      if (!text) continue;
      normalized.push({ type, text });
      continue;
    }
    if (type === "table") {
      const rows = Array.isArray(block?.rows) ? block.rows : [];
      if (!rows.length || rows.length > MAX_DOC_TABLE_ROWS) {
        throw apiError(400, "OFFICE_TABLE_INVALID", "表格行数无效。");
      }
      let columnCount = null;
      const normalizedRows = rows.map((row) => {
        if (!Array.isArray(row) || !row.length) {
          throw apiError(400, "OFFICE_TABLE_INVALID", "表格行必须是包含单元格的数组。");
        }
        if (row.length > MAX_DOC_TABLE_COLUMNS) {
          throw apiError(400, "OFFICE_TABLE_INVALID", `表格列数不能超过 ${MAX_DOC_TABLE_COLUMNS} 列。`);
        }
        if (columnCount === null) columnCount = row.length;
        if (row.length !== columnCount) {
          throw apiError(400, "OFFICE_TABLE_INVALID", "表格各行列数必须一致。");
        }
        return row.map((cell) => String(cell || "").slice(0, 2000));
      });
      normalized.push({ type, rows: normalizedRows });
      continue;
    }
    throw apiError(400, "OFFICE_BLOCK_INVALID", `不支持的内容块类型：${type}`);
  }
  return normalized;
}

function buildDocumentXml(title, blocks) {
  const body = [
    paragraphXml(title, { style: "Title" }),
    ...blocks.map((block) => renderDocxBlock(block))
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

function renderDocxBlock(block) {
  if (block.type === "heading") {
    return paragraphXml(block.text, {
      style: block.level === 2 ? "Heading2" : "Heading1",
      spacingAfter: 120
    });
  }
  if (block.type === "table") {
    return tableXml(block.rows);
  }
  return paragraphXml(block.text, {});
}

function paragraphXml(text, options) {
  const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : "";
  const spacing = options.spacingAfter
    ? `<w:spacing w:after="${options.spacingAfter}" w:line="360" w:lineRule="auto"/>`
    : `<w:spacing w:line="360" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${style}${spacing}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function tableXml(rows) {
  const grid = `<w:tblGrid>${rows[0].map(() => "<w:gridCol/>").join("")}</w:tblGrid>`;
  const body = rows.map((row) => `<w:tr>${row.map((cell) => tableCellXml(cell)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders><w:tblW w:w="0" w:type="auto"/></w:tblPr>${grid}<w:trPr/><w:tbody>${body}</w:tbody></w:tbl>`;
}

function tableCellXml(text) {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${DOCX_MIME}"/>
</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

/**
 * 构建最小 ZIP 归档（全部 STORE 不压缩）。
 *
 * @param {Array} entries - [{ name: string, data: Buffer }]
 * @returns {Buffer} ZIP 字节
 */
export function buildZipStore(entries) {
  const parts = [];
  const centralDirectory = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    parts.push(localHeader, nameBuffer, entry.data);

const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectory.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }
  const centralSize = centralDirectory.reduce((total, part) => total + part.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...centralDirectory, endRecord]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = createId("doc").slice(0, 8);
  return (slug || "document") + `-${suffix}`;
}