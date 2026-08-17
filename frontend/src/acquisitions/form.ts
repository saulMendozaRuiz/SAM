// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
import {
  confirmAcquisition,
} from "../api.ts";

import {
  acquisitionGridFields,
  acquisitionGridRow,
} from "./template.ts";

import {
  centsToMoney,
  formatMoney,
  moneyToCents,
  totalAcquisition,
  validateUnits,
} from "./validation.ts";

import {
  showConfirmationDialog,
} from "./modal.ts";

function setMessage(
  element,
  text,
  type = "",
) {
  element.textContent = text;
  element.className =
    `payment-message ${type}`.trim();
}

function gridBody() {
  return document.getElementById(
    "acquisition-grid-body",
  );
}

function rows() {
  return Array.from(
    gridBody().querySelectorAll(
      ".acquisition-grid-row",
    ),
  );
}

function field(
  row,
  fieldName,
) {
  return row.querySelector(
    `[data-field="${fieldName}"]`,
  );
}

function allCells() {
  return Array.from(
    gridBody().querySelectorAll(
      ".acquisition-grid-cell",
    ),
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function rowValues(row) {
  return {
    vin: field(row, "vin").value,
    engine: field(row, "engine").value,
    year: field(row, "year").value,
    brand: field(row, "brand").value,
    version: field(row, "version").value,
    invoice: field(row, "invoice").value,
    subtotal: field(row, "subtotal").value,
    vat: field(row, "vat").value,
    total: field(row, "total").value,
    delivery: field(row, "delivery").value,
    dueDate: field(row, "dueDate").value,
    comments: field(row, "comments").value,
  };
}

function duplicateValues(row) {
  const values = rowValues(row);

  /*
   * VIN y motor son identificadores únicos:
   * al duplicar una fila se limpian deliberadamente.
   */
  values.vin = "";
  values.engine = "";

  return values;
}

function renumberRows() {
  rows().forEach(
    (row, index) => {
      row.dataset.rowIndex =
        String(index);

      row.querySelector(
        ".grid-row-number",
      ).textContent =
        String(index + 1);
    },
  );

  updateSummary();
}

function appendRow(
  concessionaires,
  values = {},
  focusField = "vin",
) {
  const body = gridBody();
  const index = rows().length;

  body.insertAdjacentHTML(
    "beforeend",
    acquisitionGridRow(
      index,
      concessionaires,
      values,
    ),
  );

  const row =
    body.lastElementChild;

  initializeRow(
    row,
    concessionaires,
  );

  renumberRows();

  if (focusField) {
    field(
      row,
      focusField,
    )?.focus();
  }

  return row;
}

function removeRow(row) {
  const currentRows = rows();
  const message =
    document.getElementById(
      "acquisition-message",
    );

  if (currentRows.length === 1) {
    setMessage(
      message,
      "La adquisición debe contener al menos una fila.",
      "error",
    );

    return;
  }

  const index =
    currentRows.indexOf(row);

  row.remove();
  renumberRows();

  const remaining = rows();
  const target =
    remaining[
      Math.min(
        index,
        remaining.length - 1,
      )
    ];

  field(target, "vin")?.focus();
  setMessage(message, "");
}

function calculateRowTotal(row) {
  const subtotalInput =
    field(row, "subtotal");

  const vatInput =
    field(row, "vat");

  const totalInput =
    field(row, "total");

  const subtotal =
    moneyToCents(
      subtotalInput.value,
    );

  const vat =
    moneyToCents(
      vatInput.value,
    );

  if (
    subtotal === null ||
    vat === null
  ) {
    return;
  }

  totalInput.value =
    centsToMoney(
      subtotal + vat,
    );

  updateSummary();
}

function initializeRow(
  row,
  concessionaires,
) {
  field(
    row,
    "subtotal",
  ).addEventListener(
    "input",
    () => calculateRowTotal(row),
  );

  field(
    row,
    "vat",
  ).addEventListener(
    "input",
    () => calculateRowTotal(row),
  );

  row
    .querySelector(
      ".acquisition-duplicate-row",
    )
    .addEventListener(
      "click",
      () => {
        const newRow =
          appendRow(
            concessionaires,
            duplicateValues(row),
            "vin",
          );

        /*
         * La copia se agrega abajo del grid.
         * Mantener esta mecánica simple evita reordenar
         * índices mientras se captura un rango pegado.
         */
        newRow.scrollIntoView({
          block: "nearest",
        });
      },
    );

  row
    .querySelector(
      ".acquisition-remove-row",
    )
    .addEventListener(
      "click",
      () => removeRow(row),
    );

  row
    .querySelectorAll(
      ".acquisition-grid-cell",
    )
    .forEach((cell) => {
      cell.addEventListener(
        "input",
        () => {
          cell.classList.remove(
            "grid-invalid",
          );
          updateSummary();
        },
      );

      cell.addEventListener(
        "change",
        () => {
          cell.classList.remove(
            "grid-invalid",
          );
          updateSummary();
        },
      );
    });
}

function collectUnits() {
  const globalConcessionaire =
    Number(
      document.getElementById(
        "acquisition-global-concessionaire",
      ).value,
    );

  const globalOc =
    document.getElementById(
      "acquisition-global-oc",
    ).value.trim();

  return rows().map(
    (row) => ({
      idCon: globalConcessionaire,

      vin: normalizeText(
        field(
          row,
          "vin",
        ).value,
      ),

      noMotor: normalizeText(
        field(
          row,
          "engine",
        ).value,
      ),

      modeloAnio: Number(
        field(
          row,
          "year",
        ).value,
      ),

      marca: normalizeText(
        field(
          row,
          "brand",
        ).value,
      ),

      version: normalizeText(
        field(
          row,
          "version",
        ).value,
      ),

      ocMexrac: globalOc,

      folioFactura:
        field(
          row,
          "invoice",
        ).value.trim(),

      subtotal:
        field(
          row,
          "subtotal",
        ).value.trim(),

      iva:
        field(
          row,
          "vat",
        ).value.trim(),

      total:
        field(
          row,
          "total",
        ).value.trim(),

      entregaPatio:
        field(
          row,
          "delivery",
        ).value,

      vencimiento:
        field(
          row,
          "dueDate",
        ).value,

      comentarios:
        field(
          row,
          "comments",
        ).value.trim(),
    }),
  );
}

function updateSummary() {
  const unitRows = rows();

  const count =
    document.getElementById(
      "acquisition-row-count",
    );

  const total =
    document.getElementById(
      "acquisition-total-summary",
    );

  if (count) {
    count.textContent =
      `${unitRows.length} ` +
      `${
        unitRows.length === 1
          ? "unidad"
          : "unidades"
      }`;
  }

  if (total) {
    const cents =
      unitRows.reduce(
        (sum, row) =>
          sum +
          (
            moneyToCents(
              field(
                row,
                "total",
              ).value,
            ) ?? 0
          ),
        0,
      );

    total.textContent =
      formatMoney(
        cents / 100,
      );
  }
}

function clearGridValidation() {
  allCells().forEach(
    (cell) => {
      cell.classList.remove(
        "grid-invalid",
      );

      cell.removeAttribute(
        "title",
      );
    },
  );
}

function markInvalid(
  cell,
  message,
) {
  if (!cell) return;

  cell.classList.add(
    "grid-invalid",
  );

  cell.title = message;
}

function visualGridValidation() {
  clearGridValidation();

  const unitRows = rows();
  const vins = new Map();
  const motors = new Map();
  let firstInvalid = null;

  const globalConcessionaire =
    document.getElementById(
      "acquisition-global-concessionaire",
    );

  if (!globalConcessionaire.value) {
    globalConcessionaire.classList.add(
      "grid-invalid",
    );

    firstInvalid ??=
      globalConcessionaire;
  } else {
    globalConcessionaire.classList.remove(
      "grid-invalid",
    );
  }

  const required = [
    ["vin", "VIN requerido"],
    ["year", "Modelo/año requerido"],
    ["brand", "Marca requerida"],
    ["version", "Versión requerida"],
    ["subtotal", "Subtotal requerido"],
    ["vat", "IVA requerido"],
    ["total", "Total requerido"],
    ["dueDate", "Vencimiento requerido"],
  ];

  unitRows.forEach(
    (row) => {
      required.forEach(
        ([name, message]) => {
          const cell =
            field(row, name);

          if (
            !String(
              cell.value ?? "",
            ).trim()
          ) {
            markInvalid(
              cell,
              message,
            );

            firstInvalid ??=
              cell;
          }
        },
      );

      const vin =
        normalizeText(
          field(
            row,
            "vin",
          ).value,
        );

      if (vin) {
        if (!vins.has(vin)) {
          vins.set(vin, []);
        }

        vins.get(vin).push(
          field(row, "vin"),
        );
      }

      const motor =
        normalizeText(
          field(
            row,
            "engine",
          ).value,
        );

      if (motor) {
        if (!motors.has(motor)) {
          motors.set(
            motor,
            [],
          );
        }

        motors.get(motor).push(
          field(row, "engine"),
        );
      }

      const subtotal =
        moneyToCents(
          field(
            row,
            "subtotal",
          ).value,
        );

      const vat =
        moneyToCents(
          field(
            row,
            "vat",
          ).value,
        );

      const total =
        moneyToCents(
          field(
            row,
            "total",
          ).value,
        );

      if (
        subtotal !== null &&
        vat !== null &&
        total !== null &&
        subtotal + vat !== total
      ) {
        const totalCell =
          field(
            row,
            "total",
          );

        markInvalid(
          totalCell,
          "Subtotal + IVA no coincide con Total",
        );

        firstInvalid ??=
          totalCell;
      }
    },
  );

  [
    [vins, "VIN repetido"],
    [motors, "Número de motor repetido"],
  ].forEach(
    ([map, message]) => {
      map.forEach(
        (cells) => {
          if (
            cells.length > 1
          ) {
            cells.forEach(
              (cell) =>
                markInvalid(
                  cell,
                  message,
                ),
            );

            firstInvalid ??=
              cells[0];
          }
        },
      );
    },
  );

  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });

    return false;
  }

  return true;
}

