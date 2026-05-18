/**
 * Advisor PDF Report — HTML renderer (Module 23).
 *
 * Pure functie: `AdvisorReportData` → HTML-string (UTF-8). Geen externe
 * PDF-lib in v1 — de spec eist een fallback "HTML print-friendly report"
 * en die is hier de PRIMARY renderer. Bewuste keuze:
 *   - Geen pdfmake/Puppeteer-dep in v1 → kleinere bundle, geen native deps
 *   - Browser-print (Cmd/Ctrl+P → Save as PDF) levert client-ready output
 *   - v2 kan dezelfde HTML door Puppeteer-headless gooien — geen breaking
 *     change in `AdvisorReportData`-shape
 *
 * **Veiligheid**: alle dynamische strings worden HTML-escaped. Geen
 * `dangerouslySetInnerHTML`. PII-redactie gebeurt UPSTREAM in de loader
 * (clientLabel mag niet de volledige e-mail bevatten — caller-contract).
 *
 * **Print-CSS**: `@page A4`, `@media print` hides nav/page-break-policy
 * tussen secties.
 */

import type { AdvisorReportData } from "./types";

/**
 * Render report-data naar een volledige HTML-pagina (incl. `<!doctype>`).
 * Output is self-contained (inline CSS, geen externe assets behalve het
 * optionele white-label-logo).
 */
export function renderAdvisorReportHtml(data: AdvisorReportData): string {
  const { whiteLabel } = data;
  const primary = sanitizeColor(whiteLabel.primaryColor) ?? "#22c55e";

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(data.title.title)} — ${esc(whiteLabel.brandName)}</title>
<style>${printCss(primary)}</style>
</head>
<body>
<header class="print-toolbar">
  <span>Tip: gebruik Ctrl/⌘ + P om dit rapport als PDF op te slaan.</span>
  <button onclick="window.print()" type="button">Print / opslaan als PDF</button>
</header>
${renderTitlePage(data)}
${renderDisclaimerPage(data)}
${renderHealthPage(data)}
${renderRisksPage(data)}
${renderAllocationPage(data)}
${data.goals ? renderGoalsPage(data) : ""}
${data.scenarios ? renderScenariosPage(data) : ""}
${renderBehavioralPage(data)}
${renderDataQualityPage(data)}
${renderActionItemsPage(data)}
${renderFooter(data)}
</body>
</html>`;
}

// ============================================================
//  Section-renderers (return HTML string)
// ============================================================

function renderTitlePage(data: AdvisorReportData): string {
  const { title, whiteLabel } = data;
  const logo = whiteLabel.logoUrl
    ? `<img src="${esc(whiteLabel.logoUrl)}" alt="" class="brand-logo" />`
    : "";
  return `<section class="page title-page">
  <div class="title-block">
    ${logo}
    <p class="eyebrow">${esc(whiteLabel.brandName)}</p>
    <h1>${esc(title.title)}</h1>
    <dl class="title-meta">
      <dt>Cliënt</dt><dd>${esc(title.clientLabel)}</dd>
      <dt>Opgesteld door</dt><dd>${esc(title.generatedBy)}</dd>
      <dt>Per</dt><dd>${esc(formatDate(title.asOf))}</dd>
    </dl>
    ${
      title.advisorNote
        ? `<p class="advisor-note"><strong>Notitie:</strong> ${esc(title.advisorNote)}</p>`
        : ""
    }
  </div>
</section>`;
}

function renderDisclaimerPage(data: AdvisorReportData): string {
  const generic = `<p><strong>Belangrijk:</strong> dit rapport is uitsluitend informatief en vormt geen persoonlijk financieel advies. De getoonde scores, signalen en scenarios zijn modelresultaten — werkelijke uitkomsten kunnen substantieel afwijken. Beleg met geld dat je kunt missen.</p>`;
  const blocks = data.disclaimers
    .map(
      (d) =>
        `<article class="disclaimer-card"><h3>${esc(d.title)}</h3><p>${esc(d.body)}</p><p class="version">Versie ${d.version}</p></article>`,
    )
    .join("");
  return `<section class="page disclaimer-page">
  <h2>Disclaimer</h2>
  ${generic}
  <div class="disclaimer-grid">${blocks}</div>
