// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
import {
  loadObligations,
  registerPayment,
} from "./api.ts";
import { escapeHtml, formatMoney, localIsoDate } from "./ui/format.ts";
import { centsToMoney, tryParseMoney as moneyToCents } from "./ui/money.ts";

function applicationRows(obligations) {
  return obligations
    .map(
      (item) => `
        <tr>
          <td>
            <input
              class="payment-selection"
              type="checkbox"
              data-obligation-id="${
                item.obligacion_id
              }"
              aria-label="Seleccionar obligación ${
                item.obligacion_id
              }"
            />
          </td>

          <td class="number-cell">
            ${item.obligacion_id}
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

          <td>
            <strong>
              ${escapeHtml(item.acreedor)}
            </strong>
          </td>

          <td>
            ${escapeHtml(item.vencimiento)}
          </td>

          <td class="number-cell">
            ${formatMoney(item.saldo)}
          </td>

          <td>
            <input
              class="payment-amount"
              type="number"
              min="0.01"
              max="${Number(
                item.saldo,
              ).toFixed(2)}"
              step="0.01"
              inputmode="decimal"
              data-obligation-id="${
                item.obligacion_id
              }"
              disabled
              placeholder="0.00"
              aria-label="Monto para obligación ${
                item.obligacion_id
              }"
            />
          </td>
        </tr>
      `,
    )
    .join("");
}

function setMessage(
  element,
  text,
  type = "",
) {
  element.textContent = text;
  element.className =
    `payment-message ${type}`.trim();
}

function updateAppliedTotal() {
  const totalElement =
    document.getElementById(
      "payment-applied-total",
    );

  let totalCents = 0;

  document
    .querySelectorAll(
      ".payment-selection:checked",
    )
    .forEach((checkbox) => {
      const obligationId =
        checkbox.dataset.obligationId;

      const input =
        document.querySelector(
          `.payment-amount[data-obligation-id="${obligationId}"]`,
        );

      const cents =
        moneyToCents(input.value);

      if (cents !== null) {
        totalCents += cents;
      }
    });

  totalElement.textContent =
    formatMoney(totalCents / 100);
}

function initializeApplicationRows() {
  document
    .querySelectorAll(
      ".payment-selection",
    )
    .forEach((checkbox) => {
      checkbox.addEventListener(
        "change",
        () => {
          const obligationId =
            checkbox.dataset.obligationId;

          const amountInput =
            document.querySelector(
              `.payment-amount[data-obligation-id="${obligationId}"]`,
            );

          amountInput.disabled =
            !checkbox.checked;

          if (checkbox.checked) {
            amountInput.focus();
          } else {
            amountInput.value = "";
          }

          updateAppliedTotal();
        },
      );
    });

  document
    .querySelectorAll(
      ".payment-amount",
    )
    .forEach((input) => {
      input.addEventListener(
        "input",
        updateAppliedTotal,
      );
    });
}

function collectApplications() {
  const applications = [];

  document
    .querySelectorAll(
      ".payment-selection:checked",
    )
    .forEach((checkbox) => {
      const obligationId =
        checkbox.dataset.obligationId;

      const amountInput =
        document.querySelector(
          `.payment-amount[data-obligation-id="${obligationId}"]`,
        );

      applications.push({
        obligacionId:
          Number(obligationId),
        monto: amountInput.value.trim(),
      });
    });

  return applications;
}

function validateForm(
  declaredAmount,
  applications,
) {
  const declaredCents =
    moneyToCents(declaredAmount);

  if (
    declaredCents === null ||
    declaredCents <= 0
  ) {
    return {
      valid: false,
      message:
        "Captura un monto de abono válido.",
    };
  }

  if (applications.length === 0) {
    return {
      valid: false,
      message:
        "Selecciona al menos una obligación.",
    };
  }

  let appliedCents = 0;

  for (const application of applications) {
    const cents =
      moneyToCents(application.monto);

    if (cents === null || cents <= 0) {
      return {
        valid: false,
        message:
          "Todos los montos aplicados deben ser positivos.",
      };
    }

    appliedCents += cents;
  }

  if (appliedCents !== declaredCents) {
    return {
      valid: false,
      message:
        `El abono es ${formatMoney(
          declaredCents / 100,
        )}, pero las aplicaciones suman ${formatMoney(
          appliedCents / 100,
        )}.`,
    };
  }

  return {
    valid: true,
    declaredCents,
    appliedCents,
  };
}