function currentGridPosition(cell) {
  const row =
    cell.closest(
      ".acquisition-grid-row",
    );

  return {
    row:
      rows().indexOf(row),

    column:
      acquisitionGridFields
        .indexOf(
          cell.dataset.field,
        ),
  };
}

function focusGridCell(
  rowIndex,
  columnIndex,
) {
  const unitRows = rows();

  if (
    rowIndex < 0 ||
    rowIndex >=
      unitRows.length
  ) {
    return false;
  }

  const fieldName =
    acquisitionGridFields[
      columnIndex
    ];

  if (!fieldName) {
    return false;
  }

  const target =
    field(
      unitRows[rowIndex],
      fieldName,
    );

  if (!target) {
    return false;
  }

  target.focus();
  target.select?.();

  return true;
}

function handleGridKeydown(
  event,
  concessionaires,
) {
  const cell =
    event.target.closest(
      ".acquisition-grid-cell",
    );

  if (!cell) return;

  const {
    row,
    column,
  } =
    currentGridPosition(cell);

  if (event.key === "Enter") {
    event.preventDefault();

    focusGridCell(
      row + 1,
      column,
    );

    return;
  }

  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown"
  ) {
    event.preventDefault();

    focusGridCell(
      row +
        (
          event.key ===
          "ArrowUp"
            ? -1
            : 1
        ),
      column,
    );

    return;
  }

  /*
   * Izquierda/derecha sólo cambian celda cuando
   * no estamos editando una posición intermedia de texto.
   */
  if (
    event.key === "ArrowLeft" &&
    cell.selectionStart === 0 &&
    cell.selectionEnd === 0
  ) {
    if (
      focusGridCell(
        row,
        column - 1,
      )
    ) {
      event.preventDefault();
    }
  }

  if (
    event.key === "ArrowRight" &&
    typeof cell.value === "string" &&
    cell.selectionStart ===
      cell.value.length &&
    cell.selectionEnd ===
      cell.value.length
  ) {
    if (
      focusGridCell(
        row,
        column + 1,
      )
    ) {
      event.preventDefault();
    }
  }
}

