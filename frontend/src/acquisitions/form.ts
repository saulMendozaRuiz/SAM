import { confirmAcquisition } from "../api.ts";
import type { AcquisitionInput } from "../domain/types.ts";
import { acquisitionGridRow } from "./template.ts";
import { centsToMoney, formatMoney, moneyToCents, totalAcquisition } from "./validation.ts";
import { showConfirmationDialog } from "./modal.ts";
import { openModule } from "../navigation.ts";
import { acquisitionRowsFromCsv } from "./csv.ts";
import { excelRange, pastedCell } from "./paste.ts";
import { messageDialog } from "../ui/message.ts";

type FormOptions = { renderAcquisitions: (message?: string) => Promise<void> };
type RowValues = Record<string, string>;
const fields = ["vin", "engine", "year", "brand", "version", "invoice", "subtotal", "vat", "total", "delivery", "dueDate", "comments"] as const;
const moneyFields = new Set(["subtotal", "vat", "total"]);

function acquisitionMoneyToCents(value: string): number | null {
  return moneyToCents(value.replace(/[$,\s]/g, ""));
}

function maskMoney(element: HTMLInputElement): void {
  if (!element.value.trim()) return;
  const cents = acquisitionMoneyToCents(element.value);
  if (cents !== null) element.value = formatMoney(cents / 100);
}

function unmaskMoney(element: HTMLInputElement): void {
  const cents = acquisitionMoneyToCents(element.value);
  if (cents !== null) element.value = centsToMoney(cents);
}

function payloadMoney(value: string): string {
  const cents = acquisitionMoneyToCents(value);
  return cents === null ? value.trim() : centsToMoney(cents);
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento #${id}`);
  return element as T;
}

function rows(body: HTMLTableSectionElement): HTMLTableRowElement[] {
  return Array.from(body.querySelectorAll<HTMLTableRowElement>(".acquisition-grid-row"));
}

function input(row: HTMLTableRowElement, name: string): HTMLInputElement {
  const element = row.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
  if (!element) throw new Error(`Falta el campo ${name}`);
  return element;
}

function values(row: HTMLTableRowElement): RowValues {
  return Object.fromEntries(fields.map((name) => [name, input(row, name).value]));
}

function normalize(value: string): string { return value.trim().toUpperCase(); }

function setMessage(element: HTMLElement, text = "", type = ""): void {
  element.textContent = text;
  element.className = `payment-message ${type}`.trim();
}

async function notifyDataChange(operation: string): Promise<void> {
  const detail: { operation: string; refreshPromise: Promise<unknown> | null } = { operation, refreshPromise: null };
  window.dispatchEvent(new CustomEvent("sam:data-changed", { detail }));
  await detail.refreshPromise;
}

