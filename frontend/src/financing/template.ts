import { escapeHtml, formatMoney, localIsoDate } from "./validation.ts";
import { formatCompactMoney } from "../ui/format.ts";
import type {
  FinanceableObligation,
  FinancingApplicationState,
  FinancialInstitution,
  Financing,
} from "../domain/types.ts";

export function financingRows(items: Financing[]): string {
  if (!items.length) return `<tr><td colspan="7" class="empty-table-message">No hay financiamientos con estos filtros.</td></tr>`;
  return items.map((item) => {
    const expected = Number(item.monto_cupones) + Number(item.monto_balloon);
    const balanced = [item.monto_aplicado, item.monto_calendario, item.monto_materializado]
      .every((value) => Math.abs(expected - Number(value)) <= 0.005);

    return `
      <tr>
        <td><strong>${escapeHtml(item.financiera)}</strong></td>
        <td>${escapeHtml(item.folio)}</td>
        <td>${escapeHtml(item.emision)}</td>
        <td class="number-cell">${formatMoney(expected)}</td>
        <td class="number-cell">${item.cupones}</td>
        <td><span class="status-badge ${balanced ? "long-term" : "overdue"}">${balanced ? "CUADRADO" : "REVISAR"}</span></td>
        <td class="export-ignore"><button type="button" class="table-action cancel-financing" data-id="${item.id_finto}" data-folio="${escapeHtml(item.folio)}">Cancelar</button></td>
      </tr>
    `;
  }).join("");
}

