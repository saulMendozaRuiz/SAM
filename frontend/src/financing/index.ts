import { bindTableExportButtons } from "../ui/export-table.ts";
import {
  cancelFinancing,
  loadFinanceableObligations,
  loadFinancialInstitutions,
  loadFinancing,
} from "../api.ts";
import { initializeFinancingForm } from "./form.ts";
import { cancellationDialog } from "./modal.ts";
import { formScreen, listScreen } from "./template.ts";
import { byId } from "../ui/dom.ts";
import { messageDialog } from "../ui/message.ts";
import { formatCompactMoney } from "../ui/format.ts";
import { financingRows } from "./template.ts";

let listController: AbortController | null = null;

function content(): HTMLElement {
  return byId("module-content");
}

async function renderList(message = "") {
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  const items = await loadFinancing();
  if (controller.signal.aborted) return;
  content().innerHTML = listScreen(items, message);
  bindTableExportButtons(content());

  byId("new-financing").addEventListener("click", renderForm);
  const financier = byId<HTMLSelectElement>("financing-financier");
  const folio = byId<HTMLSelectElement>("financing-folio");
  const applyFilters = (): void => {
    const visible = items.filter((item) =>
      (!financier.value || item.financiera === financier.value)
      && (!folio.value || item.folio === folio.value));
    byId("financing-body").innerHTML = financingRows(visible);
    byId("financing-total").textContent = formatCompactMoney(visible.reduce(
      (sum, item) => sum + Number(item.monto_cupones) + Number(item.monto_balloon), 0));
    byId("financing-count").textContent = String(visible.length);
    byId("financing-units").textContent = String(visible.reduce((sum, item) => sum + item.unidades_financiadas, 0));
  };
  financier.addEventListener("change", applyFilters);
  folio.addEventListener("change", applyFilters);

  content().addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".cancel-financing");
    if (button) {
      const reason = await cancellationDialog(button.dataset.folio);
      if (!reason) return;
      try {
        await cancelFinancing(Number(button.dataset.id), reason);
        window.dispatchEvent(new CustomEvent("sam:data-changed"));
        await renderList(`Financiamiento ${button.dataset.id} cancelado correctamente.`);
      } catch (error) {
        console.error("Financing cancellation failed:", error);
      }
    }
  }, { signal: controller.signal });
}

async function renderForm() {
  listController?.abort();
  listController = null;
  content().innerHTML = `<div class="report-loading">Preparando financiamiento…</div>`;

  try {
    const [financiers, obligations] = await Promise.all([
      loadFinancialInstitutions(),
      loadFinanceableObligations(),
    ]);
    content().innerHTML = formScreen(financiers, obligations);
    content().scrollTop = 0;
    window.requestAnimationFrame(() => {
      content().scrollTop = 0;
    });
    initializeFinancingForm({
      obligations,
      onBack: () => renderList(),
      onCommitted: (message) => renderList(message),
    });
  } catch (error) {
    await messageDialog(error);
    await renderList();
  }
}

export async function renderFinancing() {
  content().innerHTML = `<div class="report-loading">Cargando financiamientos…</div>`;
  try {
    await renderList();
  } catch (error) {
    console.error("Financing loading failed:", error);
    content().innerHTML = `<div class="report-error">No fue posible cargar los financiamientos.</div>`;
  }
}
