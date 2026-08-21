import { eventElement, query } from "./dom.ts";
import { escapeHtml, errorMessage } from "./format.ts";

export function messageDialog(
  error: unknown,
  title = "No fue posible continuar",
  buttonLabel = "Entendido",
): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `<section class="sam-modal corporate-modal message-modal" role="alertdialog" aria-modal="true">
      <header class="corporate-modal-header"><div><span class="modal-eyebrow">SAM</span><h2>${escapeHtml(title)}</h2></div></header>
      <div class="corporate-modal-body"><p>${escapeHtml(errorMessage(error))}</p></div>
      <footer class="corporate-modal-footer"><button type="button" class="primary-action" data-answer="close">${escapeHtml(buttonLabel)}</button></footer>
    </section>`;
    overlay.addEventListener("click", (event) => {
      if (!eventElement(event)?.closest("[data-answer='close']")) return;
      overlay.remove();
      resolve();
    });
    document.body.append(overlay);
    query<HTMLButtonElement>(overlay, "[data-answer='close']").focus();
  });
}