export function initializeAcquisitionForm({ renderAcquisitions }: FormOptions): void {
  const form = requiredElement<HTMLFormElement>("acquisition-form");
  const body = requiredElement<HTMLTableSectionElement>("acquisition-grid-body");
  const concessionaire = requiredElement<HTMLSelectElement>("acquisition-global-concessionaire");
  const oc = requiredElement<HTMLInputElement>("acquisition-global-oc");
  const status = requiredElement<HTMLElement>("acquisition-message");
  const submit = requiredElement<HTMLButtonElement>("acquisition-submit");
  const count = requiredElement<HTMLElement>("acquisition-row-count");
  const rowCountInput = requiredElement<HTMLInputElement>("acquisition-row-count-input");
  const total = requiredElement<HTMLElement>("acquisition-total-summary");

  const updateSummary = (): void => {
    const current = rows(body);
    count.textContent = `${current.length} ${current.length === 1 ? "unidad" : "unidades"}`;
    rowCountInput.value = String(current.length);
    const cents = current.reduce((sum, row) => sum + (acquisitionMoneyToCents(input(row, "total").value) ?? 0), 0);
    total.textContent = formatMoney(cents / 100);
  };

  const renumber = (): void => {
    rows(body).forEach((row, index) => {
      row.dataset.rowIndex = String(index);
      const number = row.querySelector<HTMLElement>(".grid-row-number");
      if (number) number.textContent = String(index + 1);
    });
    updateSummary();
  };

  const maskAllMoney = (): void => {
    body.querySelectorAll<HTMLInputElement>(".money-input").forEach(maskMoney);
    updateSummary();
  };

  const addRow = (initial: RowValues = {}): void => {
    body.insertAdjacentHTML("beforeend", acquisitionGridRow(rows(body).length, initial));
    renumber();
    rows(body).at(-1)?.querySelector<HTMLInputElement>("[data-field=vin]")?.focus();
  };

  body.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    const row = button?.closest<HTMLTableRowElement>(".acquisition-grid-row");
    if (!button || !row) return;
    if (button.classList.contains("acquisition-duplicate-row")) addRow({ ...values(row), vin: "", engine: "" });
    if (button.classList.contains("acquisition-remove-row")) {
      if (rows(body).length === 1) return setMessage(status, "Debe existir al menos una unidad.", "error");
      row.remove();
      renumber();
    }
  });

  body.addEventListener("input", (event) => {
    const changed = event.target as HTMLInputElement;
    const row = changed.closest<HTMLTableRowElement>(".acquisition-grid-row");
    if (row && (changed.dataset.field === "subtotal" || changed.dataset.field === "vat")) {
      const subtotal = acquisitionMoneyToCents(input(row, "subtotal").value);
      const vat = acquisitionMoneyToCents(input(row, "vat").value);
      if (subtotal !== null && vat !== null) input(row, "total").value = formatMoney((subtotal + vat) / 100);
    }
    changed.classList.remove("grid-invalid");
    updateSummary();
  });

  body.addEventListener("focusin", (event) => {
    const changed = event.target as HTMLInputElement;
    if (moneyFields.has(changed.dataset.field ?? "")) unmaskMoney(changed);
  });

  body.addEventListener("focusout", (event) => {
    const changed = event.target as HTMLInputElement;
    if (moneyFields.has(changed.dataset.field ?? "")) maskMoney(changed);
    updateSummary();
  });

  body.addEventListener("paste", (event) => {
    const target = (event.target as Element).closest<HTMLInputElement>("[data-field]");
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!target || (!text.includes("\t") && !/[\r\n]/.test(text))) return;
    event.preventDefault();

    const currentRows = rows(body);
    const startRow = currentRows.indexOf(target.closest<HTMLTableRowElement>("tr")!);
    const startColumn = fields.indexOf(target.dataset.field as typeof fields[number]);
    const matrix = excelRange(text);
    while (rows(body).length < startRow + matrix.length) {
      body.insertAdjacentHTML("beforeend", acquisitionGridRow(rows(body).length));
    }
    const destinationRows = rows(body);
    matrix.forEach((sourceRow, rowOffset) => sourceRow.forEach((value, columnOffset) => {
      const field = fields[startColumn + columnOffset];
      if (field) input(destinationRows[startRow + rowOffset], field).value = pastedCell(field, value);
    }));
    renumber();
    maskAllMoney();
    setMessage(status, `${matrix.length} filas pegadas desde Excel para revisión.`, "success");
  });

  requiredElement<HTMLButtonElement>("acquisition-add-row").addEventListener("click", () => addRow());
  requiredElement<HTMLButtonElement>("acquisition-apply-row-count").addEventListener("click", () => {
    const requested = Number(rowCountInput.value);
    if (!Number.isInteger(requested) || requested < 1 || requested > 1000) {
      rowCountInput.focus();
      return setMessage(status, "Renglones debe ser un entero entre 1 y 1000.", "error");
    }

    const current = rows(body);
    if (requested < current.length) {
      current.slice(requested).forEach((row) => row.remove());
    } else if (requested > current.length) {
      body.insertAdjacentHTML(
        "beforeend",
        Array.from(
          { length: requested - current.length },
          (_, offset) => acquisitionGridRow(current.length + offset),
        ).join(""),
      );
    }
    renumber();
    setMessage(status, `${requested} renglones listos para captura.`, "success");
  });
  requiredElement<HTMLAnchorElement>("acquisition-template").addEventListener("click", () => {
    void messageDialog(
      "La plantilla CSV se descargó. Ábrela en Excel, llena una fila por unidad y después usa Importar CSV.",
      "Plantilla descargada",
    );
  });
  requiredElement<HTMLInputElement>("acquisition-csv").addEventListener("change", async (event) => {
    const picker = event.currentTarget as HTMLInputElement;
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const imported = acquisitionRowsFromCsv(await file.text());
      body.innerHTML = imported.map((row, index) => acquisitionGridRow(index, row)).join("");
      renumber();
      maskAllMoney();
      setMessage(status, `${imported.length} unidades cargadas para revisión.`, "success");
    } catch (error) {
      setMessage(status, error instanceof Error ? error.message : String(error), "error");
    } finally {
      picker.value = "";
    }
  });
  requiredElement<HTMLButtonElement>("acquisition-back").addEventListener("click", () => {
    void openModule("Unidades");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idCon = Number(concessionaire.value);
    const units: AcquisitionInput[] = rows(body).map((row) => ({
      idCon, vin: normalize(input(row, "vin").value), noMotor: normalize(input(row, "engine").value),
      modeloAnio: Number(input(row, "year").value), marca: normalize(input(row, "brand").value),
      version: normalize(input(row, "version").value), ocMexrac: oc.value.trim(),
      folioFactura: input(row, "invoice").value.trim(), subtotal: payloadMoney(input(row, "subtotal").value),
      iva: payloadMoney(input(row, "vat").value), total: payloadMoney(input(row, "total").value),
      entregaPatio: input(row, "delivery").value, vencimiento: input(row, "dueDate").value,
      comentarios: input(row, "comments").value.trim(),
    }));
    const cents = totalAcquisition(units);
    if (!await showConfirmationDialog({ units: units.length, total: cents / 100 })) return;

    submit.disabled = true;
    setMessage(status, "Registrando adquisición…");
    try {
      const result = await confirmAcquisition(units);
      await notifyDataChange("acquisition");
      await renderAcquisitions(`Adquisición confirmada: ${result.unidades_guardadas} unidades por ${formatMoney(cents / 100)}.`);
    } catch {
      setMessage(status);
      submit.disabled = false;
    }
  });

  updateSummary();
}