</section>`;
}

function renderHealthPage(data: AdvisorReportData): string {
  const { health } = data;
  const componentRows = health.components
    .map(
      (c) =>
        `<tr><td>${esc(c.label)}</td><td class="num">${c.score}/100</td></tr>`,
    )
    .join("");
  const signalRows = health.topSignals
    .map(
      (s) =>
        `<li class="signal sev-${esc(s.severity)}"><strong>${esc(s.label)}.</strong> ${esc(s.message)}</li>`,
    )
    .join("");
  return `<section class="page">
  <h2>Portfolio Health Score</h2>
  <div class="score-callout">
    <span class="score-num">${health.score}/100</span>
    <span class="grade grade-${esc(health.grade)}">Grade ${esc(health.grade)}</span>
  </div>
  <h3>Componenten</h3>
  <table class="data-table"><tbody>${componentRows}</tbody></table>
  ${
    signalRows
      ? `<h3>Top aandachtspunten</h3><ol class="signal-list">${signalRows}</ol>`
      : "<p class=\"muted\">Geen actieve health-signalen.</p>"
  }
</section>`;
}

function renderRisksPage(data: AdvisorReportData): string {
  const { risks } = data;
  const flagRows = risks.topFlags.length
    ? risks.topFlags
        .map(
          (f) =>
            `<tr class="sev-${esc(f.severity)}"><td><strong>${esc(f.label)}</strong><br/><span class="muted">${esc(f.message)}</span></td><td class="num">${esc(f.severity)}</td><td class="num">${f.metric !== null ? formatNumber(f.metric) : "—"}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">Geen risico-flags actief.</td></tr>`;

  return `<section class="page">
  <h2>Grootste risico's</h2>
  <p>Overall severity: <strong>${esc(risks.overallSeverity)}</strong>.</p>
  <h3>Kerngegevens</h3>
  <table class="data-table">
    <tbody>
      <tr><td>Grootste positie</td><td class="num">${formatPct(risks.metrics.largestPositionWeight)}</td></tr>
      <tr><td>Top-5 gewicht</td><td class="num">${risks.metrics.top5Weight !== null ? formatPct(risks.metrics.top5Weight) : "—"}</td></tr>
      <tr><td>Portfolio-volatiliteit (geannualiseerd)</td><td class="num">${risks.metrics.portfolioVolatility !== null ? formatPct(risks.metrics.portfolioVolatility) : "—"}</td></tr>
      <tr><td>Vreemde-valuta blootstelling</td><td class="num">${risks.metrics.foreignCurrencyExposure !== null ? formatPct(risks.metrics.foreignCurrencyExposure) : "—"}</td></tr>
    </tbody>
  </table>
  <h3>Top risico-flags</h3>
  <table class="data-table">
    <thead><tr><th>Flag</th><th>Severity</th><th>Metric</th></tr></thead>
    <tbody>${flagRows}</tbody>
  </table>
</section>`;
}