function pasteValueIntoCell(
  cell,
  value,
) {
  if (!cell) return;

  cell.value =
    String(value ?? "").trim();

  cell.dispatchEvent(
    new Event(
      "input",
      {
        bubbles: true,
      },
    ),
  );
}

function handleGridPaste(
  event,
  concessionaires,
) {
  const startCell =
    event.target.closest(
      ".acquisition-grid-cell",
    );

  if (!startCell) return;

  const clipboard =
    event.clipboardData
      ?.getData("text");

  if (
    !clipboard ||
    (
      !clipboard.includes("\t") &&
      !clipboard.includes("\n") &&
      !clipboard.includes("\r")
    )
  ) {
    return;
  }

  event.preventDefault();

  const matrix =
    clipboard
      .replace(/\r/g, "")
      .split("\n")
      .filter(
        (line, index, array) =>
          !(
            index ===
              array.length - 1 &&
            line === ""
          ),
      )
      .map(
        (line) =>
          line.split("\t"),
      );

  if (
    matrix.length === 0
  ) {
    return;
  }

  const start =
    currentGridPosition(
      startCell,
    );

  const neededRows =
    start.row +
    matrix.length;

  while (
    rows().length <
      neededRows
  ) {
    appendRow(
      concessionaires,
      {},
      null,
    );
  }

  matrix.forEach(
    (
      values,
      rowOffset,
    ) => {
      const targetRow =
        rows()[
          start.row +
          rowOffset
        ];

      values.forEach(
        (
          value,
          columnOffset,
        ) => {
          const fieldName =
            acquisitionGridFields[
              start.column +
              columnOffset
            ];

          if (!fieldName) {
            return;
          }

          pasteValueIntoCell(
            field(
              targetRow,
              fieldName,
            ),
            value,
          );
        },
      );

      calculateRowTotal(
        targetRow,
      );
    },
  );

  renumberRows();

  const rowCountInput =
    document.getElementById(
      "acquisition-row-count-input",
    );

  if (rowCountInput) {
    rowCountInput.value =
      String(rows().length);
  }

  updateSummary();
}

