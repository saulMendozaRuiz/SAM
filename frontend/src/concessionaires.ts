import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { Concessionaire } from "./domain/types.ts";
import {
  createConcessionaire,
  loadConcessionaires,
} from "./api.ts";
import { messageDialog } from "./ui/message.ts";

function concessionaireRows(items: Concessionaire[]): string {
  return items
    .map(
      (item) => `
        <tr>
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
        <form id="concessionaire-form" class="catalog-create-form">
          <label><span>Razón social</span><input name="name" required /></label>
          <label><span>Cluster</span><input name="cluster" /></label>
          <label><span>RFC</span><input name="rfc" required /></label>
          <label><span>Comentarios</span><input name="comentarios" /></label>
          <button type="submit" class="primary-action">DAR DE ALTA</button>
        </form>
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
    byId<HTMLFormElement>("concessionaire-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      try {
        await createConcessionaire({
          name: String(data.get("name") ?? ""),
          cluster: String(data.get("cluster") ?? ""),
          rfc: String(data.get("rfc") ?? ""),
          comentarios: String(data.get("comentarios") ?? ""),
        });
        await messageDialog("El concesionario quedó disponible para nuevas adquisiciones.", "Concesionario creado");
        await renderConcessionaires();
      } catch { /* invokeMutation ya mostró el error */ }
    });
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