function renderAllocationPage(data: AdvisorReportData): string {
  const { allocation } = data;
  const block = (title: string, rows: Array<{ label: string; weight: number }>) =>
    `<div class="allocation-block">
      <h3>${esc(title)}</h3>
      ${
        rows.length
          ? `<table class="data-table"><tbody>${rows
              .slice(0, 10)
              .map(
                (r) =>
                  `<tr><td>${esc(r.label)}</td><td class="num">${formatPct(r.weight)}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<p class="muted">Geen data.</p>`
      }
    </div>`;

  return `<section class="page">
  <h2>Spreiding</h2>
  <p>Totaal: <strong>${formatCurrency(allocation.totalValue, allocation.baseCurrency)}</strong> · Cash-gewicht <strong>${formatPct(allocation.cashWeight)}</strong>.</p>
  <div class="allocation-grid">
    ${block("Per asset-class", allocation.byAssetClass)}
    ${block("Per sector", allocation.bySector)}
    ${block("Per regio", allocation.byRegion)}
    ${block("Per valuta", allocation.byCurrency)}
  </div>
</section>`;
}

function renderGoalsPage(data: AdvisorReportData): string {
  const goals = data.goals!;
  if (goals.totalGoals === 0) {
    return `<section class="page"><h2>Doelvoortgang</h2><p class="muted">Geen financiële doelen ingesteld.</p></section>`;
  }
  const rows = goals.rows
    .map(
      (g) =>
        `<tr><td><strong>${esc(g.name)}</strong><br/><span class="muted">${esc(g.type)}</span></td><td class="num">${formatCurrency(g.targetAmount, data.allocation.baseCurrency)}</td><td class="num">${esc(formatDate(g.targetDate))}</td><td class="num">${formatPct(g.progress)}</td><td>${esc(g.feasibilityTier)}</td></tr>`,
    )
    .join("");
  return `<section class="page">
  <h2>Doelvoortgang</h2>
  <p>Status: <strong>${esc(goals.courseStatus)}</strong> — ${goals.achievableGoals} van ${goals.totalGoals} doelen haalbaar.</p>
  <table class="data-table">
    <thead><tr><th>Doel</th><th>Bedrag</th><th>Horizon</th><th>Voortgang</th><th>Tier</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderScenariosPage(data: AdvisorReportData): string {
  const sc = data.scenarios!;
  const rows = sc.rows
    .map(
      (r) =>
        `<tr><td><strong>${esc(r.label)}</strong><br/><span class="muted">${esc(r.verdict)}</span></td><td class="num">${esc(r.severity)}</td><td class="num">${formatPct(r.impactPct)}</td><td class="num">${formatCurrency(r.impactAmount, data.allocation.baseCurrency)}</td></tr>`,
    )
    .join("");
  return `<section class="page">
  <h2>Scenario- &amp; stresstest-samenvatting</h2>
  ${
    sc.worst
      ? `<div class="callout"><strong>Worst-case:</strong> ${esc(sc.worst.label)} — ${formatPct(sc.worst.impactPct)} (${formatCurrency(sc.worst.impactAmount, data.allocation.baseCurrency)}).</div>`
      : ""
  }
  <table class="data-table">
    <thead><tr><th>Scenario</th><th>Severity</th><th>Impact %</th><th>Impact bedrag</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="muted">Stress-tests zijn indicatief: echte schokken bewegen niet lineair en sector-correlaties wijzigen onder druk.</p>
</section>`;
}

function renderBehavioralPage(data: AdvisorReportData): string {
  const beh = data.behavioral;
  if (beh.activeCount === 0) {
    return `<section class="page"><h2>Behavioral aandachtspunten</h2><p class="muted">Geen actieve gedragspatronen gedetecteerd. Discipline ziet er rustig uit.</p></section>`;
  }
  const rows = beh.topSignals
    .map(
      (s) =>
        `<li class="signal sev-${esc(s.severity)}"><strong>${esc(s.label)}${s.ticker ? ` (${esc(s.ticker)})` : ""}.</strong> ${esc(s.message)}</li>`,
    )
    .join("");
  return `<section class="page">
  <h2>Behavioral aandachtspunten</h2>
  <p>${beh.activeCount} actieve signalen — coachende observaties, geen veroordeling.</p>
  <ol class="signal-list">${rows}</ol>
</section>`;
}

function renderDataQualityPage(data: AdvisorReportData): string {
  const dq = data.dataQuality;
  const warnings = dq.warnings.length
    ? `<ul>${dq.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : `<p class="muted">Geen datakwaliteit-issues gedetecteerd.</p>`;
  return `<section class="page">
  <h2>Datakwaliteit &amp; coverage</h2>
  <table class="data-table">
    <tbody>
      <tr><td>Posities met geldige koers</td><td class="num">${dq.positionsWithPrice} / ${dq.totalPositions}</td></tr>
      <tr><td>Posities met factor-score</td><td class="num">${dq.positionsWithFactorScore} / ${dq.totalPositions}</td></tr>
      <tr><td>Posities met fundamentals</td><td class="num">${dq.positionsWithFundamentals} / ${dq.totalPositions}</td></tr>
    </tbody>
  </table>
  <h3>Waarschuwingen</h3>
  ${warnings}
</section>`;
}

function renderActionItemsPage(data: AdvisorReportData): string {
  const items = data.actionItems.items;
  if (items.length === 0) {
    return `<section class="page"><h2>Actiepunten</h2><p class="muted">Geen kritieke acties — rapport hoofdzakelijk informerend.</p></section>`;
  }
  const rows = items
    .map(
      (a) =>
        `<li><strong>${esc(a.title)}.</strong> ${esc(a.rationale)} <span class="muted">[bron: ${esc(a.source)}]</span></li>`,
    )
    .join("");
  return `<section class="page">
  <h2>Actiepunten in gewone taal</h2>
  <p class="muted">Aandachtspunten — geen koop/verkoop-aanbevelingen. Maximaal vijf, geprioriteerd.</p>
  <ol class="action-list">${rows}</ol>
</section>`;
}

function renderFooter(data: AdvisorReportData): string {
  const footerText = data.whiteLabel.footerText
    ? esc(data.whiteLabel.footerText)
    : `Gegenereerd door ${esc(data.whiteLabel.brandName)} op ${esc(
        formatDate(data.generatedAt),
      )}. Schema-versie ${data.schemaVersion}.`;
  return `<footer class="print-footer"><p>${footerText}</p></footer>`;
}

// ============================================================
//  CSS
// ============================================================

function printCss(primary: string): string {
  return `
*,*::before,*::after { box-sizing: border-box; }
html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; }
body { margin: 0; padding: 0; background: #f3f4f6; }
.print-toolbar {
  position: sticky; top: 0; z-index: 10;
  background: #111827; color: #f9fafb; padding: 0.75rem 1.5rem;
  display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;
}
.print-toolbar button {
  background: ${primary}; color: #fff; border: 0; padding: 0.4rem 0.9rem; border-radius: 4px; font-weight: 600; cursor: pointer;
}
.page {
  background: #fff; max-width: 210mm; margin: 1rem auto; padding: 20mm;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08); page-break-after: always;
}
.page:last-of-type { page-break-after: auto; }
h1 { font-size: 1.9rem; margin: 0 0 0.5rem 0; color: ${primary}; }
h2 { font-size: 1.4rem; margin: 0 0 1rem 0; color: ${primary}; border-bottom: 2px solid ${primary}; padding-bottom: 0.35rem; }
h3 { font-size: 1.05rem; margin: 1.2rem 0 0.6rem 0; }
p { line-height: 1.5; margin: 0 0 0.75rem 0; }
.muted { color: #6b7280; font-size: 0.85rem; }
.title-page { display: flex; flex-direction: column; justify-content: center; min-height: 250mm; text-align: center; }
.title-block { max-width: 480px; margin: 0 auto; }
.brand-logo { max-height: 50px; margin-bottom: 1.5rem; }
.eyebrow { letter-spacing: 0.18em; text-transform: uppercase; font-size: 0.75rem; color: #6b7280; margin: 0; }
.title-meta { margin: 2rem 0 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; text-align: left; max-width: 360px; margin-left: auto; margin-right: auto; }
.title-meta dt { font-weight: 600; color: #6b7280; }
.title-meta dd { margin: 0; }
.advisor-note { margin-top: 2rem; padding: 0.75rem; background: #f9fafb; border-left: 3px solid ${primary}; font-style: italic; text-align: left; }
.disclaimer-grid { display: grid; gap: 1rem; margin-top: 1rem; }
.disclaimer-card { background: #f9fafb; border-radius: 6px; padding: 0.9rem 1rem; border-left: 3px solid ${primary}; }
.disclaimer-card h3 { margin: 0 0 0.4rem 0; font-size: 0.95rem; }
.disclaimer-card .version { font-size: 0.7rem; color: #9ca3af; margin: 0.4rem 0 0 0; }
.data-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
.data-table th, .data-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #e5e7eb; text-align: left; }
.data-table th { background: #f3f4f6; font-weight: 600; }
.data-table td.num, .data-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.score-callout { display: flex; align-items: baseline; gap: 1rem; margin: 0.5rem 0 1rem 0; }
.score-num { font-size: 2.5rem; font-weight: 700; color: ${primary}; font-variant-numeric: tabular-nums; }
.grade { font-size: 0.85rem; padding: 0.25rem 0.6rem; border-radius: 4px; background: #f3f4f6; font-weight: 600; }
.grade-A { background: #d1fae5; color: #065f46; }
.grade-B { background: #dbeafe; color: #1e3a8a; }
.grade-C { background: #fef3c7; color: #92400e; }
.grade-D { background: #fed7aa; color: #9a3412; }
.grade-F { background: #fee2e2; color: #991b1b; }
.signal-list, .action-list { padding-left: 1.25rem; }
.signal-list li, .action-list li { margin: 0.5rem 0; }
.signal.sev-critical { color: #991b1b; }
.signal.sev-high { color: #9a3412; }
.signal.sev-elevated { color: #92400e; }
.signal.sev-warning { color: #92400e; }
.signal.sev-moderate { color: #92400e; }
.signal.sev-info { color: #1e3a8a; }
.signal.sev-low { color: #1e3a8a; }
.signal.sev-positive { color: #065f46; }
.allocation-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.allocation-block h3 { margin-top: 0; }
.callout { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 0.6rem 0.9rem; margin: 0.5rem 0 1rem 0; border-radius: 4px; font-size: 0.9rem; }
.print-footer { max-width: 210mm; margin: 0 auto 1rem auto; padding: 1rem 20mm; font-size: 0.75rem; color: #6b7280; text-align: center; }
@page { size: A4; margin: 0; }
@media print {
  body { background: #fff; }
  .print-toolbar { display: none; }
  .page { box-shadow: none; margin: 0; max-width: none; padding: 18mm 16mm; }
  .print-footer { padding: 0.5rem 16mm; }
  h2 { page-break-after: avoid; }
  tr, li { page-break-inside: avoid; }
}
`;
}

// ============================================================
//  Helpers (escapers + formatters — pure)
// ============================================================

/** HTML-escape voor alle user/data-derived strings. */
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strikte hex-color validator — voorkomt CSS-injection via primaryColor. */
function sanitizeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : null;
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 1) return value.toFixed(3);
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

function formatCurrency(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