function filterOptions(items: Financing[], field: "financiera" | "folio"): string {
  return [...new Set(items.map((item) => item[field]))]
    .sort((a, b) => a.localeCompare(b, "es-MX"))
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

export function listScreen(items: Financing[], message = ""): string {
  const total = items.reduce(
    (sum, item) => sum + Number(item.monto_cupones) + Number(item.monto_balloon),
    0,
  );

  return `
    <section class="reports-view financing-list-view" aria-label="Financiamientos">
      <div class="report-toolbar report-toolbar-actions-only">
        <button id="new-financing" type="button" class="primary-action">Nuevo financiamiento</button>
      </div>
      ${message ? `<div class="operation-message">${escapeHtml(message)}</div>` : ""}
      <div class="summary-cards">
        <article class="summary-card total"><span>Monto financiado</span><strong id="financing-total">${formatCompactMoney(total)}</strong></article>
        <article class="summary-card units"><span>Financiamientos</span><strong id="financing-count">${items.length}</strong></article>
        <article class="summary-card units"><span>Unidades financiadas</span><strong id="financing-units">${items.reduce((sum, item) => sum + item.unidades_financiadas, 0)}</strong></article>
      </div>
      <div class="financing-filters">
        <label><span>Financiera</span><select id="financing-financier"><option value="">Todos</option>${filterOptions(items, "financiera")}</select></label>
        <label><span>Folio</span><select id="financing-folio"><option value="">Todos</option>${filterOptions(items, "folio")}</select></label>
      </div>
      <article class="report-panel due-panel">
        <header><h2>Contratos</h2><button type="button" data-export-table="#financing-table" data-export-filename="financiamientos">EXPORTAR A EXCEL</button></header>
        <div class="table-frame">
          <table id="financing-table">
            <thead><tr><th>Financiera</th><th>Folio</th><th>Emisión</th><th class="number-cell">Total</th><th class="number-cell">Cupones</th><th>Validación</th><th class="export-ignore"></th></tr></thead>
            <tbody id="financing-body">${financingRows(items)}</tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function financierOptions(items: FinancialInstitution[]): string {
  return items.map((item) => `<option value="${item.id_fin}">${escapeHtml(item.razon_social)}</option>`).join("");
}

function purchaseOrderOptions(items: FinanceableObligation[]): string {
  return [...new Set(items.map((item) => item.oc_mexrac).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true }))
    .map((value) => `<label><input type="checkbox" value="${escapeHtml(value)}" /> <span>${escapeHtml(value)}</span></label>`)
    .join("");
}

export function formScreen(financiers: FinancialInstitution[], obligations: FinanceableObligation[]): string {
  const today = localIsoDate();

  return `
    <section class="reports-view financing-form-view">
      <div class="report-toolbar financing-toolbar">
        <h1>Registrar financiamiento</h1>
        <button id="back-financing" type="button">Regresar</button>
      </div>

      <div class="financing-form-body">
      <article class="report-panel financing-workspace-panel">
        <div class="financing-contract-fields">
        <div class="financing-primary-fields">
          <label>
            <span>Monto de cupones</span>
            <input id="fin-coupon-amount" class="money-input" inputmode="decimal" value="0.00" />
          </label>
          <label>
            <span>Número de cupones</span>
            <input id="fin-coupon-count" class="count-input" type="number" min="1" value="36" />
          </label>
          <label>
            <span>Monto balloon</span>
            <input id="fin-balloon-amount" class="money-input" inputmode="decimal" value="0.00" />
          </label>
        </div>
        <div class="financing-secondary-fields">
          <label><span>Financiera</span><select id="fin-id"><option value="">Selecciona una financiera</option>${financierOptions(financiers)}</select></label>
          <label><span>Folio</span><input id="fin-folio" autocomplete="off" /></label>
          <label><span>Emisión</span><input id="fin-emission" type="date" value="${today}" /></label>
          <label><span>Primer vencimiento</span><input id="fin-first-due" type="date" /></label>
          <label><span>Vencimiento balloon</span><input id="fin-balloon-due" type="date" /></label>
          <label><span>Comentarios</span><input id="fin-comments" autocomplete="off" /></label>
        </div>
        </div>

        <section class="financing-obligations-panel">
        <header>
          <h2>Unidades y obligaciones a financiar</h2>
          <details class="financing-oc-filter">
            <summary id="fin-oc-filter-summary">Todas las OC</summary>
            <div id="fin-oc-options">${purchaseOrderOptions(obligations) || `<span class="empty-oc-filter">No hay OC disponibles</span>`}</div>
          </details>
          <div class="application-totals" aria-label="Resumen de aplicación">
            <span>Aplicado <strong id="fin-application-total">$0.00</strong></span>
            <span>Por aplicar <strong id="fin-application-remaining">$0.00</strong></span>
          </div>
        </header>
        <div class="table-frame financing-obligations-frame">
          <table>
            <thead><tr><th>Tipo</th><th>Acreedor</th><th>VIN</th><th>OC</th><th class="number-cell">Saldo</th><th class="number-cell">Asignado</th><th class="selection-cell">Pago directo</th><th class="selection-cell">Seleccionar</th></tr></thead>
            <tbody id="fin-applications"></tbody>
          </table>
        </div>
        </section>
      </article>
      </div>

      <div class="financing-footer">
        <div id="fin-schedule-summary" class="schedule-summary">Calendario pendiente.</div>
        <div class="form-actions">
          <button id="configure-schedule" type="button">Revisar calendario</button>
          <button id="confirm-financing" type="button" class="primary-action">Confirmar</button>
        </div>
      </div>
    </section>
  `;
}

export function applicationRows(items: Array<FinanceableObligation | FinancingApplicationState>): string {
  return items.map((item) => `
    <tr>
      <td><span class="entity-badge ${item.entity === "FIN" ? "fin" : "con"}">${item.entity}</span></td>
      <td title="${escapeHtml(item.acreedor)}">${escapeHtml(item.acreedor)}</td>
      <td>${escapeHtml(item.vin || "—")}</td>
      <td>${escapeHtml(item.oc_mexrac || "—")}</td>
      <td class="number-cell">${formatMoney(item.saldo)}</td>
      <td class="number-cell"><input class="fin-app-amount money-input" data-id="${item.obligacion_id}" inputmode="decimal" value="${"amount" in item ? escapeHtml(item.amount) : "0.00"}" /></td>
      <td class="selection-cell"><input class="fin-direct-payment" type="checkbox" data-id="${item.obligacion_id}" ${("directPayment" in item ? item.directPayment : item.entity === "CON") ? "checked" : ""} ${item.entity === "CON" ? "" : "disabled"} aria-label="Pago directo para ${escapeHtml(item.vin || item.obligacion_id)}" /></td>
      <td class="selection-cell"><input class="fin-app-selected" type="checkbox" data-id="${item.obligacion_id}" ${"selected" in item && item.selected ? "checked" : ""} aria-label="Seleccionar obligación ${item.obligacion_id}" /></td>
    </tr>
  `).join("");
}
