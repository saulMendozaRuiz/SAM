import { loadObligations, registerPayment } from "./api.ts";
import { escapeHtml, formatMoney, localIsoDate } from "./ui/format.ts";
import { centsToMoney, tryParseMoney } from "./ui/money.ts";

type OpenDebt = { obligacion_id: number; entity: string; acreedor: string; vencimiento: string; saldo: number; activo?: boolean };
type Application = { obligacionId: number; monto: string };

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta #${id}`);
  return element as T;
};

function debtRows(items: OpenDebt[]): string {
  return items.map((item) => `<tr>
    <td><input class="payment-selection" type="checkbox" data-id="${item.obligacion_id}" aria-label="Seleccionar obligación ${item.obligacion_id}"></td>
    <td>${item.obligacion_id}</td><td><span class="entity-badge ${item.entity.toLowerCase()}">${escapeHtml(item.entity)}</span></td>
    <td><strong>${escapeHtml(item.acreedor)}</strong></td><td>${escapeHtml(item.vencimiento)}</td><td class="number-cell">${formatMoney(item.saldo)}</td>
    <td><input id="payment-amount-${item.obligacion_id}" class="payment-amount money-input" type="number" min="0.01" max="${Number(item.saldo).toFixed(2)}" step="0.01" data-id="${item.obligacion_id}" disabled></td>
  </tr>`).join("");
}

function setMessage(text = "", type = ""): void {
  const element = required<HTMLElement>("payment-message");
  element.textContent = text;
  element.className = `payment-message ${type}`.trim();
}

function applications(): Application[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(".payment-selection:checked")).map((box) => ({
    obligacionId: Number(box.dataset.id),
    monto: required<HTMLInputElement>(`payment-amount-${box.dataset.id}`).value.trim(),
  }));
}

function appliedTotal(): number {
  return applications().reduce((sum, item) => sum + (tryParseMoney(item.monto) ?? 0), 0);
}

function updateTotal(): void {
  required<HTMLElement>("payment-applied-total").textContent = formatMoney(appliedTotal() / 100);
}

function validate(declared: string, items: Application[]): string {
  const total = tryParseMoney(declared);
  if (total === null || total <= 0) return "Captura un monto de abono válido.";
  if (!items.length) return "Selecciona al menos una obligación.";
  if (items.some((item) => (tryParseMoney(item.monto) ?? 0) <= 0)) return "Todos los montos aplicados deben ser positivos.";
  if (appliedTotal() !== total) return `El abono es ${formatMoney(total / 100)}, pero las aplicaciones suman ${formatMoney(appliedTotal() / 100)}.`;
  return "";
}

export async function renderPayments(successMessage = ""): Promise<void> {
  const content = required<HTMLElement>("module-content");
  content.innerHTML = `<div class="report-loading">Cargando saldos…</div>`;
  try {
    const debts = (await loadObligations() as OpenDebt[]).filter((item) => item.activo !== false && Number(item.saldo) > 0);
    content.innerHTML = `<section class="reports-view payments-view" aria-label="Registrar abono">
      ${successMessage ? `<div class="payment-message success">${escapeHtml(successMessage)}</div>` : ""}
      <form id="payment-form" class="payment-form">
        <article class="report-panel"><header><h2>Datos del abono</h2><span>Operación transaccional</span></header>
          <div class="payment-fields"><label>Fecha<input id="payment-date" type="date" value="${localIsoDate()}" required></label>
          <label>Monto total<input id="payment-total" type="number" min="0.01" step="0.01" required></label>
          <label>Referencia<input id="payment-reference" type="text" autocomplete="off"></label>
          <label class="payment-comments">Comentarios<input id="payment-comments" type="text" autocomplete="off"></label></div>
        </article>
        <article class="report-panel due-panel"><header><h2>Aplicaciones</h2><span>${debts.length} documentos con saldo</span></header>
          <div class="table-frame"><table><thead><tr><th></th><th>ID</th><th>Tipo</th><th>Acreedor</th><th>Vencimiento</th><th class="number-cell">Saldo</th><th>Aplicar</th></tr></thead>
          <tbody>${debtRows(debts)}</tbody></table></div>
        </article>
        <div class="payment-application-total"><span>Total aplicado</span><strong id="payment-applied-total">$0.00</strong></div>
        <div id="payment-message" class="payment-message" role="status"></div>
        <div class="payment-actions"><button id="payment-submit" type="submit">Registrar abono</button></div>
      </form></section>`;

    document.querySelectorAll<HTMLInputElement>(".payment-amount").forEach((input) => {
      input.addEventListener("input", updateTotal);
    });
    content.addEventListener("change", (event) => {
      const box = (event.target as Element).closest<HTMLInputElement>(".payment-selection");
      if (!box) return;
      const amount = required<HTMLInputElement>(`payment-amount-${box.dataset.id}`);
      amount.disabled = !box.checked;
      if (!box.checked) amount.value = "";
      else amount.focus();
      updateTotal();
    });

    required<HTMLFormElement>("payment-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const declared = required<HTMLInputElement>("payment-total").value.trim();
      const items = applications();
      const error = validate(declared, items);
      if (error) return setMessage(error, "error");
      const button = required<HTMLButtonElement>("payment-submit");
      button.disabled = true;
      try {
        const result = await registerPayment({
          fecha: required<HTMLInputElement>("payment-date").value, monto: centsToMoney(tryParseMoney(declared)!),
          referencia: required<HTMLInputElement>("payment-reference").value.trim(), aplicaciones: items,
          comentarios: required<HTMLInputElement>("payment-comments").value.trim() || null,
        });
        window.dispatchEvent(new CustomEvent("sam:data-changed"));
        await renderPayments(`Abono ${result.id_abono} registrado por ${formatMoney(result.monto)}.`);
      } catch (error) {
        setMessage(String(error), "error");
        button.disabled = false;
      }
    });
  } catch (error) {
    console.error("Payment loading failed:", error);
    content.innerHTML = `<div class="report-error">No fue posible preparar el abono.</div>`;
  }
}
