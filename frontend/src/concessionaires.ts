import { bindTableExportButtons } from "./ui/export-table.ts";
import {
  loadConcessionaires,
} from "./api.ts";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return escapeHtml(value);
}

function concessionaireRows(items) {
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
  const content =
    document.getElementById("module-content");

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
