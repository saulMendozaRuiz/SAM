import { bindTableExportButtons } from "../ui/export-table.ts";
import {
  cancelFinancing,
  loadFinanceableObligations,
  loadFinancialInstitutions,
  loadFinancing,
} from "../api.ts";
import { initializeFinancingForm } from "./form.ts";
import { cancellationDialog, messageDialog } from "./modal.ts";
import { formScreen, listScreen } from "./template.ts";
import { byId } from "../ui/dom.ts";
import { errorMessage } from "../ui/format.ts";

function content(): HTMLElement {
  return byId("module-content");
}

async function renderList(message = "") {
  const items = await loadFinancing();
  content().innerHTML = listScreen(items, message);
  bindTableExportButtons(content());

  byId("new-financing").addEventListener("click", renderForm);
  document.querySelectorAll<HTMLButtonElement>(".cancel-financing").forEach((button) => {
    button.addEventListener("click", async () => {
      const reason = await cancellationDialog(button.dataset.folio);
      if (!reason) return;
      try {
        await cancelFinancing(Number(button.dataset.id), reason);
        window.dispatchEvent(new CustomEvent("sam:data-changed"));
        await renderList(`Financiamiento ${button.dataset.id} cancelado correctamente.`);
      } catch (error) {
        await messageDialog(errorMessage(error));
      }
    });
  });
}

async function renderForm() {
  content().innerHTML = `<div class="report-loading">Preparando financiamiento…</div>`;

  try {
    const [financiers, obligations] = await Promise.all([
      loadFinancialInstitutions(),
      loadFinanceableObligations(),
    ]);
    content().innerHTML = formScreen(financiers);
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
    await messageDialog(errorMessage(error));
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
