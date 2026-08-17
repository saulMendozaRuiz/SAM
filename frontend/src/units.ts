import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml, formatMoney } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { Unit } from "./domain/types.ts";
import { renderAcquisitions } from "./acquisitions/index.ts";

import {
  loadUnits,
} from "./api.ts";

function unitRows(units: Unit[]): string {
  return units
    .map(
      (unit) => `
        <tr>
          <td class="number-cell">
            ${unit.unitid}
          </td>

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

          <td class="number-cell">
            ${formatMoney(unit.total)}
          </td>

          <td>
            <span class="status-badge ${unit.financiado ? "overdue" : "long-term"}">
              ${unit.financiado ? "FINANCIADO" : "DISPONIBLE"}
            </span>
          </td>
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

          <div class="table-frame">
            <table id="units-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>VIN</th>
                  <th>Número de motor</th>
                  <th>Modelo</th>
                  <th>Marca</th>
                  <th>Versión</th>
                  <th>Concesionario</th>
                  <th>OC</th>
                  <th>Factura</th>
                  <th>Ingreso a patio</th>
                  <th class="number-cell">
                    Total
                  </th>
                  <th>Estado financiero</th>
                </tr>
              </thead>

              <tbody>
                ${unitRows(units)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);

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