function setRowCount(
  concessionaires,
  desiredCount,
) {
  const numeric =
    Number(desiredCount);

  if (
    !Number.isFinite(numeric) ||
    numeric < 1
  ) {
    return;
  }

  const target =
    Math.max(
      1,
      Math.min(
        500,
        Math.trunc(numeric),
      ),
    );

  while (rows().length < target) {
    appendRow(
      concessionaires,
      {},
      null,
    );
  }

  while (rows().length > target) {
    rows().at(-1)?.remove();
  }

  renumberRows();
}

function clearGrid() {
  rows().forEach((row) => {
    acquisitionGridFields.forEach(
      (fieldName) => {
        const cell =
          field(
            row,
            fieldName,
          );

        if (!cell) {
          return;
        }

        if (
          fieldName === "subtotal" ||
          fieldName === "vat" ||
          fieldName === "total"
        ) {
          cell.value = "0.00";
        } else {
          cell.value = "";
        }

        cell.classList.remove(
          "grid-invalid",
        );

        cell.removeAttribute(
          "title",
        );
      },
    );
  });

  const globalOc =
    document.getElementById(
      "acquisition-global-oc",
    );

  if (globalOc) {
    globalOc.value = "";
  }

  setMessage(
    document.getElementById(
      "acquisition-message",
    ),
    "",
  );

  updateSummary();

  field(
    rows()[0],
    "vin",
  )?.focus();
}


