/**
 * Minimale CSV-parser — geen npm-dep.
 *
 * Ondersteunt:
 *   - quoted fields met komma's binnenin
 *   - dubbele-quote-escape ("hij zei ""hoi""")
 *   - automatische delimiter-detectie (`,` of `;`)
 *   - LF en CRLF line endings
 *
 * Niet ondersteund (bewust):
 *   - newline binnen quoted field — DEGIRO heeft dit niet
 *   - octale escapes — onnodig voor finance-CSV
 */

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function parseCsv(input: string): CsvParseResult {
  if (!input.trim()) {
    return { headers: [], rows: [], delimiter: "," };
  }
  // Strip BOM
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const lines = splitLines(input);
  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: "," };
  }

  const delimiter = detectDelimiter(lines[0] ?? "");
  const rawHeaders = parseLine(lines[0] ?? "", delimiter).map((h) => h.trim());

  // Disambigueer lege of dubbele headers door per-positie suffix toe te
  // voegen. DEGIRO heeft typisch twee lege kolommen ("" + ""): zonder
  // disambiguatie schrijft de tweede kolom over de eerste heen.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h === "" ? `col_${idx}` : h;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}__${count}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;
    const cells = parseLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c] ?? `col_${c}`] = (cells[c] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows, delimiter };
}

function splitLines(input: string): string[] {
  return input.split(/\r?\n/);
}

function detectDelimiter(headerLine: string): string {
  // Tel ALLEEN buiten quotes
  let inQuotes = false;
  let semis = 0;
  let commas = 0;
  let tabs = 0;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ";") semis++;
      else if (ch === ",") commas++;
      else if (ch === "\t") tabs++;
    }
  }
  if (semis > commas && semis > tabs) return ";";
  if (tabs > commas && tabs > semis) return "\t";
  return ",";
}

function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ""?
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}
