import { loadPaymentCalendar } from "./api.ts";
import type { CalendarItem } from "./domain/types.ts";
import { byId } from "./ui/dom.ts";
import { bindTableExportButtons } from "./ui/export-table.ts";
import { escapeHtml, formatMoney, localIsoDate } from "./ui/format.ts";

function rows(items: CalendarItem[]): string {
  const today = localIsoDate();
  return items.map((item) => {
    const status = Number(item.saldo) <= 0.005 ? ["PAGADO", "long-term"] : item.vencimiento < today ? ["VENCIDO", "overdue"] : ["PENDIENTE", "short-term"];
    return `<tr>
      <td>${escapeHtml(item.vencimiento)}</td><td>${escapeHtml(item.financiera)}</td><td>${escapeHtml(item.folio)}</td>
      <td>${item.is_balloon ? "BALLOON" : `CUPÓN ${item.serie_pago}`}</td>
      <td class="number-cell">${formatMoney(item.monto)}</td><td class="number-cell">${formatMoney(item.abonado)}</td>
      <td class="number-cell">${formatMoney(item.saldo)}</td><td><span class="status-badge ${status[1]}">${status[0]}</span></td>
    </tr>`;
  }).join("");
}

function defaultDates(): [string, string] {
  const today = new Date();
  const until = new Date(today);
  until.setFullYear(until.getFullYear() + 3);
  return [localIsoDate(new Date(today.getFullYear(), 0, 1)), localIsoDate(until)];
}

export async function renderPaymentCalendar(from?: string, to?: string): Promise<void> {
  const content = byId("module-content");
  const defaults = defaultDates();
  const selectedFrom = from ?? defaults[0];
  const selectedTo = to ?? defaults[1];
  content.innerHTML = `<div class="report-loading">Cargando calendario de pagos…</div>`;
  try {
    const items = await loadPaymentCalendar(selectedFrom, selectedTo);
    content.innerHTML = `<section class="reports-view calendar-view" aria-label="Calendario de pagos">
      <div class="report-toolbar"><form id="calendar-dates" class="report-dates">
        <label>Desde<input id="calendar-from" type="date" value="${selectedFrom}" required /></label>
        <label>Hasta<input id="calendar-to" type="date" value="${selectedTo}" required /></label>
        <button type="submit">Actualizar</button>
      </form></div>
      <article class="report-panel calendar-panel"><header><h2>Documentos por pagar</h2>
        <button type="button" data-export-table="#calendar-table" data-export-filename="calendario-pagos">EXPORTAR A EXCEL</button></header>
        <div class="table-frame"><table id="calendar-table"><thead><tr><th>Vencimiento</th><th>Financiera</th><th>Folio</th><th>Documento</th>
          <th class="number-cell">Monto</th><th class="number-cell">Abonado</th><th class="number-cell">Saldo</th><th>Estado</th>
        </tr></thead><tbody>${rows(items)}</tbody></table></div>
      </article></section>`;
    bindTableExportButtons(content);
    byId("calendar-dates").addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextFrom = byId<HTMLInputElement>("calendar-from").value;
      const nextTo = byId<HTMLInputElement>("calendar-to").value;
      if (nextTo < nextFrom) return window.alert("La fecha final no puede ser anterior a la fecha inicial.");
      await renderPaymentCalendar(nextFrom, nextTo);
    });
  } catch (error) {
    console.error("Payment calendar loading failed:", error);
    content.innerHTML = `<div class="report-error">No fue posible cargar el calendario de pagos.</div>`;
  }
}
