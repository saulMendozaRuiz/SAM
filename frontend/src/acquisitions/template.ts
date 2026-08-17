// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
import {
  localIsoDate,
} from "./validation.ts";
import { escapeHtml } from "../ui/format.ts";

function concessionaireOptions(items) {
  return items
    .map(
      (item) => `
        <option value="${item.id_con}">
          ${escapeHtml(item.name)}
        </option>
      `,
    )
    .join("");
}

export const acquisitionGridFields = [
  "vin",
  "engine",
  "year",
  "brand",
  "version",
  "invoice",
  "subtotal",
  "vat",
  "total",
  "delivery",
  "dueDate",
  "comments",
];

function inputValue(values, key, fallback = "") {
  return escapeHtml(values[key] ?? fallback);
}

export function acquisitionGridRow(
  index,
  concessionaires,
  values = {},
) {
  const dueDate =
    inputValue(
      values,
      "dueDate",
      localIsoDate(),
    );

  return `
    <tr
      class="acquisition-grid-row"
      data-row-index="${index}"
    >
      <td class="grid-row-actions export-ignore">
        <button
          class="acquisition-duplicate-row"
          type="button"
          title="Duplicar fila"
          aria-label="Duplicar fila ${index + 1}"
        >+</button>

        <button
          class="acquisition-remove-row"
          type="button"
          title="Eliminar fila"
          aria-label="Eliminar fila ${index + 1}"
        >−</button>
      </td>

      <td class="grid-row-number">
        ${index + 1}
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-vin"
          data-field="vin"
          type="text"
          maxlength="50"
          autocomplete="off"
          value="${inputValue(values, "vin")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-engine"
          data-field="engine"
          type="text"
          maxlength="80"
          autocomplete="off"
          value="${inputValue(values, "engine")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-year"
          data-field="year"
          type="number"
          min="1900"
          max="2200"
          step="1"
          value="${inputValue(values, "year")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-brand"
          data-field="brand"
          type="text"
          maxlength="80"
          autocomplete="off"
          value="${inputValue(values, "brand")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-version"
          data-field="version"
          type="text"
          maxlength="150"
          autocomplete="off"
          value="${inputValue(values, "version")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-invoice"
          data-field="invoice"
          type="text"
          maxlength="100"
          autocomplete="off"
          value="${inputValue(values, "invoice")}"
        />
      </td>

      <td class="number-cell">
        <input
          class="acquisition-grid-cell acquisition-subtotal money-input"
          data-field="subtotal"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${inputValue(values, "subtotal")}"
          placeholder="0.00"
        />
      </td>

      <td class="number-cell">
        <input
          class="acquisition-grid-cell acquisition-vat money-input"
          data-field="vat"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${inputValue(values, "vat")}"
          placeholder="0.00"
        />
      </td>

      <td class="number-cell">
        <input
          class="acquisition-grid-cell acquisition-total money-input"
          data-field="total"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          value="${inputValue(values, "total")}"
          placeholder="0.00"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-delivery"
          data-field="delivery"
          type="date"
          value="${inputValue(values, "delivery")}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-due-date"
          data-field="dueDate"
          type="date"
          value="${dueDate}"
        />
      </td>

      <td>
        <input
          class="acquisition-grid-cell acquisition-comments"
          data-field="comments"
          type="text"
          autocomplete="off"
          value="${inputValue(values, "comments")}"
          placeholder="Opcional"
        />
      </td>
    </tr>
  `;
}

export function acquisitionScreen({
  concessionaires,
  successMessage = "",
}) {
  return `
    <section
      class="reports-view acquisitions-view acquisition-grid-view"
      aria-label="Nueva adquisición"
    >
      <div class="report-toolbar acquisition-grid-toolbar">
        <div class="acquisition-grid-toolbar-actions">
          <label class="acquisition-global-field">
            <span>Concesionario</span>
            <select id="acquisition-global-concessionaire">
              <option value="">Selecciona un concesionario</option>
              ${concessionaireOptions(concessionaires)}
            </select>
          </label>

          <label class="acquisition-global-oc-field">
            <span>OC MexRAC</span>
            <input
              id="acquisition-global-oc"
              type="text"
              maxlength="80"
              autocomplete="off"
              placeholder="OC de la adquisición"
            />
          </label>

          <label class="acquisition-row-count-control">
            <span>Filas</span>
            <input
              id="acquisition-row-count-input"
              type="number"
              min="1"
              max="500"
              step="1"
              value="1"
              inputmode="numeric"
            />
          </label>

          <button
            id="acquisition-clear-grid"
            type="button"
          >
            Limpiar tabla
          </button>
        </div>

        <button
          id="acquisition-back"
          type="button"
        >
          Regresar
        </button>
      </div>

      ${
        successMessage
          ? `
            <div class="payment-message success">
              ${escapeHtml(successMessage)}
            </div>
          `
          : ""
      }

      <form
        id="acquisition-form"
        class="payment-form acquisition-grid-form"
      >
        <article
          class="report-panel acquisition-grid-panel"
        >
          <header>
            <h2>Captura masiva</h2>

            <div class="acquisition-grid-summary">
              <span id="acquisition-row-count">
                1 unidad
              </span>

              <strong id="acquisition-total-summary">
                $0.00
              </strong>
            </div>
          </header>

          <div
            id="acquisition-grid-frame"
            class="table-frame acquisition-grid-frame"
            tabindex="-1"
          >
            <table
              id="acquisition-grid"
              class="acquisition-grid"
            >
              <thead>
                <tr>
                  <th class="grid-row-actions export-ignore"></th>
                  <th class="grid-row-number">#</th>
                  <th>VIN</th>
                  <th>Motor</th>
                  <th>Modelo</th>
                  <th>Marca</th>
                  <th>Versión</th>
                  <th>Factura</th>
                  <th class="number-cell">Subtotal</th>
                  <th class="number-cell">IVA</th>
                  <th class="number-cell">Total</th>
                  <th>Ingreso patio</th>
                  <th>Vencimiento</th>
                  <th>Comentarios</th>
                </tr>
              </thead>

              <tbody id="acquisition-grid-body">
                ${acquisitionGridRow(
                  0,
                  concessionaires,
                )}
              </tbody>
            </table>
          </div>
        </article>

        <div
          id="acquisition-message"
          class="payment-message"
          role="status"
        ></div>

        <div class="payment-actions acquisition-footer">
          <span class="acquisition-grid-hint">
            Pega rangos desde Excel con Ctrl+V. Tab/Enter y flechas navegan por celdas.
          </span>

          <button
            id="acquisition-submit"
            type="submit"
          >
            Confirmar adquisición
          </button>
        </div>
      </form>
    </section>
  `;
}
