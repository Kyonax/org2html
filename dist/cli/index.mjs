#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";

// src/cli/commands/build.ts
import { readFile as readFile2, writeFile, mkdir, copyFile } from "fs/promises";
import { join as join2, dirname as dirname3 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import glob from "fast-glob";
import chalk from "chalk";

// src/parser/lexer.ts
function tokenize(content) {
  const lines = content.split("\n");
  const tokens = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (!trimmed) {
      tokens.push({ type: "BLANK", value: "", line: i, indent });
      continue;
    }
    const headingMatch = trimmed.match(/^(\*+)\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      tokens.push({
        type: "HEADING",
        value: text,
        line: i,
        indent,
        properties: { level }
      });
      continue;
    }
    if (trimmed.match(/^#\+BEGIN_SRC\s*/i)) {
      const langMatch = trimmed.match(/^#\+BEGIN_SRC\s+(\w+)/i);
      tokens.push({
        type: "CODE_BLOCK_START",
        value: "",
        line: i,
        indent,
        properties: { language: langMatch?.[1] || "" }
      });
      continue;
    }
    if (trimmed.match(/^#\+END_SRC/i)) {
      tokens.push({ type: "CODE_BLOCK_END", value: "", line: i, indent });
      continue;
    }
    const blockStartMatch = trimmed.match(/^#\+BEGIN_(\w+)/i);
    if (blockStartMatch) {
      tokens.push({
        type: "BLOCK_START",
        value: "",
        line: i,
        indent,
        properties: { blockType: blockStartMatch[1].toUpperCase() }
      });
      continue;
    }
    const blockEndMatch = trimmed.match(/^#\+END_(\w+)/i);
    if (blockEndMatch) {
      tokens.push({
        type: "BLOCK_END",
        value: "",
        line: i,
        indent,
        properties: { blockType: blockEndMatch[1].toUpperCase() }
      });
      continue;
    }
    if (trimmed.match(/^:(\w+):$/)) {
      tokens.push({
        type: "DRAWER_START",
        value: trimmed,
        line: i,
        indent,
        properties: { name: trimmed.slice(1, -1) }
      });
      continue;
    }
    if (trimmed === ":END:") {
      tokens.push({ type: "DRAWER_END", value: "", line: i, indent });
      continue;
    }
    if (trimmed.startsWith("|")) {
      tokens.push({ type: "TABLE_ROW", value: trimmed, line: i, indent });
      continue;
    }
    const listMatch = trimmed.match(/^([-+*]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d+[.)]/.test(listMatch[1]);
      tokens.push({
        type: "LIST_ITEM",
        value: listMatch[2],
        line: i,
        indent,
        properties: { ordered }
      });
      continue;
    }
    const shortcodeMatch = trimmed.match(/^\{\{<\s*(\w+)(.*)>\}\}/);
    if (shortcodeMatch) {
      tokens.push({
        type: "SHORTCODE",
        value: trimmed,
        line: i,
        indent,
        properties: { component: shortcodeMatch[1] }
      });
      continue;
    }
    tokens.push({ type: "TEXT", value: line, line: i, indent });
  }
  return tokens;
}

// src/parser/ast.ts
function createNode(type, properties, children) {
  return {
    type,
    ...properties && { properties },
    ...children && { children }
  };
}
function createTextNode(value) {
  return {
    type: "text",
    value
  };
}
function createDocument(metadata, children) {
  return {
    type: "document",
    metadata,
    children
  };
}

// src/parser/metadata.ts
import slugify from "slugify";
function extractMetadata(lines) {
  const metadata = {
    options: {},
    properties: {},
    tags: [],
    keywords: []
  };
  let i = 0;
  let inPropertyDrawer = false;
  const propertyDrawerProps = {};
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === ":PROPERTIES:") {
      inPropertyDrawer = true;
      i++;
      continue;
    }
    if (line === ":END:" && inPropertyDrawer) {
      inPropertyDrawer = false;
      metadata.properties = { ...metadata.properties, ...propertyDrawerProps };
      i++;
      continue;
    }
    if (inPropertyDrawer) {
      const propMatch = line.match(/^:(\w+):\s*(.*)$/);
      if (propMatch) {
        propertyDrawerProps[propMatch[1]] = propMatch[2];
      }
      i++;
      continue;
    }
    const metaMatch = line.match(/^#\+(\w+):\s*(.*)$/i);
    if (metaMatch) {
      const key = metaMatch[1].toUpperCase();
      const value = metaMatch[2].trim();
      switch (key) {
        case "TITLE":
          metadata.title = value;
          break;
        case "AUTHOR":
          metadata.author = value;
          break;
        case "DATE":
          metadata.date = value;
          break;
        case "EMAIL":
          metadata.email = value;
          break;
        case "DESCRIPTION":
          metadata.description = value;
          break;
        case "KEYWORDS":
          metadata.keywords = value.split(",").map((k) => k.trim());
          break;
        case "LANGUAGE":
          metadata.language = value;
          break;
        case "CATEGORY":
          metadata.category = value;
          break;
        case "FILETAGS":
          metadata.tags = parseFileTags(value);
          break;
        case "OPTIONS":
          metadata.options = { ...metadata.options, ...parseOptions(value) };
          break;
        case "CANONICAL":
          metadata.canonical = value;
          break;
        case "COVER_IMAGE":
          metadata.coverImage = value;
          break;
        case "OG_IMAGE":
          metadata.ogImage = value;
          break;
        case "OG_TITLE":
          metadata.ogTitle = value;
          break;
        case "OG_DESCRIPTION":
          metadata.ogDescription = value;
          break;
        case "OG_TYPE":
          metadata.ogType = value;
          break;
        case "TWITTER_CARD":
          metadata.twitterCard = value;
          break;
        case "TWITTER_SITE":
          metadata.twitterSite = value;
          break;
        case "TWITTER_CREATOR":
          metadata.twitterCreator = value;
          break;
        case "THEME_COLOR":
          metadata.themeColor = value;
          break;
        case "ROBOTS":
          metadata.robots = value;
          break;
        default:
          if (!metadata.properties) metadata.properties = {};
          metadata.properties[key] = value;
      }
      i++;
      continue;
    }
    if (line && !line.startsWith("#") && !line.startsWith(":")) {
      break;
    }
    i++;
  }
  if (metadata.title) {
    metadata.slug = slugify(metadata.title, { lower: true, strict: true });
  }
  return { metadata, contentStartLine: i };
}
function parseFileTags(value) {
  const tags = value.match(/:(\w+)/g);
  return tags ? tags.map((t) => t.substring(1)) : [];
}
function parseOptions(optionsString) {
  const options = {};
  const parts = optionsString.match(/(\w+):(\S+)/g) || [];
  for (const part of parts) {
    const [key, value] = part.split(":");
    switch (key.toLowerCase()) {
      case "toc":
        options.toc = value === "nil" ? false : value === "t" ? true : Number.parseInt(value, 10);
        break;
      case "num":
        options.num = value !== "nil";
        break;
      case "date":
        options.date = value !== "nil";
        break;
      case "h":
        options.H = Number.parseInt(value, 10);
        break;
      case "author":
        options.author = value !== "nil";
        break;
      case "email":
        options.email = value !== "nil";
        break;
      case "title":
        options.title = value !== "nil";
        break;
      case "_":
        options.subscript = value !== "nil";
        break;
      case "^":
        options.superscript = value !== "nil";
        break;
      case "tex":
        options.tex = value !== "nil";
        break;
      default:
        options[key] = value === "nil" ? false : value === "t" ? true : value;
    }
  }
  return options;
}
function calculateReadingTime(text) {
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}
function extractExcerpt(text, maxLength = 160) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + "...";
}

// src/parser/parser.ts
function parse(content) {
  const lines = content.split("\n");
  const { metadata, contentStartLine } = extractMetadata(lines);
  const contentLines = lines.slice(contentStartLine);
  const tokens = tokenize(contentLines.join("\n"));
  const children = parseTokens(tokens);
  const plainText = extractPlainText(children);
  metadata.readingTime = calculateReadingTime(plainText);
  metadata.wordCount = plainText.split(/\s+/).length;
  if (!metadata.excerpt && metadata.description) {
    metadata.excerpt = metadata.description;
  } else if (!metadata.excerpt) {
    metadata.excerpt = extractExcerpt(plainText);
  }
  return createDocument(metadata, children);
}
function parseTokens(tokens) {
  const nodes = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    switch (token.type) {
      case "HEADING": {
        const heading = parseHeading(token);
        nodes.push(heading);
        i++;
        break;
      }
      case "CODE_BLOCK_START": {
        const { node, endIndex } = parseCodeBlock(tokens, i);
        nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "BLOCK_START": {
        const { node, endIndex } = parseBlock(tokens, i);
        nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "TABLE_ROW": {
        const { node, endIndex } = parseTable(tokens, i);
        nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "LIST_ITEM": {
        const { node, endIndex } = parseList(tokens, i);
        nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "DRAWER_START": {
        const { node, endIndex } = parseDrawer(tokens, i);
        if (node) nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "SHORTCODE": {
        const shortcode = parseShortcode(token);
        nodes.push(shortcode);
        i++;
        break;
      }
      case "TEXT": {
        const { node, endIndex } = parseParagraph(tokens, i);
        if (node) nodes.push(node);
        i = endIndex + 1;
        break;
      }
      case "BLANK":
        i++;
        break;
      default:
        i++;
    }
  }
  return nodes;
}
function parseHeading(token) {
  const level = token.properties?.level || 1;
  const text = token.value;
  const tagMatch = text.match(/^(.*?)\s+:([\w:]+):$/);
  const content = tagMatch ? tagMatch[1] : text;
  const tags = tagMatch ? tagMatch[2].split(":").filter(Boolean) : [];
  return createNode(
    "heading",
    { level, tags },
    parseInlineMarkup(content)
  );
}
function parseCodeBlock(tokens, startIndex) {
  const startToken = tokens[startIndex];
  const language = startToken.properties?.language || "";
  const codeLines = [];
  let i = startIndex + 1;
  while (i < tokens.length && tokens[i].type !== "CODE_BLOCK_END") {
    codeLines.push(tokens[i].value);
    i++;
  }
  return {
    node: createNode("codeBlock", { language }, [createTextNode(codeLines.join("\n"))]),
    endIndex: i
  };
}
function parseBlock(tokens, startIndex) {
  const startToken = tokens[startIndex];
  const blockType = startToken.properties?.blockType || "QUOTE";
  const contentLines = [];
  let i = startIndex + 1;
  while (i < tokens.length && tokens[i].type !== "BLOCK_END") {
    contentLines.push(tokens[i].value);
    i++;
  }
  const content = contentLines.join("\n");
  const nodeType = blockType === "QUOTE" ? "quote" : blockType === "EXAMPLE" ? "example" : blockType === "VERSE" ? "verse" : blockType === "CENTER" ? "center" : "quote";
  return {
    node: createNode(nodeType, {}, parseInlineMarkup(content)),
    endIndex: i
  };
}
function parseTable(tokens, startIndex) {
  const rows = [];
  let i = startIndex;
  while (i < tokens.length && tokens[i].type === "TABLE_ROW") {
    const rowValue = tokens[i].value;
    if (rowValue.match(/^\|[-+:| ]+\|$/)) {
      i++;
      continue;
    }
    const cells = rowValue.split("|").slice(1, -1).map((cell) => cell.trim());
    const cellNodes = cells.map(
      (cell) => createNode("tableCell", {}, parseInlineMarkup(cell))
    );
    rows.push(createNode("tableRow", {}, cellNodes));
    i++;
  }
  return {
    node: createNode("table", {}, rows),
    endIndex: i - 1
  };
}
function parseList(tokens, startIndex) {
  const items = [];
  const ordered = tokens[startIndex].properties?.ordered || false;
  const baseIndent = tokens[startIndex].indent;
  let i = startIndex;
  while (i < tokens.length && tokens[i].type === "LIST_ITEM" && tokens[i].indent === baseIndent) {
    const itemContent = parseInlineMarkup(tokens[i].value);
    items.push(createNode("listItem", {}, itemContent));
    i++;
  }
  return {
    node: createNode("list", { ordered }, items),
    endIndex: i - 1
  };
}
function parseDrawer(tokens, startIndex) {
  const drawerName = tokens[startIndex].properties?.name || "";
  const contentLines = [];
  let i = startIndex + 1;
  while (i < tokens.length && tokens[i].type !== "DRAWER_END") {
    contentLines.push(tokens[i].value);
    i++;
  }
  if (drawerName === "PROPERTIES") {
    return { node: null, endIndex: i };
  }
  return {
    node: createNode("drawer", { name: drawerName }, [createTextNode(contentLines.join("\n"))]),
    endIndex: i
  };
}
function parseShortcode(token) {
  const match = token.value.match(/\{\{<\s*(\w+)(.*?)>\}\}/);
  if (!match) return createTextNode(token.value);
  const component = match[1];
  const attrsString = match[2].trim();
  const attrs = {};
  const attrMatches = attrsString.matchAll(/(\w+)="([^"]*)"/g);
  for (const attrMatch of attrMatches) {
    attrs[attrMatch[1]] = attrMatch[2];
  }
  return createNode("shortcode", { component, attrs });
}
function parseParagraph(tokens, startIndex) {
  const lines = [];
  let i = startIndex;
  while (i < tokens.length && tokens[i].type === "TEXT") {
    lines.push(tokens[i].value.trim());
    i++;
  }
  if (lines.length === 0) return { node: null, endIndex: i - 1 };
  const content = lines.join(" ");
  return {
    node: createNode("paragraph", {}, parseInlineMarkup(content)),
    endIndex: i - 1
  };
}
function parseInlineMarkup(text) {
  const nodes = [];
  let current = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] !== " ") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        const content = text.substring(i + 1, end);
        nodes.push(createNode("bold", {}, parseInlineMarkup(content)));
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "/" && text[i + 1] !== " ") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("/", i + 1);
      if (end !== -1) {
        const content = text.substring(i + 1, end);
        nodes.push(createNode("italic", {}, [createTextNode(content)]));
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "_" && text[i + 1] !== " ") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("_", i + 1);
      if (end !== -1) {
        const content = text.substring(i + 1, end);
        nodes.push(createNode("underline", {}, [createTextNode(content)]));
        i = end + 1;
        continue;
      }
    }
    if ((text[i] === "~" || text[i] === "=") && text[i + 1] !== " ") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const marker = text[i];
      const end = text.indexOf(marker, i + 1);
      if (end !== -1) {
        const content = text.substring(i + 1, end);
        nodes.push(createNode(marker === "~" ? "code" : "verbatim", {}, [createTextNode(content)]));
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "+" && text[i + 1] !== " ") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("+", i + 1);
      if (end !== -1) {
        const content = text.substring(i + 1, end);
        nodes.push(createNode("strike", {}, [createTextNode(content)]));
        i = end + 1;
        continue;
      }
    }
    if (text.substring(i, i + 2) === "[[") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("]]", i + 2);
      if (end !== -1) {
        const linkContent = text.substring(i + 2, end);
        const parts = linkContent.split("][");
        const url = parts[0];
        const description = parts[1] || url;
        if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
          nodes.push(createNode("image", { src: url, alt: description }));
        } else {
          nodes.push(createNode("link", { href: url }, [createTextNode(description)]));
        }
        i = end + 2;
        continue;
      }
    }
    if (text.substring(i, i + 4) === "[fn:") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      const end = text.indexOf("]", i + 4);
      if (end !== -1) {
        const ref = text.substring(i + 4, end);
        nodes.push(createNode("footnote", { ref }));
        i = end + 1;
        continue;
      }
    }
    if (text.substring(i, i + 2) === "\\\\") {
      if (current) {
        nodes.push(createTextNode(current));
        current = "";
      }
      nodes.push(createNode("lineBreak", {}));
      i += 2;
      continue;
    }
    current += text[i];
    i++;
  }
  if (current) {
    nodes.push(createTextNode(current));
  }
  return nodes;
}
function extractPlainText(nodes) {
  let text = "";
  for (const node of nodes) {
    if (node.value) {
      text += node.value + " ";
    }
    if (node.children) {
      text += extractPlainText(node.children) + " ";
    }
  }
  return text;
}

