import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { FinancialInstitution } from "./domain/types.ts";
import {
  loadFinancialInstitutions,
} from "./api.ts";

function financialInstitutionRows(items: FinancialInstitution[]): string {
  return items
    .map(
      (item) => `
        <tr>
          <td class="number-cell">
            ${item.id_fin}
          </td>

          <td>
            <strong>
              ${escapeHtml(item.razon_social)}
            </strong>
          </td>

          <td>
            ${escapeHtml(item.rfc)}
          </td>

          <td>
            ${displayValue(item.comentarios)}
          </td>
        </tr>
      `,
    )
    .join("");
}

export async function renderFinancialInstitutions() {
  const content = byId("module-content");

  content.innerHTML = `
    <div class="report-loading">
      Cargando financieras…
    </div>
  `;

  try {
    const institutions =
      await loadFinancialInstitutions();

    content.innerHTML = `
      <section
        class="reports-view financial-institutions-view"
        aria-label="Financieras"
      >
<article
          class="report-panel due-panel"
        >
          <header>
            <h2>Catálogo</h2>

            <button type="button" data-export-table="#financial-institutions-table" data-export-filename="financieras">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="financial-institutions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Razón social</th>
                  <th>RFC</th>
                  <th>Comentarios</th>
                </tr>
              </thead>

              <tbody>
                ${financialInstitutionRows(
                  institutions,
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);
  } catch (error) {
    console.error(
      "Financial institution loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar las financieras.
      </div>
    `;
  }
}
