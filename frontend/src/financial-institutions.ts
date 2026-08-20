import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { FinancialInstitution } from "./domain/types.ts";
import {
  createFinancialInstitution,
  loadFinancialInstitutions,
} from "./api.ts";
import { messageDialog } from "./ui/message.ts";

function financialInstitutionRows(items: FinancialInstitution[]): string {
  return items
    .map(
      (item) => `
        <tr>
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
        <form id="financial-institution-form" class="catalog-create-form">
          <label><span>Razón social</span><input name="razon_social" required /></label>
          <label><span>RFC</span><input name="rfc" required /></label>
          <label><span>Comentarios</span><input name="comentarios" /></label>
          <button type="submit" class="primary-action">DAR DE ALTA</button>
        </form>
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
    byId<HTMLFormElement>("financial-institution-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      try {
        await createFinancialInstitution({
          razon_social: String(data.get("razon_social") ?? ""),
          rfc: String(data.get("rfc") ?? ""),
          comentarios: String(data.get("comentarios") ?? ""),
        });
        await messageDialog("La financiera quedó disponible para nuevos financiamientos.", "Financiera creada");
        await renderFinancialInstitutions();
      } catch { /* invokeMutation ya mostró el error */ }
    });
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
