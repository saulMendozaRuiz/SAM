import { bindTableExportButtons } from "./ui/export-table.ts";
import {
  defaultReportDates,
  loadReports,
} from "./api.ts";

const currencyFormatter =
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return currencyFormatter.format(
    Number(value ?? 0),
  );
}

function sumBy(
  items,
  predicate = () => true,
) {
  return items
    .filter(predicate)
    .reduce(
      (total, item) =>
        total + Number(item.saldo ?? 0),
      0,
    );
}

function debtRows(items) {
  return items
    .map(
      (item) => `
        <tr>
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

          <td>
            ${escapeHtml(
              item.acreedor ?? "Sin nombre",
            )}
          </td>

          <td class="number-cell">
            ${formatMoney(item.saldo)}
          </td>
        </tr>
      `,
    )
    .join("");
}

function uncoveredRows(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.vin)}
          </td>

          <td>
            ${escapeHtml(
              `${item.marca} ${item.version}`,
            )}
          </td>

          <td class="number-cell">
            ${formatMoney(item.saldo)}
          </td>
        </tr>
      `,
    )
    .join("");
}

function dueRows(items) {
  return items
    .map((item) => {
      let className = "long-term";

      if (
        item.clasificacion === "VENCIDO"
      ) {
        className = "overdue";
      } else if (
        item.clasificacion ===
        "CORTO PLAZO"
      ) {
        className = "short-term";
      }

      return `
        <tr>
          <td>
            ${escapeHtml(
              item.vencimiento,
            )}
          </td>

          <td>
            ${escapeHtml(
              item.acreedor ?? "Sin nombre",
            )}
          </td>

          <td>
            <span
              class="status-badge ${className}"
            >
              ${escapeHtml(
                item.clasificacion,
              )}
            </span>
          </td>

          <td class="number-cell">
            ${formatMoney(item.saldo)}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderLoading(content) {
  content.innerHTML = `
    <div class="report-loading">
      Calculando reportes…
    </div>
  `;
}

function renderError(content) {
  content.innerHTML = `
    <div class="report-error">
      No fue posible cargar los reportes.
    </div>
  `;
}

function renderReportContent(
  content,
  reports,
  selectedCutoff,
  selectedHorizon,
) {
  const totalDebt = sumBy(
    reports.debtSummary,
  );

  const overdue = sumBy(
    reports.dueDates,
    (item) =>
      item.clasificacion === "VENCIDO",
  );

  const shortTerm = sumBy(
    reports.dueDates,
    (item) =>
      item.clasificacion ===
      "CORTO PLAZO",
  );

  content.innerHTML = `
    <section
      class="reports-view"
      aria-label="Reportes ejecutivos"
    >
      <div class="report-toolbar">
        <form
          id="report-dates"
          class="report-dates"
        >
          <label>
            Fecha de corte

            <input
              id="report-cutoff"
              type="date"
              value="${escapeHtml(
                selectedCutoff,
              )}"
              required
            />
          </label>

          <label>
            Horizonte

            <input
              id="report-horizon"
              type="date"
              value="${escapeHtml(
                selectedHorizon,
              )}"
              required
            />
          </label>

          <button type="submit">
            Actualizar
          </button>
        </form>
      </div>

      <div class="summary-cards">
        <article
          class="summary-card total"
        >
          <span>Deuda total</span>

          <strong>
            ${formatMoney(totalDebt)}
          </strong>
        </article>

        <article
          class="summary-card overdue"
        >
          <span>Vencido</span>

          <strong>
            ${formatMoney(overdue)}
          </strong>
        </article>

        <article
          class="summary-card short"
        >
          <span>Corto plazo</span>

          <strong>
            ${formatMoney(shortTerm)}
          </strong>
        </article>

        <article
          class="summary-card units"
        >
          <span>
            Unidades sin cobertura
          </span>

          <strong>
            ${reports.uncoveredUnits.length}
          </strong>
        </article>
      </div>

      <div class="report-grid">
        <article class="report-panel">
          <header>
            <h2>Deuda por acreedor</h2>

            <button type="button" data-export-table="#report-debt-table" data-export-filename="reporte-deuda-acreedor">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="report-debt-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Acreedor</th>

                  <th class="number-cell">
                    Saldo
                  </th>
                </tr>
              </thead>

              <tbody>
                ${debtRows(
                  reports.debtSummary,
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article class="report-panel">
          <header>
            <h2>
              Unidades sin cobertura total
            </h2>

            <button type="button" data-export-table="#report-uncovered-table" data-export-filename="reporte-unidades-sin-cobertura">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="report-uncovered-table">
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>Unidad</th>

                  <th class="number-cell">
                    Saldo
                  </th>
                </tr>
              </thead>

              <tbody>
                ${uncoveredRows(
                  reports.uncoveredUnits,
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article
          class="report-panel due-panel"
        >
          <header>
            <h2>Vencimientos</h2>

            <button type="button" data-export-table="#report-due-table" data-export-filename="reporte-vencimientos">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="report-due-table">
              <thead>
                <tr>
                  <th>Vencimiento</th>
                  <th>Acreedor</th>
                  <th>Clasificación</th>

                  <th class="number-cell">
                    Saldo
                  </th>
                </tr>
              </thead>

              <tbody>
                ${dueRows(
                  reports.dueDates,
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  `;
}

function connectDateForm(samData) {
  const reportDatesForm =
    document.getElementById(
      "report-dates",
    );

  reportDatesForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const newCutoff =
        document.getElementById(
          "report-cutoff",
        ).value;

      const newHorizon =
        document.getElementById(
          "report-horizon",
        ).value;

      if (newHorizon < newCutoff) {
        window.alert(
          "El horizonte no puede ser anterior a la fecha de corte.",
        );

        return;
      }

      await renderReports(
        samData,
        newCutoff,
        newHorizon,
      );
    },
  );
}

export async function renderReports(
  samData,
  cutoffDate,
  horizonDate,
) {
  const content =
    document.getElementById(
      "module-content",
    );

  const defaults = defaultReportDates();

  const selectedCutoff =
    cutoffDate ??
    samData.reports?.cutoffDate ??
    defaults.cutoffDate;

  const selectedHorizon =
    horizonDate ??
    samData.reports?.horizonDate ??
    defaults.horizonDate;

  renderLoading(content);

  try {
    const datesChanged =
      cutoffDate !== undefined ||
      horizonDate !== undefined;

    const reports = datesChanged
      ? await loadReports(
          selectedCutoff,
          selectedHorizon,
        )
      : samData.reports;

    if (!reports) {
      throw new Error(
        "SAM report data is unavailable",
      );
    }

    samData.reports = reports;

    renderReportContent(
      content,
      reports,
      selectedCutoff,
      selectedHorizon,
    );

    connectDateForm(samData);
    bindTableExportButtons(content);
  } catch (error) {
    console.error(
      "Report loading failed:",
      error,
    );

    renderError(content);
  }
}