async function notifyDataChange(
  operation,
) {
  const detail = {
    operation,
    refreshPromise: null,
  };

  window.dispatchEvent(
    new CustomEvent(
      "sam:data-changed",
      {
        detail,
      },
    ),
  );

  if (detail.refreshPromise) {
    try {
      await detail.refreshPromise;
    } catch (error) {
      console.error(
        "Post-commit data refresh failed:",
        error,
      );
    }
  }
}

export function initializeAcquisitionForm({
  renderAcquisitions,
  concessionaires,
}) {
  const form =
    document.getElementById(
      "acquisition-form",
    );

  const body =
    gridBody();

  const rowCountInput =
    document.getElementById(
      "acquisition-row-count-input",
    );

  const clearGridButton =
    document.getElementById(
      "acquisition-clear-grid",
    );

  const globalConcessionaire =
    document.getElementById(
      "acquisition-global-concessionaire",
    );

  const submitButton =
    document.getElementById(
      "acquisition-submit",
    );

  const message =
    document.getElementById(
      "acquisition-message",
    );

  document
    .getElementById(
      "acquisition-back",
    )
    ?.addEventListener(
      "click",
      async () => {
        const {
          renderUnits,
        } =
          await import(
            "../units.ts"
          );

        await renderUnits();
      },
    );

  globalConcessionaire.addEventListener(
    "change",
    () => {
      globalConcessionaire.classList.remove(
        "grid-invalid",
      );
    },
  );

  document
    .getElementById(
      "acquisition-global-oc",
    )
    .addEventListener(
      "input",
      (event) => {
        event.target.classList.remove(
          "grid-invalid",
        );
      },
    );

  rowCountInput.addEventListener(
    "input",
    () => {
      setRowCount(
        concessionaires,
        rowCountInput.value,
      );
    },
  );

  clearGridButton.addEventListener(
    "click",
    () => {
      clearGrid();
    },
  );

  rows().forEach(
    (row) =>
      initializeRow(
        row,
        concessionaires,
      ),
  );

  body.addEventListener(
    "keydown",
    (event) =>
      handleGridKeydown(
        event,
        concessionaires,
      ),
  );

  body.addEventListener(
    "paste",
    (event) =>
      handleGridPaste(
        event,
        concessionaires,
      ),
  );

  updateSummary();

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const units =
        collectUnits();

      const visualOk =
        visualGridValidation();

      const validation =
        validateUnits(units);

      if (
        !visualOk ||
        validation
      ) {
        setMessage(
          message,
          validation ||
            "Revisa las celdas marcadas.",
          "error",
        );

        return;
      }

      const totalCents =
        totalAcquisition(
          units,
        );

      const confirmed =
        await showConfirmationDialog({
          units: units.length,
          total:
            totalCents / 100,
        });

      if (!confirmed) {
        return;
      }

      submitButton.disabled =
        true;

      submitButton.textContent =
        "Registrando…";

      setMessage(
        message,
        "Validando y registrando la adquisición…",
      );

      try {
        const result =
          await confirmAcquisition(
            units,
          );

        await notifyDataChange(
          "acquisition",
        );

        const unitIds =
          Array.isArray(
            result?.unitids,
          )
            ? result.unitids
            : [];

        await renderAcquisitions(
          `Adquisición confirmada: ` +
          `${unitIds.length} ` +
          `${
            unitIds.length === 1
              ? "unidad"
              : "unidades"
          } por ` +
          `${formatMoney(
            totalCents / 100,
          )}.`,
        );
      } catch (error) {
        console.error(
          "Acquisition registration failed:",
          error,
        );

        setMessage(
          message,
          String(error),
          "error",
        );

        submitButton.disabled =
          false;

        submitButton.textContent =
          "Confirmar adquisición";
      }
    },
  );
}
