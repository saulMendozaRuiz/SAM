import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { Concessionaire } from "./domain/types.ts";
import {
  loadConcessionaires,
} from "./api.ts";

function concessionaireRows(items: Concessionaire[]): string {
  return items
    .map(
      (item) => `
        <tr>
          <td class="number-cell">
            ${item.id_con}
          </td>

          <td>
            <strong>
              ${escapeHtml(item.name)}
            </strong>
          </td>

          <td>
            ${displayValue(item.cluster)}
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

export async function renderConcessionaires() {
  const content = byId("module-content");

  content.innerHTML = `
    <div class="report-loading">
      Cargando concesionarios…
    </div>
  `;

  try {
    const concessionaires =
      await loadConcessionaires();

    content.innerHTML = `
      <section
        class="reports-view concessionaires-view"
        aria-label="Concesionarios"
      >
<article
          class="report-panel due-panel"
        >
          <header>
            <h2>Catálogo</h2>

            <button type="button" data-export-table="#concessionaires-table" data-export-filename="concesionarios">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="concessionaires-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Razón social</th>
                  <th>Cluster</th>
                  <th>RFC</th>
                  <th>Comentarios</th>
                </tr>
              </thead>

              <tbody>
                ${concessionaireRows(
                  concessionaires,
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
      "Concessionaire loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar los concesionarios.
      </div>
    `;
  }
}