// src/renderer/sanitizer.ts
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
var window = new JSDOM("").window;
var purify = DOMPurify(window);
function sanitizeHtml(html) {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "strong",
      "em",
      "u",
      "del",
      "code",
      "pre",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "blockquote",
      "div",
      "span",
      "sup",
      "sub"
    ],
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "class",
      "id",
      "data-component",
      "data-props"
    ],
    ALLOW_DATA_ATTR: true
  });
}

// src/plugins/code-highlight.ts
import { getHighlighter } from "shiki";
var highlighter = null;
async function highlightCode(code, language) {
  if (!highlighter) {
    highlighter = await getHighlighter({
      themes: ["github-dark", "github-light"],
      langs: ["javascript", "typescript", "python", "rust", "go", "java", "html", "css", "json", "markdown"]
    });
  }
  try {
    return highlighter.codeToHtml(code, {
      lang: language || "text",
      theme: "github-dark"
    });
  } catch (error) {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/plugins/toc.ts
function generateToc(headings, maxDepth = 3) {
  if (headings.length === 0) return "";
  let html = '<nav class="toc"><h2>Table of Contents</h2><ul>';
  let currentLevel = headings[0].level;
  for (const heading of headings) {
    if (heading.level > maxDepth) continue;
    while (heading.level > currentLevel) {
      html += "<ul>";
      currentLevel++;
    }
    while (heading.level < currentLevel) {
      html += "</ul>";
      currentLevel--;
    }
    html += `<li><a href="#${heading.id}">${escapeHtml2(heading.text)}</a></li>`;
  }
  while (currentLevel > headings[0].level) {
    html += "</ul>";
    currentLevel--;
  }
  html += "</ul></nav>\n";
  return html;
}
function escapeHtml2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/renderer/html-renderer.ts
async function renderToHtml(ast, options = {}) {
  const context = {
    options,
    footnotes: /* @__PURE__ */ new Map(),
    footnoteCounter: 1,
    headings: []
  };
  let bodyHtml = "";
  for (const node of ast.children) {
    bodyHtml += await renderNode(node, context);
  }
  const tocEnabled = ast.metadata.options?.toc !== false;
  let tocHtml = "";
  if (tocEnabled && context.headings.length > 0) {
    const tocDepth = typeof ast.metadata.options?.toc === "number" ? ast.metadata.options.toc : 3;
    tocHtml = generateToc(context.headings, tocDepth);
  }
  let footnotesHtml = "";
  if (context.footnotes.size > 0) {
    footnotesHtml = '<div class="footnotes"><hr><ol>';
    for (const [ref, content] of context.footnotes) {
      footnotesHtml += `<li id="fn-${escapeHtml3(String(ref))}">${content} <a href="#fnref-${escapeHtml3(String(ref))}">\u21A9</a></li>`;
    }
    footnotesHtml += "</ol></div>";
  }
  const fullHtml = tocHtml + bodyHtml + footnotesHtml;
  const finalHtml = options.sanitize !== false ? sanitizeHtml(fullHtml) : fullHtml;
  return {
    html: finalHtml,
    metadata: ast.metadata
  };
}
async function renderNode(node, context) {
  switch (node.type) {
    case "heading":
      return renderHeading(node, context);
    case "paragraph":
      return renderParagraph(node, context);
    case "list":
      return await renderList(node, context);
    case "listItem":
      return await renderListItem(node, context);
    case "table":
      return await renderTable(node, context);
    case "tableRow":
      return await renderTableRow(node, context);
    case "tableCell":
      return await renderTableCell(node, context);
    case "codeBlock":
      return await renderCodeBlock(node, context);
    case "quote":
      return await renderQuote(node, context);
    case "example":
      return await renderExample(node, context);
    case "verse":
      return await renderVerse(node, context);
    case "center":
      return await renderCenter(node, context);
    case "shortcode":
      return renderShortcode(node, context);
    case "bold":
      return `<strong>${await renderChildren(node, context)}</strong>`;
    case "italic":
      return `<em>${await renderChildren(node, context)}</em>`;
    case "underline":
      return `<u>${await renderChildren(node, context)}</u>`;
    case "code":
      return `<code>${await renderChildren(node, context)}</code>`;
    case "verbatim":
      return `<code class="verbatim">${await renderChildren(node, context)}</code>`;
    case "strike":
      return `<del>${await renderChildren(node, context)}</del>`;
    case "link":
      return renderLink(node, context);
    case "image":
      return renderImage(node, context);
    case "footnote":
      return renderFootnote(node, context);
    case "lineBreak":
      return "<br>";
    case "text":
      return escapeHtml3(String(node.value ?? ""));
    default:
      return "";
  }
}
async function renderChildren(node, context) {
  if (!node.children) return "";
  let html = "";
  for (const child of node.children) {
    html += await renderNode(child, context);
  }
  return html;
}
function renderHeading(node, context) {
  const level = Math.min(Number(node.properties?.level ?? 1), 6);
  const text = (node.children ?? []).map((c) => String(c.value ?? "")).join("");
  const id = slugify2(text);
  context.headings.push({ level, text, id });
  const numberingEnabled = context.options?.num !== false;
  const headingNumber = numberingEnabled ? "" : "";
  return `<h${level} id="${escapeHtml3(id)}">${headingNumber}${renderChildrenSync(node)}</h${level}>
`;
}
function renderParagraph(node, context) {
  return `<p>${renderChildrenSync(node)}</p>
`;
}
async function renderList(node, context) {
  const tag = node.properties?.ordered ? "ol" : "ul";
  const items = await renderChildren(node, context);
  return `<${tag}>
${items}</${tag}>
`;
}
async function renderListItem(node, context) {
  return `<li>${await renderChildren(node, context)}</li>
`;
}
async function renderTable(node, context) {
  const rows = await renderChildren(node, context);
  return `<table>
<tbody>
${rows}</tbody>
</table>
`;
}
async function renderTableRow(node, context) {
  const cells = await renderChildren(node, context);
  return `<tr>
${cells}</tr>
`;
}
async function renderTableCell(node, context) {
  return `<td>${await renderChildren(node, context)}</td>
`;
}
async function renderCodeBlock(node, context) {
  const language = String(node.properties?.language ?? "");
  const code = String(node.children?.[0]?.value ?? "");
  if (context.options.codeHighlight !== false) {
    const highlighted = await highlightCode(code, language);
    return `<pre><code class="language-${escapeHtml3(language)}">${highlighted}</code></pre>
`;
  }
  return `<pre><code class="language-${escapeHtml3(language)}">${escapeHtml3(code)}</code></pre>
`;
}
async function renderQuote(node, context) {
  return `<blockquote>
${await renderChildren(node, context)}</blockquote>
`;
}
async function renderExample(node, context) {
  return `<pre class="example">${await renderChildren(node, context)}</pre>
`;
}
async function renderVerse(node, context) {
  return `<p class="verse">${await renderChildren(node, context)}</p>
`;
}
async function renderCenter(node, context) {
  return `<div class="center">${await renderChildren(node, context)}</div>
`;
}
function renderShortcode(node, context) {
  const component = String(node.properties?.component ?? "");
  const attrs = node.properties?.attrs ?? {};
  const attrString = Object.entries(attrs).map(([key, value]) => `${escapeHtml3(String(key))}="${escapeHtml3(String(value ?? ""))}"`).join(" ");
  return `<div data-component="${escapeHtml3(component)}" ${attrString}></div>
`;
}
function renderLink(node, context) {
  const href = String(node.properties?.href ?? "");
  const text = renderChildrenSync(node);
  return `<a href="${escapeHtml3(href)}">${text}</a>`;
}
function renderImage(node, context) {
  const src = String(node.properties?.src ?? "");
  const alt = String(node.properties?.alt ?? "");
  return `<img src="${escapeHtml3(src)}" alt="${escapeHtml3(alt)}">`;
}
function renderFootnote(node, context) {
  const ref = String(node.properties?.ref ?? "");
  const num = context.footnoteCounter++;
  context.footnotes.set(ref, `Footnote ${escapeHtml3(ref)}`);
  return `<sup id="fnref-${escapeHtml3(ref)}"><a href="#fn-${escapeHtml3(ref)}">${num}</a></sup>`;
}
function renderChildrenSync(node) {
  if (!node.children) return "";
  return node.children.map((child) => {
    if (child.type === "text") return escapeHtml3(String(child.value ?? ""));
    if (child.type === "bold") return `<strong>${renderChildrenSync(child)}</strong>`;
    if (child.type === "italic") return `<em>${renderChildrenSync(child)}</em>`;
    if (child.type === "code") return `<code>${renderChildrenSync(child)}</code>`;
    if (child.type === "link") return `<a href="${escapeHtml3(String(child.properties?.href ?? ""))}">${renderChildrenSync(child)}</a>`;
    return renderChildrenSync(child);
  }).join("");
}
function escapeHtml3(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function slugify2(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

// src/renderer/template.ts
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
async function applyTemplate(html, metadata, templatePath, templateDir) {
  let template;
  let styles;
  if (templatePath) {
    template = await readFile(templatePath, "utf-8");
    try {
      const stylesPath = join(dirname(templatePath), "styles.css");
      styles = await readFile(stylesPath, "utf-8");
    } catch {
      styles = await getDefaultStyles();
    }
  } else if (templateDir) {
    try {
      template = await readFile(join(templateDir, "default.html"), "utf-8");
      styles = await readFile(join(templateDir, "styles.css"), "utf-8");
    } catch {
      template = await getDefaultTemplate();
      styles = await getDefaultStyles();
    }
  } else {
    template = await getDefaultTemplate();
    styles = await getDefaultStyles();
  }
  const title = metadata.title || "Untitled";
  const description = metadata.description || metadata.excerpt || "";
  const keywords = metadata.keywords?.join(", ") || "";
  const author = metadata.author || "";
  const date = metadata.date || (/* @__PURE__ */ new Date()).toISOString();
  const language = metadata.language || "en";
  const canonical = metadata.canonical || "";
  const coverImage = metadata.coverImage || metadata.ogImage || "/default-og-image.png";
  const tags = metadata.tags?.join(", ") || "";
  const ogTitle = metadata.ogTitle || title;
  const ogDescription = metadata.ogDescription || description;
  const ogImage = metadata.ogImage || coverImage;
  const ogType = metadata.ogType || "article";
  const twitterCard = metadata.twitterCard || "summary_large_image";
  const twitterSite = metadata.twitterSite || "";
  const twitterCreator = metadata.twitterCreator || "";
  const themeColor = metadata.themeColor || "#0066cc";
  const robots = metadata.robots || "index, follow";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    author: {
      "@type": "Person",
      name: author || "Unknown"
    },
    datePublished: date,
    wordCount: metadata.wordCount || 0,
    keywords,
    image: ogImage
  });
  return template.replace(/\{\{title\}\}/g, escapeHtml4(title)).replace(/\{\{description\}\}/g, escapeHtml4(description)).replace(/\{\{keywords\}\}/g, escapeHtml4(keywords)).replace(/\{\{author\}\}/g, escapeHtml4(author)).replace(/\{\{date\}\}/g, escapeHtml4(date)).replace(/\{\{language\}\}/g, language).replace(/\{\{canonical\}\}/g, escapeHtml4(canonical)).replace(/\{\{coverImage\}\}/g, escapeHtml4(coverImage)).replace(/\{\{tags\}\}/g, escapeHtml4(tags)).replace(/\{\{ogTitle\}\}/g, escapeHtml4(ogTitle)).replace(/\{\{ogDescription\}\}/g, escapeHtml4(ogDescription)).replace(/\{\{ogImage\}\}/g, escapeHtml4(ogImage)).replace(/\{\{ogType\}\}/g, escapeHtml4(ogType)).replace(/\{\{twitterCard\}\}/g, escapeHtml4(twitterCard)).replace(/\{\{twitterSite\}\}/g, escapeHtml4(twitterSite)).replace(/\{\{twitterCreator\}\}/g, escapeHtml4(twitterCreator)).replace(/\{\{themeColor\}\}/g, escapeHtml4(themeColor)).replace(/\{\{robots\}\}/g, escapeHtml4(robots)).replace(/\{\{structuredData\}\}/g, structuredData).replace(/\{\{styles\}\}/g, styles).replace(/\{\{content\}\}/g, html);
}
async function getDefaultTemplate() {
  const templatePath = join(__dirname, "../../templates/default.html");
  try {
    return await readFile(templatePath, "utf-8");
  } catch {
    return `<!DOCTYPE html>
<html lang="{{language}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <meta name="description" content="{{description}}">
  <style>{{styles}}</style>
</head>
<body>
  <article>{{content}}</article>
</body>
</html>`;
  }
}
async function getDefaultStyles() {
  const stylesPath = join(__dirname, "../../templates/styles.css");
  try {
    return await readFile(stylesPath, "utf-8");
  } catch {
    return `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`;
  }
}
function escapeHtml4(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/cli/utils.ts
import slugify3 from "slugify";
import { relative, dirname as dirname2, sep } from "path";
function generateSlugFromMetadata(metadata) {
  let datePrefix = "";
  if (metadata.date) {
    const date = new Date(metadata.date);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      datePrefix = `${year}-${month}-${day}`;
    }
  }
  if (!datePrefix) {
    const now = /* @__PURE__ */ new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    datePrefix = `${year}-${month}-${day}-${hour}`;
  }
  const titleSlug = metadata.title ? slugify3(metadata.title, { lower: true, strict: true }) : "untitled";
  return `${datePrefix}-${titleSlug}`;
}
function extractFolderPath(filePath, baseDir) {
  const relativePath = relative(baseDir, filePath);
  const folderPath = dirname2(relativePath);
  const normalizedPath = folderPath.split(sep).join("/");
  return normalizedPath === "." ? "" : normalizedPath;
}
function extractBaseDir(pattern) {
  if (pattern.endsWith(".org")) {
    return dirname2(pattern);
  }
  const parts = pattern.split("/");
  const globIndex = parts.findIndex((part) => part.includes("*"));
  if (globIndex > 0) {
    return parts.slice(0, globIndex).join("/");
  }
  return pattern.replace(/\/?\*\*?\/?\*?\.org$/, "") || ".";
}

// src/cli/commands/build.ts
import { existsSync } from "fs";

// src/cli/vue-generator.ts
function safeEncodeForSfc(value) {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value || {});
    return encodeURIComponent(raw);
  } catch {
    return encodeURIComponent(String(value ?? ""));
  }
}
function stripDocumentWrapper(html) {
  if (!html) return html;
  html = html.replace(/<!doctype[\s\S]*?>/i, "");
  html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<html[^>]*>/gi, "");
  html = html.replace(/<\/html>/gi, "");
  html = html.replace(/<body[^>]*>/gi, "");
  html = html.replace(/<\/body>/gi, "");
  return html.trim();
}
function processComponentPlaceholders(html, componentsMap = {}) {
  const importLines = [];
  const propsDeclarations = [];
  const usedNames = /* @__PURE__ */ new Map();
  const regex = /<div\s+([^>]*?\s)?data-component=["']([^"']+)["']([^>]*)><\/div>/g;
  let m;
  let newHtml = html;
  let propIndex = 0;
  while ((m = regex.exec(html)) !== null) {
    const fullMatch = m[0];
    const attrsLeft = (m[1] || "") + (m[3] || "");
    const compName = m[2];
    let importId = usedNames.get(compName);
    if (!importId) {
      importId = compName.replace(/[^A-Za-z0-9_$]/g, "") || `Comp${usedNames.size + 1}`;
      usedNames.set(compName, importId);
      const importPath = componentsMap[compName] || `./components/${compName}.vue`;
      importLines.push(`import ${importId} from '${importPath}'`);
    }
    const propRegex = /(\w+)=["']([^"']*)["']/g;
    const propsObj = {};
    let p;
    while ((p = propRegex.exec(attrsLeft)) !== null) {
      const key = p[1];
      const val = p[2];
      try {
        propsObj[key] = JSON.parse(val);
      } catch {
        propsObj[key] = val;
      }
    }
    const propsJson = encodeURIComponent(JSON.stringify(propsObj));
    const varName = `__props${propIndex++}`;
    propsDeclarations.push(`const ${varName} = JSON.parse(decodeURIComponent('${propsJson}'))`);
    const compTag = `<${importId} v-bind="${varName}" />`;
    newHtml = newHtml.replace(fullMatch, compTag);
  }
  return { imports: importLines, propsDeclarations, html: newHtml };
}
function buildVueSfc(metadata, contentHtml, importLines = [], propsDeclarations = []) {
  const safeContent = String(contentHtml).replace(/<\/template>/gi, "</template><!-- -->");
  const hasArticle = /<\s*article[\s>]/i.test(safeContent);
  const templateInner = hasArticle ? safeContent : `<article class="org-article">
${safeContent}
</article>`;
  const metadataEncoded = safeEncodeForSfc(metadata);
  const setupImports = importLines.length ? `${importLines.join("\n")}
` : "";
  const setupProps = propsDeclarations.length ? `
  ${propsDeclarations.join("\n  ")}
` : "";
  const optionsApiScript = `<script>
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
${setupImports}
// Module-level metadata export (for consuming app to use if needed)
export const metadata = JSON.parse(decodeURIComponent('${metadataEncoded}'))

// Export seoMeta for consuming app to use with their own head management
export const seoMeta = {
  title: metadata.title || 'Untitled',
  htmlAttrs: { lang: metadata.language || 'en' },
  meta: [
    ${metadata.description ? `{ name: 'description', content: '${metadata.description.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.keywords ? `{ name: 'keywords', content: '${metadata.keywords.join(", ").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.author ? `{ name: 'author', content: '${metadata.author.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.robots ? `{ name: 'robots', content: '${metadata.robots.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.themeColor ? `{ name: 'theme-color', content: '${metadata.themeColor.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogTitle || metadata.title ? `{ property: 'og:title', content: '${(metadata.ogTitle || metadata.title || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogDescription || metadata.description ? `{ property: 'og:description', content: '${(metadata.ogDescription || metadata.description || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogImage || metadata.coverImage ? `{ property: 'og:image', content: '${(metadata.ogImage || metadata.coverImage || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.canonical ? `{ property: 'og:url', content: '${metadata.canonical.replace(/'/g, "\\'")}' },` : ""}
    { property: 'og:type', content: 'article' },
    ${metadata.twitterCard ? `{ name: 'twitter:card', content: '${metadata.twitterCard.replace(/'/g, "\\'")}' },` : "{ name: 'twitter:card', content: 'summary_large_image' },"}
    ${metadata.twitterSite ? `{ name: 'twitter:site', content: '${metadata.twitterSite.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.twitterCreator ? `{ name: 'twitter:creator', content: '${metadata.twitterCreator.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogTitle || metadata.title ? `{ name: 'twitter:title', content: '${(metadata.ogTitle || metadata.title || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogDescription || metadata.description ? `{ name: 'twitter:description', content: '${(metadata.ogDescription || metadata.description || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogImage || metadata.coverImage ? `{ name: 'twitter:image', content: '${(metadata.ogImage || metadata.coverImage || "").replace(/'/g, "\\'")}' },` : ""}
  ].filter(Boolean),
  link: ${metadata.canonical ? `[{ rel: 'canonical', href: '${metadata.canonical.replace(/'/g, "\\'")}' }]` : "[]"}
}

export default {
  setup() {
${setupProps}
    useHead(seoMeta)

    const formattedDate = computed(() => {
      if (!metadata.date) return ''
      try { return new Date(metadata.date).toLocaleDateString() } catch { return metadata.date }
    })

    return {
      metadata,
      formattedDate
    }
  }
}
</script>

`;
  const styleBlock = `<style scoped>
.org-article { max-width: 820px; margin: 0 auto; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; line-height: 1.6; }
.article-header h1 { margin-bottom: 0.25rem; font-size: 1.8rem; }
.article-content img { max-width: 100%; height: auto; display: block; margin: 0.5rem 0; }
.article-meta { color: #555; font-size: 0.9rem; margin-bottom: 1rem; }
</style>
`;
  return `<template>
${templateInner}
</template>

${optionsApiScript}${styleBlock}`;
}

// src/cli/commands/build.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname3(__filename2);
async function buildCommand(input, options) {
  console.log(chalk.blue("Building Org files...\n"));
  const files = await glob(input.endsWith(".org") ? input : `${input}/**/*.org`);
  if (files.length === 0) {
    console.log(chalk.yellow("No .org files found"));
    return;
  }
  console.log(chalk.gray(`Found ${files.length} file(s)
`));
  const baseDir = extractBaseDir(input);
  console.log(chalk.gray(`Base directory: ${baseDir}
`));
  await mkdir(options.output, { recursive: true });
  await copyTemplateAssets(options.output, options.templateDir);
  const sitemapEntries = [];
  const feedEntries = [];
  for (const file of files) {
    try {
      const content = await readFile2(file, "utf-8");
      const ast = parse(content);
      const renderResult = await renderToHtml(ast, {
        sanitize: options.sanitize,
        codeHighlight: options.highlight,
        templateDir: options.templateDir,
        componentMap: options.componentMap
      });
      const articleHtml = stripDocumentWrapper(renderResult.html);
      const folderPath = extractFolderPath(file, baseDir);
      const articleSlug = generateSlugFromMetadata(renderResult.metadata);
      const fullPath = folderPath ? `${folderPath}/${articleSlug}` : articleSlug;
      const outputDir = join2(options.output, fullPath);
      await mkdir(outputDir, { recursive: true });
      const staticHtml = await applyTemplate(
        renderResult.html,
        {
          ...renderResult.metadata,
          canonical: renderResult.metadata.canonical || `/${fullPath}`
        },
        options.template,
        options.templateDir
      );
      const htmlPath = join2(outputDir, "index.html");
      await writeFile(htmlPath, staticHtml, "utf-8");
      let componentsMap = {};
      if (options.templateDir) {
        try {
          const mapPath = join2(options.templateDir, "components-map.json");
          if (existsSync(mapPath)) {
            const raw = await readFile2(mapPath, "utf-8");
            componentsMap = JSON.parse(raw);
            console.log(chalk.gray("Loaded components-map.json from templateDir"));
          }
        } catch {
        }
      }
      const processed = processComponentPlaceholders(articleHtml, componentsMap);
      const vuePath = join2(outputDir, "index.vue");
      const sfc = buildVueSfc(renderResult.metadata, processed.html, processed.imports, processed.propsDeclarations);
      await writeFile(vuePath, sfc, "utf-8");
      const metaPath = join2(outputDir, "metadata.json");
      await writeFile(metaPath, JSON.stringify(renderResult.metadata, null, 2));
      const ogPath = join2(outputDir, "og-metadata.json");
      await writeFile(
        ogPath,
        JSON.stringify(
          {
            title: renderResult.metadata.ogTitle || renderResult.metadata.title,
            description: renderResult.metadata.ogDescription || renderResult.metadata.description || renderResult.metadata.excerpt,
            type: renderResult.metadata.ogType || "article",
            url: renderResult.metadata.canonical || `/${fullPath}`,
            image: renderResult.metadata.ogImage || renderResult.metadata.coverImage || "/default-og-image.png",
            publishedTime: renderResult.metadata.date,
            author: renderResult.metadata.author,
            tags: renderResult.metadata.tags,
            locale: renderResult.metadata.language || "en",
            siteName: renderResult.metadata.title,
            // Twitter Card metadata
            twitterCard: renderResult.metadata.twitterCard || "summary_large_image",
            twitterSite: renderResult.metadata.twitterSite,
            twitterCreator: renderResult.metadata.twitterCreator,
            // Additional SEO
            canonical: renderResult.metadata.canonical,
            robots: renderResult.metadata.robots || "index, follow",
            themeColor: renderResult.metadata.themeColor || "#0066cc"
          },
          null,
          2
        )
      );
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: renderResult.metadata.title,
        description: renderResult.metadata.description || renderResult.metadata.excerpt,
        author: {
          "@type": "Person",
          name: renderResult.metadata.author || "Unknown"
        },
        datePublished: renderResult.metadata.date,
        wordCount: renderResult.metadata.wordCount,
        keywords: renderResult.metadata.keywords?.join(", ")
      };
      const structuredDataPath = join2(outputDir, "structured-data.json");
      await writeFile(structuredDataPath, JSON.stringify(structuredData, null, 2));
      sitemapEntries.push({
        url: `/${fullPath}`,
        lastmod: renderResult.metadata.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        priority: 0.8,
        changefreq: "monthly"
      });
      feedEntries.push({
        title: renderResult.metadata.title,
        link: `/${fullPath}`,
        description: renderResult.metadata.description || renderResult.metadata.excerpt,
        pubDate: renderResult.metadata.date,
        author: renderResult.metadata.author,
        categories: renderResult.metadata.tags || []
      });
      console.log(chalk.green("\u2713"), chalk.gray(file), "\u2192", chalk.cyan(outputDir));
    } catch (error) {
      console.log(chalk.red("\u2717"), chalk.gray(file), chalk.red(error.message));
      console.error(error);
    }
  }
  const sitemapPath = join2(options.output, "sitemap.json");
  await writeFile(sitemapPath, JSON.stringify(sitemapEntries, null, 2));
  const feedPath = join2(options.output, "feed.json");
  await writeFile(feedPath, JSON.stringify(feedEntries, null, 2));
  try {
    const routeLines = sitemapEntries.map((entry) => {
      const path = entry.url;
      const folder = path.startsWith("/") ? path.slice(1) : path;
      return `  { path: '${path}', component: () => import('./${folder}/index.vue') }`;
    });
    const routesContent = `export const blogRoutes = [
${routeLines.join(",\n")}
]
`;
    await writeFile(join2(options.output, "routes.js"), routesContent, "utf-8");
    console.log(chalk.gray(`Generated routes.js with ${routeLines.length} entries`));
  } catch (err) {
    console.log(chalk.yellow("\u26A0"), "Failed to generate routes.js", err.message);
  }
  console.log(chalk.green(`
Build complete! Output: ${options.output}`));
  console.log(chalk.gray(`Generated ${files.length} pages, sitemap.json, feed.json, and routes.js`));
}
async function copyTemplateAssets(outputDir, customTemplateDir) {
  const templateDir = customTemplateDir || join2(__dirname2, "../../../templates");
  console.log(chalk.gray(`Copying template assets from: ${templateDir}`));
  const assets = ["favicon.ico", "robots.txt", "manifest.json", "styles.css"];
  for (const asset of assets) {
    try {
      const sourcePath = join2(templateDir, asset);
      const destPath = join2(outputDir, asset);
      if (existsSync(sourcePath)) {
        await copyFile(sourcePath, destPath);
        console.log(chalk.green("\u2713"), chalk.gray(`Copied ${asset}`));
      } else {
        console.log(chalk.yellow("\u26A0"), chalk.gray(`${asset} not found, creating default...`));
        await createDefaultAsset(asset, destPath);
      }
    } catch (error) {
      console.log(chalk.red("\u2717"), chalk.gray(`Failed to copy ${asset}:`), error.message);
    }
  }
}
async function createDefaultAsset(assetName, destPath) {
  try {
    if (assetName === "robots.txt") {
      await writeFile(destPath, `User-agent: *
Allow: /

Sitemap: /sitemap.xml`);
    } else if (assetName === "manifest.json") {
      await writeFile(
        destPath,
        JSON.stringify(
          {
            name: "Blog",
            short_name: "Blog",
            description: "A blog powered by org2html",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#0066cc",
            icons: []
          },
          null,
          2
        )
      );
    } else if (assetName === "styles.css") {
      await writeFile(
        destPath,
        `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`
      );
    }
  } catch (error) {
  }
}

// src/cli/commands/watch.ts
import chokidar from "chokidar";
import chalk2 from "chalk";
async function watchCommand(input, options) {
  console.log(chalk2.blue("\u{1F440} Watching for changes...\n"));
  await buildCommand(input, options);
  const pattern = input.endsWith(".org") ? input : `${input}/**/*.org`;
  const watcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: true
  });
  watcher.on("change", async (path) => {
    console.log(chalk2.yellow(`
\u{1F4DD} ${path} changed, rebuilding...`));
    await buildCommand(input, options);
  });
  watcher.on("add", async (path) => {
    console.log(chalk2.green(`
\u2795 ${path} added, rebuilding...`));
    await buildCommand(input, options);
  });
  console.log(chalk2.gray("\nPress Ctrl+C to stop watching"));
}

// src/cli/commands/test.ts
import { readFile as readFile3 } from "fs/promises";
import chalk3 from "chalk";
async function testCommand(file) {
  console.log(chalk3.blue("\u{1F9EA} Testing parser...\n"));
  try {
    const content = await readFile3(file, "utf-8");
    console.log(chalk3.gray("Parsing..."));
    const ast = parse(content);
    console.log(chalk3.green("\u2713 Parse successful\n"));
    console.log(chalk3.bold("Metadata:"));
    console.log(JSON.stringify(ast.metadata, null, 2));
    console.log(chalk3.gray("\nRendering..."));
    const result = await renderToHtml(ast);
    console.log(chalk3.green("\u2713 Render successful\n"));
    console.log(chalk3.bold("HTML Preview:"));
    console.log(result.html.substring(0, 500) + "...");
  } catch (error) {
    console.log(chalk3.red("\u2717 Error:"), error.message);
    console.error(error);
  }
}

// src/cli/index.ts
var program = new Command();
program.name("org2html").description(
  "Convert Org-mode (.org) files into clean, customizable HTML pages."
).version("1.0.0");
program.command("build").description("Build Org files to static HTML output.").argument("<input>", "Input file or directory containing .org files").option("-o, --output <dir>", "Output directory for HTML files", "dist").option("-t, --template <file>", "Path to a custom HTML template file").option(
  "--template-dir <dir>",
  "Path to a directory with templates and assets"
).option(
  "--no-sanitize",
  "Disable HTML sanitization for raw HTML in Org files"
).option("--no-highlight", "Disable syntax highlighting for code blocks").action(buildCommand);
program.command("watch").description(
  "Watch Org files and rebuild automatically when changes are detected."
).argument("<input>", "Input file or directory").option("-o, --output <dir>", "Output directory for HTML files", "dist").option("-t, --template <file>", "Path to a custom HTML template file").option(
  "--template-dir <dir>",
  "Path to a directory with templates and assets"
).action(watchCommand);
program.command("test").description(
  "Test the Org parser and preview HTML output for a single file."
).argument("<file>", "Path to the Org file to test").action(testCommand);
program.command("help [command]").description(
  "Show help for all commands or details for a specific command."
).action((commandName) => {
  if (!commandName) {
    console.log(`
org2html - Convert Org-mode (.org) files into HTML

Usage:
  org2html <command> [options]

Commands:
  build <input>     Build Org files to static HTML output (main command for production builds)
  watch <input>     Watch files and rebuild automatically when changes occur (useful for development)
  test <file>       Test the Org parser and preview HTML output for a single file
  help [command]    Show this help message or detailed help for a specific command

Examples:
  org2html build notes.org -o site
  org2html watch ./docs
  org2html test example.org
  org2html help build

Options:
  -V, --version     Output the version number
  -h, --help        Display global help

Description:
  org2html converts plain-text Org-mode documents into clean, accessible HTML.
  It supports templates, automatic rebuilds, and syntax highlighting for code blocks.

For detailed help about a command:
  org2html help <command>
`);
  } else {
    const cmd = program.commands.find(
      (c) => c.name() === commandName || c.aliases().includes(commandName)
    );
    if (cmd) {
      console.log(cmd.helpInformation());
    } else {
      console.error(`Unknown command '${commandName}'.
`);
      program.outputHelp();
      process.exitCode = 1;
    }
  }
});
program.parse();
//# sourceMappingURL=index.mjs.map