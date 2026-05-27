/**
 * Simple GFM-compatible Markdown to HTML renderer (no external dependencies).
 * Supports: headers, bold, italic, strikethrough, lists, code blocks,
 * inline code, links, images, blockquotes, tables, horizontal rules.
 */

export function renderMarkdown(md: string): string {
  if (!md) return "";

  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```...```)
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      if (lang) {
        html.push(`<pre class="markdown-code-block"><code class="language-${escapeHtml(lang)}">${codeLines.join("\n")}</code></pre>`);
      } else {
        html.push(`<pre class="markdown-code-block"><code>${codeLines.join("\n")}</code></pre>`);
      }
      continue;
    }

    // Table detection: a line containing | and separated cells
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|\s:]*$/.test(lines[i + 1])) {
      const tableHtml = parseTable(lines, i);
      html.push(tableHtml.html);
      i = tableHtml.nextLineIndex;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2].trim());
      html.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\s*)([-*_])\s*\2\s*\2\s*$/.test(line)) {
      html.push(`<hr />`);
      i++;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoteLines.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i++;
      }
      const innerHtml = renderMarkdown(quoteLines.join("\n"));
      html.push(`<blockquote>${innerHtml}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const listHtml = parseUnorderedList(lines, i);
      html.push(listHtml.html);
      i = listHtml.nextLineIndex;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const listHtml = parseOrderedList(lines, i);
      html.push(listHtml.html);
      i = listHtml.nextLineIndex;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      html.push("");
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("#") &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].trimStart().startsWith(">") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\s*)([-*_])\s*\2\s*\2\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html.push(`<p>${inlineFormat(paraLines.join("<br/>"))}</p>`);
    }
  }

  return html.join("\n");
}

/**
 * Parse inline formatting: bold, italic, strikethrough, inline code, links, images
 */
function inlineFormat(text: string): string {
  // Images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="markdown-image" />');
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="markdown-link">$1</a>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="markdown-inline-code">$1</code>');
  // Bold + italic ***text*** or ___text___
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  // Bold **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic *text* or _text_
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");
  // Strikethrough ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ListParseResult {
  html: string;
  nextLineIndex: number;
}

function parseUnorderedList(lines: string[], startIndex: number): ListParseResult {
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
    const content = lines[i].replace(/^\s*[-*+]\s+/, "");
    items.push(inlineFormat(content));
    i++;
  }

  return {
    html: `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`,
    nextLineIndex: i,
  };
}

function parseOrderedList(lines: string[], startIndex: number): ListParseResult {
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
    const content = lines[i].replace(/^\s*\d+\.\s+/, "");
    items.push(inlineFormat(content));
    i++;
  }

  return {
    html: `<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`,
    nextLineIndex: i,
  };
}

function parseTable(lines: string[], startIndex: number): { html: string; nextLineIndex: number } {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  const headers = parseTableRow(headerLine);

  // Parse alignment from separator
  const alignCells = separatorLine.split("|").map((c) => c.trim());
  const aligns: string[] = [];
  for (const cell of alignCells) {
    if (cell.startsWith(":") && cell.endsWith(":")) {
      aligns.push("center");
    } else if (cell.endsWith(":")) {
      aligns.push("right");
    } else if (cell.startsWith(":")) {
      aligns.push("left");
    } else {
      aligns.push("left");
    }
  }

  const rows: string[][] = [];
  let i = startIndex + 2;
  while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
    rows.push(parseTableRow(lines[i]));
    i++;
  }

  let html = "<table class=\"markdown-table\"><thead><tr>";
  headers.forEach((h, idx) => {
    const align = aligns[idx] || "left";
    html += `<th style="text-align:${align}">${inlineFormat(h)}</th>`;
  });
  html += "</tr></thead><tbody>";

  rows.forEach((row) => {
    html += "<tr>";
    row.forEach((cell, idx) => {
      const align = aligns[idx] || "left";
      html += `<td style="text-align:${align}">${inlineFormat(cell)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";

  return { html, nextLineIndex: i };
}

function parseTableRow(line: string): string[] {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");
}
