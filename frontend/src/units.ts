import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml, formatMoney } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { Unit } from "./domain/types.ts";
import { filterUnits, type UnitFilterField } from "./units-filter.ts";
import { renderAcquisitions } from "./acquisitions/index.ts";

import {
  correctConcessionaireDueDate,
  loadUnits,
} from "./api.ts";

function correctionDialog(unit: Unit): Promise<{ date: string; password: string } | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `<form class="sam-modal corporate-modal due-date-correction" id="due-date-form">
      <header class="corporate-modal-header"><div><span class="modal-eyebrow">Corrección autorizada</span><h2>Vencimiento del concesionario</h2></div></header>
      <div class="corporate-modal-body"><p class="modal-reference">${escapeHtml(unit.vin)} · ${escapeHtml(unit.concesionario)}</p>
        <label>Nueva fecha<input id="corrected-due-date" type="date" value="${escapeHtml(unit.vencimiento_con ?? "")}" required /></label>
        <label>Contraseña<input id="correction-password" type="password" required autocomplete="current-password" /></label>
      </div>
      <footer class="corporate-modal-footer"><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary-action">Guardar corrección</button></footer>
    </form>`;
    const close = (answer: { date: string; password: string } | null) => { overlay.remove(); resolve(answer); };
    overlay.querySelector("[data-cancel]")?.addEventListener("click", () => close(null));
    overlay.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      close({ date: byId<HTMLInputElement>("corrected-due-date").value, password: byId<HTMLInputElement>("correction-password").value });
    });
    document.body.append(overlay);
    byId<HTMLInputElement>("corrected-due-date").focus();
  });
}

function unitRows(units: Unit[]): string {
  return units
    .map(
      (unit) => `
        <tr>
          <td>
            <strong>
              ${escapeHtml(unit.vin)}
            </strong>
          </td>

          <td>
            ${displayValue(unit.no_motor)}
          </td>

          <td>
            ${escapeHtml(unit.modelo_anio)}
          </td>

          <td>
            ${escapeHtml(unit.marca)}
          </td>

          <td>
            ${escapeHtml(unit.version)}
          </td>

          <td>
            ${escapeHtml(unit.concesionario)}
          </td>

          <td>
            ${displayValue(unit.oc_mexrac)}
          </td>

          <td>
            ${displayValue(unit.folio_factura)}
          </td>

          <td>
            ${displayValue(unit.entrega_patio)}
          </td>

          <td>${displayValue(unit.vencimiento_con)}</td>

          <td class="number-cell">
            ${formatMoney(unit.total)}
          </td>

          <td>
            <span class="status-badge ${unit.financiado ? "overdue" : "long-term"}">
              ${unit.financiado ? "FINANCIADO" : "SIN FINANCIAR"}
            </span>
          </td>
          <td class="export-ignore"><button type="button" class="table-action correct-due-date" data-unitid="${unit.unitid}" title="Editar vencimiento" aria-label="Editar vencimiento de ${escapeHtml(unit.vin)}"><span aria-hidden="true">✎</span></button></td>
        </tr>
      `,
    )
    .join("");
}

export async function renderUnits() {
  const content = byId("module-content");

  content.innerHTML = `
    <div class="report-loading">
      Cargando unidades…
    </div>
  `;

  try {
    const units = await loadUnits();

    content.innerHTML = `
      <section
        class="reports-view units-view"
        aria-label="Unidades"
      >
        <div class="report-toolbar report-toolbar-actions-only">
          <button id="new-acquisition" type="button">Nueva adquisición</button>
        </div>

        <article
          class="report-panel due-panel"
        >
          <header>
            <h2>Inventario de unidades</h2>

            <button
              type="button"
              data-export-table="#units-table"
              data-export-filename="unidades"
            >EXPORTAR A EXCEL</button>
          </header>

          <div class="unit-filter-bar">
            <label>Buscar en
              <select id="unit-filter-field">
                <option value="all">Todos</option>
                <option value="vin">VIN</option>
                <option value="version">Versión</option>
                <option value="marca">Marca</option>
                <option value="oc_mexrac">OC</option>
                <option value="concesionario">Concesionario</option>
              </select>
            </label>
            <label>Filtro
              <input id="unit-filter" type="search" autocomplete="off" placeholder="Ejemplo: *ASD" />
            </label>
            <span id="unit-filter-count">${units.length} unidades</span>
          </div>

          <div class="table-frame">
            <table id="units-table" class="units-table">
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>Número de motor</th>
                  <th>Modelo</th>
                  <th>Marca</th>
                  <th>Versión</th>
                  <th>Concesionario</th>
                  <th>OC</th>
                  <th>Factura</th>
                  <th>Ingreso a patio</th>
                  <th>Vencimiento concesionario</th>
                  <th class="number-cell">
                    Total
                  </th>
                  <th>Financiamiento</th>
                  <th class="export-ignore">Editar vencimiento</th>
                </tr>
              </thead>

              <tbody id="units-body">
                ${unitRows(units)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);

    content.addEventListener("click", async (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".correct-due-date");
      if (button) {
        const unit = units.find((item) => item.unitid === Number(button.dataset.unitid));
        if (!unit) return;
        const correction = await correctionDialog(unit);
        if (!correction) return;
        try {
          await correctConcessionaireDueDate(
            unit.unitid,
            correction.date,
            byId("active-user").textContent?.trim() ?? "",
            correction.password,
          );
          await renderUnits();
        } catch { /* invokeMutation ya mostró el error */ }
      }
    });

    const applyFilter = () => {
      const field = byId<HTMLSelectElement>("unit-filter-field").value as UnitFilterField;
      const filtered = filterUnits(units, field, byId<HTMLInputElement>("unit-filter").value);
      byId<HTMLTableSectionElement>("units-body").innerHTML = unitRows(filtered);
      byId("unit-filter-count").textContent = `${filtered.length} ${filtered.length === 1 ? "unidad" : "unidades"}`;
    };
    byId("unit-filter-field").addEventListener("change", applyFilter);
    byId("unit-filter").addEventListener("input", applyFilter);

    document
      .getElementById("new-acquisition")
      ?.addEventListener("click", () => {
        renderAcquisitions();
      });
  } catch (error) {
    console.error(
      "Unit loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar las unidades.
      </div>
    `;
  }
}
