import { escapeHtml, formatMoney, localIsoDate } from "./validation.ts";

export function financingRows(items) {
  return items.map((item) => {
    const expected = Number(item.monto_cupones) + Number(item.monto_balloon);
    const balanced = [item.monto_aplicado, item.monto_calendario, item.monto_materializado]
      .every((value) => Math.abs(expected - Number(value)) <= 0.005);

    return `
      <tr>
        <td>${item.id_finto}</td>
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

export function listScreen(items, message = "") {
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
        <article class="summary-card total"><span>Monto financiado</span><strong>${formatMoney(total)}</strong></article>
        <article class="summary-card units"><span>Financiamientos</span><strong>${items.length}</strong></article>
      </div>
      <article class="report-panel due-panel">
        <header><h2>Contratos</h2><button type="button" data-export-table="#financing-table" data-export-filename="financiamientos">EXPORTAR A EXCEL</button></header>
        <div class="table-frame">
          <table id="financing-table">
            <thead><tr><th>ID</th><th>Financiera</th><th>Folio</th><th>Emisión</th><th class="number-cell">Total</th><th class="number-cell">Cupones</th><th>Validación</th><th class="export-ignore"></th></tr></thead>
            <tbody>${financingRows(items)}</tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function financierOptions(items) {
  return items.map((item) => `<option value="${item.id_fin}">${escapeHtml(item.razon_social)}</option>`).join("");
}

export function formScreen(financiers) {
  const today = localIsoDate();

  return `
    <section class="reports-view financing-form-view">
      <div class="report-toolbar financing-toolbar">
        <h1>Registrar financiamiento</h1>
        <button id="back-financing" type="button">Regresar</button>
      </div>

      <div class="financing-form-body sam-scroll-region">
      <article class="report-panel financing-primary-panel">
        <header><h2>Estructura del financiamiento</h2></header>
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
      </article>

      <article class="report-panel financing-data">
        <header><h2>Datos del contrato</h2></header>
        <div class="financing-secondary-fields">
          <label><span>Financiera</span><select id="fin-id"><option value="">Selecciona una financiera</option>${financierOptions(financiers)}</select></label>
          <label><span>Folio</span><input id="fin-folio" autocomplete="off" /></label>
          <label><span>Emisión</span><input id="fin-emission" type="date" value="${today}" /></label>
          <label><span>Primer vencimiento</span><input id="fin-first-due" type="date" /></label>
          <label><span>Vencimiento balloon</span><input id="fin-balloon-due" type="date" /></label>
          <label><span>Comentarios</span><input id="fin-comments" autocomplete="off" /></label>
        </div>
      </article>

      <article class="report-panel financing-obligations-panel">
        <header>
          <h2>Aplicaciones a obligaciones</h2>
          <div class="application-totals" aria-label="Resumen de aplicación">
            <span>Aplicado <strong id="fin-application-total">$0.00</strong></span>
            <span>Por aplicar <strong id="fin-application-remaining">$0.00</strong></span>
          </div>
        </header>
        <div class="table-frame financing-obligations-frame">
          <table>
            <thead><tr><th>ID</th><th>Tipo</th><th>Acreedor</th><th>VIN</th><th>Vencimiento</th><th class="number-cell">Saldo</th><th class="number-cell">Monto amparado</th><th class="selection-cell">Seleccionar</th></tr></thead>
            <tbody id="fin-applications"></tbody>
          </table>
        </div>
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

export function applicationRows(items) {
  return items.map((item) => `
    <tr>
      <td>${item.obligacion_id}</td>
      <td><span class="entity-badge ${item.entity === "FIN" ? "fin" : "con"}">${item.entity}</span></td>
      <td>${escapeHtml(item.acreedor)}</td>
      <td>${escapeHtml(item.vin || "—")}</td>
      <td>${escapeHtml(item.vencimiento)}</td>
      <td class="number-cell">${formatMoney(item.saldo)}</td>
      <td class="number-cell"><input class="fin-app-amount money-input" data-id="${item.obligacion_id}" inputmode="decimal" value="0.00" /></td>
      <td class="selection-cell"><input class="fin-app-selected" type="checkbox" data-id="${item.obligacion_id}" aria-label="Seleccionar obligación ${item.obligacion_id}" /></td>
    </tr>
  `).join("");
}

export function scheduleRows(items) {
  return items.map((item, index) => `
    <tr data-index="${index}">
      <td>${item.serie_pago}</td>
      <td>${item.is_balloon ? "BALLOON" : "CUPÓN"}</td>
      <td><input class="fin-schedule-date" type="date" value="${item.vencimiento}" /></td>
      <td class="number-cell"><input class="fin-schedule-amount money-input" inputmode="decimal" value="${item.monto}" /></td>
    </tr>
  `).join("");
}
