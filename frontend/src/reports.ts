import { loadReports } from "./api.ts";
import type { DebtSummary, DueDate, DueDateClassification, Reports, UncoveredUnit } from "./domain/types.ts";
import { byId } from "./ui/dom.ts";
import { bindTableExportButtons } from "./ui/export-table.ts";
import { escapeHtml, formatCompactMoney, formatMoney } from "./ui/format.ts";

const total = <T extends { saldo: number }>(items: T[], include: (item: T) => boolean = () => true): number =>
  items.reduce((sum, item) => sum + (include(item) ? Number(item.saldo) : 0), 0);

function debtRows(items: DebtSummary[]): string {
  return items.map((item) => `<tr>
    <td><span class="entity-badge ${item.entity.toLowerCase()}">${item.entity}</span></td>
    <td>${escapeHtml(item.acreedor ?? "Sin nombre")}</td><td class="number-cell">${formatMoney(item.saldo)}</td>
  </tr>`).join("");
}

function uncoveredRows(items: UncoveredUnit[]): string {
  return items.map((item) => `<tr>
    <td>${escapeHtml(item.vin)}</td><td>${escapeHtml(`${item.marca} ${item.version}`)}</td>
    <td class="number-cell">${formatMoney(item.saldo)}</td>
  </tr>`).join("");
}

function dueRows(items: DueDate[]): string {
  const css: Record<DueDateClassification, string> = {
    "VENCIDO CONCESIONARIO": "overdue concessionaire",
    "POR VENCER CONCESIONARIO": "short-term concessionaire",
    "VENCIDO FINANCIERA": "overdue financial",
    "POR VENCER FINANCIERA": "short-term financial",
  };
  return items.map((item) => `<tr>
    <td>${escapeHtml(item.vencimiento)}</td><td>${escapeHtml(item.acreedor ?? "Sin nombre")}</td>
    <td><span class="status-badge ${css[item.clasificacion]}">${item.clasificacion}</span></td>
    <td class="number-cell">${formatMoney(item.saldo)}</td>
  </tr>`).join("");
}

function panel(id: string, title: string, filename: string, headers: string, rows: string): string {
  return `<article class="report-panel">
    <header><h2>${title}</h2><button type="button" data-export-table="#${id}" data-export-filename="${filename}">EXPORTAR A EXCEL</button></header>
    <div class="table-frame"><table id="${id}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>
  </article>`;
}

function screen(reports: Reports): string {
  return `<section class="reports-view" aria-label="Reportes ejecutivos">
    <div class="summary-cards">
      <article class="summary-card total"><span>Deuda total</span><strong>${formatCompactMoney(total(reports.debtSummary))}</strong></article>
      <article class="summary-card overdue"><span>Vencido concesionario</span><strong>${formatCompactMoney(total(reports.dueDates, (item) => item.clasificacion === "VENCIDO CONCESIONARIO"))}</strong></article>
      <article class="summary-card short"><span>Por vencer concesionario</span><strong>${formatCompactMoney(total(reports.dueDates, (item) => item.clasificacion === "POR VENCER CONCESIONARIO"))}</strong></article>
      <article class="summary-card overdue financial"><span>Vencido financiera</span><strong>${formatCompactMoney(total(reports.dueDates, (item) => item.clasificacion === "VENCIDO FINANCIERA"))}</strong></article>
      <article class="summary-card short financial"><span>Por vencer financiera</span><strong>${formatCompactMoney(total(reports.dueDates, (item) => item.clasificacion === "POR VENCER FINANCIERA"))}</strong></article>
      <article class="summary-card units"><span>Unidades sin cobertura</span><strong>${reports.uncoveredUnits.length}</strong></article>
    </div>
    <div class="report-grid">
      ${panel("report-debt-table", "Deuda por acreedor", "reporte-deuda-acreedor", "<th>Tipo</th><th>Acreedor</th><th class='number-cell'>Saldo</th>", debtRows(reports.debtSummary))}
      ${panel("report-uncovered-table", "Unidades sin cobertura total", "reporte-unidades-sin-cobertura", "<th>VIN</th><th>Unidad</th><th class='number-cell'>Saldo</th>", uncoveredRows(reports.uncoveredUnits))}
      ${panel("report-due-table", "Vencimientos", "reporte-vencimientos", "<th>Vencimiento</th><th>Acreedor</th><th>Clasificación</th><th class='number-cell'>Saldo</th>", dueRows(reports.dueDates))}
    </div>
  </section>`;
}

export async function renderReports(): Promise<void> {
  const content = byId("module-content");
  content.innerHTML = `<div class="report-loading">Calculando reportes…</div>`;
  try {
    const reports = await loadReports();
    content.innerHTML = screen(reports);
    bindTableExportButtons(content);
  } catch (error) {
    console.error("Report loading failed:", error);
    content.innerHTML = `<div class="report-error">No fue posible cargar los reportes.</div>`;
  }
}
