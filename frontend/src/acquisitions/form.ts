import { confirmAcquisition } from "../api.ts";
import type { AcquisitionInput } from "../domain/types.ts";
import { acquisitionGridRow } from "./template.ts";
import { formatMoney, moneyToCents, totalAcquisition } from "./validation.ts";
import { showConfirmationDialog } from "./modal.ts";
import { openModule } from "../navigation.ts";

type FormOptions = { renderAcquisitions: (message?: string) => Promise<void> };
type RowValues = Record<string, string>;
const fields = ["vin", "engine", "year", "brand", "version", "invoice", "subtotal", "vat", "total", "delivery", "dueDate", "comments"] as const;

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
  const total = requiredElement<HTMLElement>("acquisition-total-summary");

  const updateSummary = (): void => {
    const current = rows(body);
    count.textContent = `${current.length} ${current.length === 1 ? "unidad" : "unidades"}`;
    const cents = current.reduce((sum, row) => sum + (moneyToCents(input(row, "total").value) ?? 0), 0);
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
      const subtotal = moneyToCents(input(row, "subtotal").value);
      const vat = moneyToCents(input(row, "vat").value);
      if (subtotal !== null && vat !== null) input(row, "total").value = ((subtotal + vat) / 100).toFixed(2);
    }
    changed.classList.remove("grid-invalid");
    updateSummary();
  });

  requiredElement<HTMLButtonElement>("acquisition-add-row").addEventListener("click", () => addRow());
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
      folioFactura: input(row, "invoice").value.trim(), subtotal: input(row, "subtotal").value.trim(),
      iva: input(row, "vat").value.trim(), total: input(row, "total").value.trim(),
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
