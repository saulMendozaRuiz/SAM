import { bindTableExportButtons } from "./ui/export-table.ts";
import {
  loadPaymentCalendar,
} from "./api.ts";

const currencyFormatter =
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
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

function localIsoDate(date = new Date()) {
  const offset =
    date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 10);
}

function classifyPayment(item) {
  if (Number(item.saldo) <= 0.005) {
    return {
      label: "PAGADO",
      className: "long-term",
    };
  }

  if (item.vencimiento < localIsoDate()) {
    return {
      label: "VENCIDO",
      className: "overdue",
    };
  }

  return {
    label: "PENDIENTE",
    className: "short-term",
  };
}

function calendarRows(items) {
  return items
    .map((item) => {
      const status = classifyPayment(item);

      const documentType =
        item.is_balloon
          ? "BALLOON"
          : `CUPÓN ${item.serie_pago}`;

      return `
        <tr>
          <td>
            ${escapeHtml(item.vencimiento)}
          </td>

          <td>
            ${escapeHtml(item.financiera)}
          </td>

          <td>
            ${escapeHtml(item.folio)}
          </td>

          <td>
            ${escapeHtml(documentType)}
          </td>

          <td class="number-cell">
            ${formatMoney(item.monto)}
          </td>

          <td class="number-cell">
            ${formatMoney(item.abonado)}
          </td>

          <td class="number-cell">
            ${formatMoney(item.saldo)}
          </td>

          <td>
            <span
              class="status-badge ${status.className}"
            >
              ${status.label}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function defaultCalendarDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), 0, 1);

  return {
    fechaDesde: localIsoDate(firstDay),
    fechaHasta: localIsoDate(addYears(today, 3)),
  };
}

export async function renderPaymentCalendar(
  fechaDesde,
  fechaHasta,
) {
  const content =
    document.getElementById("module-content");

  content.innerHTML = `
    <div class="report-loading">
      Cargando calendario de pagos…
    </div>
  `;

  const defaults = defaultCalendarDates();
  const selectedFrom = fechaDesde ?? defaults.fechaDesde;
  const selectedTo = fechaHasta ?? defaults.fechaHasta;

  try {
    const items = await loadPaymentCalendar(
      selectedFrom,
      selectedTo,
    );

    content.innerHTML = `
      <section
        class="reports-view calendar-view"
        aria-label="Calendario de pagos"
      >
        <div class="report-toolbar">
          <form id="calendar-dates" class="report-dates">
            <label>
              Desde
              <input
                id="calendar-from"
                type="date"
                value="${selectedFrom}"
                required
              />
            </label>

            <label>
              Hasta
              <input
                id="calendar-to"
                type="date"
                value="${selectedTo}"
                required
              />
            </label>

            <button type="submit">Actualizar</button>
          </form>
        </div>

        <article
          class="report-panel calendar-panel"
        >
          <header>
            <h2>Documentos por pagar</h2>

            <button type="button" data-export-table="#calendar-table" data-export-filename="calendario-pagos">EXPORTAR A EXCEL</button>
          </header>

          <div class="table-frame">
            <table id="calendar-table">
              <thead>
                <tr>
                  <th>Vencimiento</th>
                  <th>Financiera</th>
                  <th>Folio</th>
                  <th>Documento</th>

                  <th class="number-cell">
                    Monto
                  </th>

                  <th class="number-cell">
                    Abonado
                  </th>

                  <th class="number-cell">
                    Saldo
                  </th>

                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>
                ${calendarRows(items)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);

    document
      .getElementById("calendar-dates")
      .addEventListener("submit", async (event) => {
        event.preventDefault();

        const newFrom = document.getElementById("calendar-from").value;
        const newTo = document.getElementById("calendar-to").value;

        if (newTo < newFrom) {
          document.getElementById("calendar-to").setCustomValidity(
            "La fecha final no puede ser anterior a la fecha inicial.",
          );
          document.getElementById("calendar-to").reportValidity();
          document.getElementById("calendar-to").setCustomValidity("");
          return;
        }

        await renderPaymentCalendar(newFrom, newTo);
      });
  } catch (error) {
    console.error(
      "Payment calendar loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar el calendario de pagos.
      </div>
    `;
  }
}