function initializePaymentForm() {
  const form =
    document.getElementById(
      "payment-form",
    );

  const submitButton =
    document.getElementById(
      "payment-submit",
    );

  const message =
    document.getElementById(
      "payment-message",
    );

  initializeApplicationRows();

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const fecha =
        document.getElementById(
          "payment-date",
        ).value;

      const monto =
        document.getElementById(
          "payment-total",
        ).value.trim();

      const referencia =
        document.getElementById(
          "payment-reference",
        ).value.trim();

      const comentarios =
        document.getElementById(
          "payment-comments",
        ).value.trim();

      const aplicaciones =
        collectApplications();

      const validation =
        validateForm(
          monto,
          aplicaciones,
        );

      if (!validation.valid) {
        setMessage(
          message,
          validation.message,
          "error",
        );

        return;
      }

      submitButton.disabled = true;
      submitButton.textContent =
        "Registrando…";

      setMessage(
        message,
        "Validando y registrando el abono…",
      );

      try {
        const result =
          await registerPayment({
            fecha,
            monto:
              centsToMoney(
                validation.declaredCents,
              ),
            referencia,
            aplicaciones,
            comentarios:
              comentarios || null,
          });

        window.dispatchEvent(
          new CustomEvent(
            "sam:data-changed",
          ),
        );

        await renderPayments(
          `Abono ${result.id_abono} registrado correctamente por ${formatMoney(
            result.monto,
          )}.`,
        );
      } catch (error) {
        console.error(
          "Payment registration failed:",
          error,
        );

        setMessage(
          message,
          String(error),
          "error",
        );

        submitButton.disabled = false;
        submitButton.textContent =
          "Registrar abono";
      }
    },
  );
}

export async function renderPayments(
  successMessage = "",
) {
  const content =
    document.getElementById(
      "module-content",
    );

  content.innerHTML = `
    <div class="report-loading">
      Reconstruyendo saldos…
    </div>
  `;

  try {
    const allObligations =
      await loadObligations();

    const obligations =
      allObligations.filter(
        (item) =>
          item.activo !== false &&
          Number(item.saldo) > 0.005,
      );

    content.innerHTML = `
      <section
        class="reports-view payments-view"
        aria-label="Registrar abono"
      >
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
          id="payment-form"
          class="payment-form"
        >
          <article class="report-panel">
            <header>
              <h2>Datos del abono</h2>

              <span>
                Operación transaccional
              </span>
            </header>

            <div class="payment-fields">
              <label>
                Fecha

                <input
                  id="payment-date"
                  type="date"
                  value="${localIsoDate()}"
                  required
                />
              </label>

              <label>
                Monto total

                <input
                  id="payment-total"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputmode="decimal"
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                Referencia

                <input
                  id="payment-reference"
                  type="text"
                  autocomplete="off"
                  placeholder="Transferencia, ficha o referencia"
                />
              </label>

              <label class="payment-comments">
                Comentarios

                <input
                  id="payment-comments"
                  type="text"
                  autocomplete="off"
                  placeholder="Comentario opcional"
                />
              </label>
            </div>
          </article>

          <article
            class="report-panel due-panel"
          >
            <header>
              <h2>Aplicaciones</h2>

              <span>
                ${obligations.length}
                documentos con saldo
              </span>
            </header>

            <div class="table-frame">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Acreedor</th>
                    <th>Vencimiento</th>

                    <th class="number-cell">
                      Saldo
                    </th>

                    <th>
                      Monto aplicado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  ${applicationRows(
                    obligations,
                  )}
                </tbody>

                <tfoot>
                  <tr>
                    <th colspan="6">
                      Total aplicado
                    </th>

                    <th id="payment-applied-total">
                      ${formatMoney(0)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </article>

          <div
            id="payment-message"
            class="payment-message"
            role="status"
          ></div>

          <div class="payment-actions">
            <button
              id="payment-submit"
              type="submit"
            >
              Registrar abono
            </button>
          </div>
        </form>
      </section>
    `;

    initializePaymentForm();
  } catch (error) {
    console.error(
      "Payment form loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible preparar el registro
        de abonos.
      </div>
    `;
  }
}
