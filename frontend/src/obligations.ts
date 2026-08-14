import {
  loadObligations,
} from "./api.ts";

import {
  bindTableExportButtons,
} from "./ui/export-table.ts";

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

function displayValue(value) {
  return value === null ||
    value === undefined ||
    value === ""
    ? "—"
    : escapeHtml(value);
}

function formatMoney(value) {
  return currencyFormatter.format(
    Number(value ?? 0),
  );
}

function localToday() {
  const now = new Date();
  const offset =
    now.getTimezoneOffset() * 60_000;

  return new Date(
    now.getTime() - offset,
  )
    .toISOString()
    .slice(0, 10);
}

function isPaid(item) {
  return Boolean(item.pagado) ||
    Number(item.saldo) <= 0.005;
}

function isOverdue(item) {
  return !isPaid(item) &&
    String(item.vencimiento) <
      localToday();
}

function detailSort(left, right) {
  const overdueDifference =
    Number(isOverdue(right)) -
    Number(isOverdue(left));

  if (overdueDifference !== 0) {
    return overdueDifference;
  }

  const paidDifference =
    Number(isPaid(left)) -
    Number(isPaid(right));

  if (paidDifference !== 0) {
    return paidDifference;
  }

  const dateDifference =
    String(left.vencimiento)
      .localeCompare(
        String(right.vencimiento),
      );

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return Number(left.obligacion_id) -
    Number(right.obligacion_id);
}

function optionList(values) {
  return [
    ...new Set(
      values.filter(Boolean),
    ),
  ]
    .sort((a, b) =>
      String(a).localeCompare(
        String(b),
        "es",
      ),
    )
    .map(
      (value) =>
        `<option value="${escapeHtml(
          value,
        )}">${escapeHtml(value)}</option>`,
    )
    .join("");
}

function obligationFilters(items) {
  const vins = items.flatMap(
    (item) =>
      String(item.vin ?? "")
        .split(",")
        .map((vin) => vin.trim())
        .filter(Boolean),
  );

  const concessionaires = items
    .filter(
      (item) => item.entity === "CON",
    )
    .map((item) => item.acreedor);

  const financiers = items
    .filter(
      (item) => item.entity === "FIN",
    )
    .map((item) => item.acreedor);

  return `
    <div
      class="obligation-filters"
      aria-label="Filtros de obligaciones"
    >
      <label>
        <span>VIN</span>
        <select id="obligation-vin-filter">
          <option value="">Todos</option>
          ${optionList(vins)}
        </select>
      </label>

      <label>
        <span>Concesionario</span>
        <select id="obligation-con-filter">
          <option value="">Todos</option>
          ${optionList(concessionaires)}
        </select>
      </label>

      <label>
        <span>Financiera</span>
        <select id="obligation-fin-filter">
          <option value="">Todas</option>
          ${optionList(financiers)}
        </select>
      </label>
    </div>
  `;
}

function matchesFilters(
  item,
  filters,
) {
  const itemVins =
    String(item.vin ?? "")
      .split(",")
      .map((vin) => vin.trim());

  if (
    filters.vin &&
    !itemVins.includes(filters.vin)
  ) {
    return false;
  }

  if (
    item.entity === "CON" &&
    filters.concessionaire &&
    item.acreedor !==
      filters.concessionaire
  ) {
    return false;
  }

  if (
    item.entity === "FIN" &&
    filters.financier &&
    item.acreedor !==
      filters.financier
  ) {
    return false;
  }

  return true;
}

function groupKey(item) {
  if (item.entity === "CON") {
    const oc =
      String(item.oc_mexrac ?? "")
        .trim() || "SIN OC";

    return [
      "CON",
      item.acreedor,
      oc,
    ].join("||");
  }

  const folio =
    String(
      item.folio_financiamiento ?? "",
    ).trim() || "SIN FOLIO";

  return [
    "FIN",
    item.acreedor,
    folio,
  ].join("||");
}

function buildGroups(items) {
  const groups = new Map();

  items.forEach((item) => {
    const key = groupKey(item);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        entity: item.entity,
        acreedor: item.acreedor,
        reference:
          item.entity === "CON"
            ? (
                String(
                  item.oc_mexrac ?? "",
                ).trim() || "SIN OC"
              )
            : (
                String(
                  item
                    .folio_financiamiento ??
                    "",
                ).trim() ||
                "SIN FOLIO"
              ),
        overdue: 0,
        upcoming: 0,
        items: [],
      });
    }

    const group = groups.get(key);
    const balance =
      Math.max(
        0,
        Number(item.saldo ?? 0),
      );

    if (isOverdue(item)) {
      group.overdue += balance;
    } else if (!isPaid(item)) {
      group.upcoming += balance;
    }

    group.items.push(item);
  });

  return [...groups.values()]
    .sort((left, right) => {
      const creditorDifference =
        String(left.acreedor)
          .localeCompare(
            String(right.acreedor),
            "es",
          );

      if (creditorDifference !== 0) {
        return creditorDifference;
      }

      return String(left.reference)
        .localeCompare(
          String(right.reference),
          "es",
        );
    });
}

