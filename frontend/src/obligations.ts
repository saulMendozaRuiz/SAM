import { loadObligations } from "./api.ts";
import type { Obligation } from "./domain/types.ts";
import { bindTableExportButtons } from "./ui/export-table.ts";
import { escapeHtml, formatMoney } from "./ui/format.ts";

const today = (): string => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function state(item: Obligation): { text: string; css: string } {
  if (item.pagado || Number(item.saldo) <= 0) return { text: "PAGADO", css: "long-term" };
  if (item.vencimiento < today()) return { text: "VENCIDO", css: "overdue" };
  return { text: "POR VENCER", css: "short-term" };
}

function options(items: Obligation[], field: "entity" | "acreedor"): string {
  return [...new Set(items.map((item) => item[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function rows(items: Obligation[]): string {
  if (!items.length) return `<tr><td colspan="10" class="empty-table-message">No hay obligaciones con estos filtros.</td></tr>`;
  return items.map((item) => {
    const status = state(item);
    return `<tr>
      <td>${item.obligacion_id}</td><td><span class="entity-badge ${item.entity.toLowerCase()}">${item.entity}</span></td>
      <td>${escapeHtml(item.acreedor)}</td><td>${escapeHtml(item.vin || "—")}</td><td>${escapeHtml(item.vencimiento)}</td>
      <td class="number-cell">${formatMoney(item.monto_original)}</td><td class="number-cell">${formatMoney(item.financiado)}</td>
      <td class="number-cell">${formatMoney(item.abonado)}</td><td class="number-cell"><strong>${formatMoney(item.saldo)}</strong></td>
      <td><span class="status-badge ${status.css}">${status.text}</span></td>
    </tr>`;
  }).join("");
}

export async function renderObligations(): Promise<void> {
  const content = document.getElementById("module-content");
  if (!content) throw new Error("Falta #module-content");
  content.innerHTML = `<div class="report-loading">Cargando obligaciones…</div>`;
  try {
    const obligations = await loadObligations();
    const balance = obligations.reduce((sum, item) => sum + Math.max(0, Number(item.saldo)), 0);
    content.innerHTML = `<section class="reports-view obligations-view" aria-label="Obligaciones">
      <div class="summary-cards"><article class="summary-card total"><span>Saldo pendiente</span><strong>${formatMoney(balance)}</strong></article></div>
      <div class="obligation-filters">
        <label><span>Tipo</span><select id="obligation-entity"><option value="">Todos</option>${options(obligations, "entity")}</select></label>
        <label><span>Acreedor</span><select id="obligation-creditor"><option value="">Todos</option>${options(obligations, "acreedor")}</select></label>
      </div>
      <article class="report-panel"><header><h2>Documentos por pagar</h2><button type="button" data-export-table="#obligations-table" data-export-filename="obligaciones">EXPORTAR A EXCEL</button></header>
        <div class="table-frame"><table id="obligations-table"><thead><tr><th>ID</th><th>Tipo</th><th>Acreedor</th><th>VIN</th><th>Vencimiento</th><th class="number-cell">Original</th><th class="number-cell">Financiado</th><th class="number-cell">Abonado</th><th class="number-cell">Saldo</th><th>Estado</th></tr></thead><tbody id="obligations-body">${rows(obligations)}</tbody></table></div>
      </article></section>`;

    const entity = document.getElementById("obligation-entity") as HTMLSelectElement;
    const creditor = document.getElementById("obligation-creditor") as HTMLSelectElement;
    const body = document.getElementById("obligations-body") as HTMLTableSectionElement;
    const filter = (): void => {
      body.innerHTML = rows(obligations.filter((item) => (!entity.value || item.entity === entity.value) && (!creditor.value || item.acreedor === creditor.value)));
    };
    entity.addEventListener("change", filter);
    creditor.addEventListener("change", filter);
    bindTableExportButtons(content);
  } catch (error) {
    console.error("Obligations loading failed:", error);
    content.innerHTML = `<div class="report-error">No fue posible cargar las obligaciones.</div>`;
  }
}
