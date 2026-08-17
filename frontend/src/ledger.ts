// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
import { bindTableExportButtons } from "./ui/export-table.ts";
import { escapeHtml, formatMoney, localIsoDate } from "./ui/format.ts";
import {
  loadLedger,
} from "./api.ts";

function defaultLedgerDates() {
  const today = new Date();

  const firstDay = new Date(
    today.getFullYear(),
    0,
    1,
  );

  return {
    fechaDesde: localIsoDate(firstDay),
    fechaHasta: localIsoDate(today),
  };
}

function ledgerRows(items) {
  if (items.length === 0) {
    return `
      <tr>
        <td
          colspan="8"
          class="empty-table-message"
        >
          No existen movimientos dentro del
          periodo seleccionado.
        </td>
      </tr>
    `;
  }

  return items
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.fecha)}
          </td>

          <td>
            ${escapeHtml(item.tipo)}
          </td>

          <td>
            <span
              class="entity-badge ${
                item.entity === "FIN"
                  ? "fin"
                  : "con"
              }"
            >
              ${escapeHtml(item.entity)}
            </span>
          </td>

          <td title="${escapeHtml(
            item.acreedor,
          )}">
            ${escapeHtml(item.acreedor)}
          </td>

          <td>
            ${escapeHtml(
              item.obligacion_id,
            )}
          </td>

          <td title="${escapeHtml(
            item.referencia,
          )}">
            ${escapeHtml(item.referencia)}
          </td>

          <td class="number-cell">
            ${
              Number(item.debe) !== 0
                ? formatMoney(item.debe)
                : ""
            }
          </td>

          <td class="number-cell">
            ${
              Number(item.haber) !== 0
                ? formatMoney(item.haber)
                : ""
            }
          </td>
        </tr>
      `,
    )
    .join("");
}

function showLedgerMessage(message) {
  const existingDialog =
    document.getElementById(
      "ledger-message-dialog",
    );

  if (existingDialog) {
    existingDialog.remove();
  }

  const dialog =
    document.createElement("dialog");

  dialog.id = "ledger-message-dialog";
  dialog.className = "sam-message-dialog";

  dialog.innerHTML = `
    <form method="dialog">
      <header>
        <h2>Revisa las fechas</h2>
      </header>

      <div class="sam-message-dialog-body">
        <p>
          ${escapeHtml(message)}
        </p>
      </div>

      <footer>
        <button
          type="submit"
          class="primary-button"
          autofocus
        >
          Entendido
        </button>
      </footer>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog.addEventListener(
    "close",
    () => dialog.remove(),
    {
      once: true,
    },
  );

  dialog.showModal();
}

export async function renderLedger(
  fechaDesde,
  fechaHasta,
) {
  const content =
    document.getElementById(
      "module-content",
    );

  const defaults =
    defaultLedgerDates();

  const selectedFrom =
    fechaDesde ?? defaults.fechaDesde;

  const selectedTo =
    fechaHasta ?? defaults.fechaHasta;

  content.innerHTML = `
    <div class="report-loading">
      Reconstruyendo Ledger…
    </div>
  `;

  try {
    const items = await loadLedger(
      selectedFrom,
      selectedTo,
    );

    const totalDebe = items.reduce(
      (total, item) =>
        total +
        Number(item.debe ?? 0),
      0,
    );

    const totalHaber = items.reduce(
      (total, item) =>
        total +
        Number(item.haber ?? 0),
      0,
    );

    content.innerHTML = `
      <section
        class="reports-view ledger-view"
        aria-label="Ledger"
      >
        <div class="report-toolbar ledger-toolbar">
          <form
            id="ledger-dates"
            class="report-dates"
          >
            <label>
              Desde

              <input
                id="ledger-from"
                type="date"
                value="${escapeHtml(
                  selectedFrom,
                )}"
                required
              />
            </label>

            <label>
              Hasta

              <input
                id="ledger-to"
                type="date"
                value="${escapeHtml(
                  selectedTo,
                )}"
                required
              />
            </label>

            <button type="submit">
              Actualizar
            </button>
          </form>
        </div>

        <article
          class="
            report-panel
            ledger-panel
          "
        >
          <header>
            <h2>Movimientos</h2>

            <button type="button" data-export-table="#ledger-table" data-export-filename="ledger">EXPORTAR A EXCEL</button>
          </header>

          <div
            class="
              table-frame
              ledger-table-frame
            "
          >
            <table id="ledger-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Tipo</th>
                  <th>Acreedor</th>
                  <th>Obligación</th>
                  <th>Referencia</th>

                  <th class="number-cell">
                    Debe
                  </th>

                  <th class="number-cell">
                    Haber
                  </th>
                </tr>
              </thead>

              <tbody>
                ${ledgerRows(items)}
              </tbody>

              <tfoot>
                <tr>
                  <th colspan="6">
                    Totales
                  </th>

                  <th class="number-cell">
                    ${formatMoney(
                      totalDebe,
                    )}
                  </th>

                  <th class="number-cell">
                    ${formatMoney(
                      totalHaber,
                    )}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);

    const datesForm =
      document.getElementById(
        "ledger-dates",
      );

    datesForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const newFrom =
          document.getElementById(
            "ledger-from",
          ).value;

        const newTo =
          document.getElementById(
            "ledger-to",
          ).value;

        if (newTo < newFrom) {
          showLedgerMessage(
            "La fecha final no puede ser anterior a la fecha inicial.",
          );

          return;
        }

        await renderLedger(
          newFrom,
          newTo,
        );
      },
    );
  } catch (error) {
    console.error(
      "Ledger loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error compact-error">
        No fue posible cargar el Ledger.
      </div>
    `;
  }
}