function summaryRows(groups) {
  if (groups.length === 0) {
    return `
      <tr>
        <td colspan="5">
          No hay registros con estos filtros.
        </td>
      </tr>
    `;
  }

  return groups
    .map(
      (group) => `
        <tr
          class="obligation-summary-row"
          data-obligation-group="${escapeHtml(
            group.key,
          )}"
          tabindex="0"
          title="Ver documentos"
        >
          <td>
            <strong>
              ${escapeHtml(
                group.acreedor,
              )}
            </strong>
          </td>

          <td>
            ${escapeHtml(
              group.reference,
            )}
          </td>

          <td class="number-cell overdue-money">
            ${formatMoney(
              group.overdue,
            )}
          </td>

          <td class="number-cell">
            ${formatMoney(
              group.upcoming,
            )}
          </td>

          <td class="number-cell">
            <strong>
              ${formatMoney(
                group.overdue +
                  group.upcoming,
              )}
            </strong>
          </td>
        </tr>
      `,
    )
    .join("");
}

function summaryPanel(
  title,
  referenceTitle,
  groups,
  tableId,
  filename,
) {
  return `
    <article
      class="report-panel obligation-summary-panel"
    >
      <header>
        <h2>${escapeHtml(title)}</h2>
        <button
          type="button"
          data-export-table="#${tableId}"
          data-export-filename="${filename}"
        >
          EXPORTAR A EXCEL
        </button>
      </header>

      <div class="table-frame">
        <table id="${tableId}">
          <thead>
            <tr>
              <th>Acreedor</th>
              <th>${escapeHtml(
                referenceTitle,
              )}</th>
              <th class="number-cell">
                Vencido
              </th>
              <th class="number-cell">
                Por vencer
              </th>
              <th class="number-cell">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            ${summaryRows(groups)}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function statusLabel(item) {
  if (isPaid(item)) {
    return {
      text: "PAGADO",
      className: "long-term",
    };
  }

  if (isOverdue(item)) {
    return {
      text: "VENCIDO",
      className: "overdue",
    };
  }

  return {
    text: "POR VENCER",
    className: "short-term",
  };
}

function unitReferences(item) {
  const units =
    Array.isArray(item.unidades) &&
    item.unidades.length > 0
      ? item.unidades
      : [
          {
            vin: item.vin,
            marca: item.marca,
            version: item.version,
          },
        ].filter((unit) => unit.vin);

  if (units.length === 0) {
    return `<span>—</span>`;
  }

  return `
    <div class="obligation-unit-list">
      ${units
        .map((unit) => {
          const description = [
            unit.marca,
            unit.version,
          ]
            .filter(Boolean)
            .join(" ");

          return `
            <div class="obligation-unit-ref">
              <strong>
                ${escapeHtml(unit.vin)}
              </strong>
              <span>
                ${description
                  ? escapeHtml(description)
                  : "—"}
              </span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function detailRows(items) {
  return [...items]
    .sort(detailSort)
    .map((item) => {
      const status =
        statusLabel(item);

      return `
        <tr>
          <td>
            ${escapeHtml(
              item.vencimiento,
            )}
          </td>

          <td>
            ${unitReferences(item)}
          </td>

          <td class="number-cell">
            ${formatMoney(
              item.monto_original,
            )}
          </td>

          <td class="number-cell">
            ${formatMoney(
              item.financiado,
            )}
          </td>

          <td class="number-cell">
            ${formatMoney(
              item.abonado,
            )}
          </td>

          <td class="number-cell">
            <strong>
              ${formatMoney(
                item.saldo,
              )}
            </strong>
          </td>

          <td>
            <span
              class="status-badge ${status.className}"
            >
              ${status.text}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function showGroupDetail(group) {
  const overlay =
    document.createElement("div");

  overlay.className =
    "sam-modal-overlay";

  const referenceLabel =
    group.entity === "CON"
      ? "OC MexRAC"
      : "Folio";

  overlay.innerHTML = `
    <section
      class="sam-modal obligation-group-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="obligation-group-title"
    >
      <header class="obligation-group-header">
        <div>
          <h2 id="obligation-group-title">
            ${escapeHtml(
              group.acreedor,
            )}
          </h2>
          <p>
            ${referenceLabel}:
            <strong>
              ${escapeHtml(
                group.reference,
              )}
            </strong>
          </p>
        </div>

        <div class="obligation-group-totals">
          <span>
            Vencido
            <strong>
              ${formatMoney(
                group.overdue,
              )}
            </strong>
          </span>
          <span>
            Por vencer
            <strong>
              ${formatMoney(
                group.upcoming,
              )}
            </strong>
          </span>
        </div>
      </header>

      <div class="table-frame obligation-detail-frame">
        <table>
          <thead>
            <tr>
              <th>Vencimiento</th>
              <th>Unidades</th>
              <th class="number-cell">
                Monto original
              </th>
              <th class="number-cell">
                Refinanciado
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
            ${detailRows(
              group.items,
            )}
          </tbody>
        </table>
      </div>

      <footer class="corporate-modal-footer">
        <button
          type="button"
          data-close-obligation-group
        >
          Cerrar
        </button>
      </footer>
    </section>
  `;

  const close = () => {
    document.removeEventListener(
      "keydown",
      onKeydown,
    );
    overlay.remove();
  };

  const onKeydown = (event) => {
    if (event.key === "Escape") {
      close();
    }
  };

  overlay.addEventListener(
    "click",
    (event) => {
      if (
        event.target === overlay ||
        event.target.closest(
          "[data-close-obligation-group]",
        )
      ) {
        close();
      }
    },
  );

  document.body.append(overlay);

  document.addEventListener(
    "keydown",
    onKeydown,
  );

  overlay
    .querySelector(
      "[data-close-obligation-group]",
    )
    ?.focus();
}

function connectSummaryRows(groups) {
  const byKey = new Map(
    groups.map(
      (group) => [
        group.key,
        group,
      ],
    ),
  );

  document
    .querySelectorAll(
      "[data-obligation-group]",
    )
    .forEach((row) => {
      const open = () => {
        const group =
          byKey.get(
            row.dataset
              .obligationGroup,
          );

        if (group) {
          showGroupDetail(group);
        }
      };

      row.addEventListener(
        "click",
        open,
      );

      row.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            open();
          }
        },
      );
    });
}

export async function renderObligations() {
  const content =
    document.getElementById(
      "module-content",
    );

  content.innerHTML = `
    <div class="report-loading">
      Reconstruyendo obligaciones…
    </div>
  `;

  try {
    const obligations =
      await loadObligations();

    const outstandingBalance =
      obligations.reduce(
        (total, item) =>
          total +
          Math.max(
            0,
            Number(
              item.saldo ?? 0,
            ),
          ),
        0,
      );

    content.innerHTML = `
      <section
        class="reports-view obligations-view"
        aria-label="Obligaciones"
      >
        <div class="summary-cards">
          <article
            class="summary-card total"
          >
            <span>
              Saldo pendiente
            </span>

            <strong>
              ${formatMoney(
                outstandingBalance,
              )}
            </strong>
          </article>
        </div>

        ${obligationFilters(
          obligations,
        )}

        <div
          id="obligation-results"
          class="obligation-columns"
        ></div>
      </section>
    `;

    const renderResults = () => {
      const filters = {
        vin:
          document.getElementById(
            "obligation-vin-filter",
          ).value,

        concessionaire:
          document.getElementById(
            "obligation-con-filter",
          ).value,

        financier:
          document.getElementById(
            "obligation-fin-filter",
          ).value,
      };

      const filtered =
        obligations.filter(
          (item) =>
            matchesFilters(
              item,
              filters,
            ),
        );

      const concessionaireGroups =
        buildGroups(
          filtered.filter(
            (item) =>
              item.entity === "CON",
          ),
        );

      const financingGroups =
        buildGroups(
          filtered.filter(
            (item) =>
              item.entity === "FIN",
          ),
        );

      document
        .getElementById(
          "obligation-results",
        )
        .innerHTML = `
          ${summaryPanel(
            "Concesionarios",
            "OC MexRAC",
            concessionaireGroups,
            "obligation-concessionaire-table",
            "obligaciones-concesionarios",
          )}

          ${summaryPanel(
            "Financiamientos",
            "Folio",
            financingGroups,
            "obligation-financing-table",
            "obligaciones-financiamientos",
          )}
        `;

      const allGroups = [
        ...concessionaireGroups,
        ...financingGroups,
      ];

      connectSummaryRows(
        allGroups,
      );

      bindTableExportButtons(
        content,
      );
    };

    document
      .querySelectorAll(
        ".obligation-filters select",
      )
      .forEach((select) =>
        select.addEventListener(
          "change",
          renderResults,
        ),
      );

    renderResults();
  } catch (error) {
    console.error(
      "Obligation loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar las obligaciones.
      </div>
    `;
  }
}
