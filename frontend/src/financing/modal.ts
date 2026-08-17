import { bindMoneyInput, escapeHtml, formatMoney } from "./validation.ts";
import { splitBalanced } from "../ui/split-list.ts";
import type { FinancingScheduleRow } from "../domain/types.ts";
import { eventElement, query } from "../ui/dom.ts";
import { errorMessage } from "../ui/format.ts";

export function editScheduleDialog(schedule: FinancingScheduleRow[]): Promise<FinancingScheduleRow[] | null> {
  return new Promise((resolve) => {
    const workingCopy = schedule.map((item) => ({ ...item }));
    const { left, right } = splitBalanced(workingCopy);

    const editablePair = (item: FinancingScheduleRow | undefined, index: number) => item ? `
      <div class="schedule-pair" data-index="${index}">
        <input class="fin-schedule-date" type="date" value="${item.vencimiento}" aria-label="Vencimiento documento ${item.serie_pago}" />
        <input class="fin-schedule-amount money-input" inputmode="decimal" value="${item.monto}" aria-label="Monto documento ${item.serie_pago}" />
      </div>
    ` : `<div class="schedule-pair schedule-pair-empty" aria-hidden="true"></div>`;

    const rows = left.map((item, rowIndex) => {
      const rightItem = right[rowIndex];
      const rightIndex = left.length + rowIndex;
      return `
        <div class="schedule-split-row">
          ${editablePair(item, rowIndex)}
          ${editablePair(rightItem, rightIndex)}
        </div>
      `;
    }).join("");

    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `
      <section class="sam-modal schedule-modal schedule-modal-wide" role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
        <header class="schedule-modal-header">
          <div>
            <h2 id="schedule-modal-title">Calendario editable</h2>
            <p>${workingCopy.length} documentos. Ajusta fechas o importes antes de guardar.</p>
          </div>
        </header>
        <div id="schedule-modal-error"></div>
        <div class="schedule-grid-head" aria-hidden="true">
          <span>Vencimiento</span><span class="number-cell">Monto</span>
          <span>Vencimiento</span><span class="number-cell">Monto</span>
        </div>
        <div id="schedule-modal-body" class="schedule-split-body sam-scroll-region">${rows}</div>
        <footer class="sam-modal-actions schedule-modal-actions">
          <button type="button" class="danger-action" data-answer="close">Descartar cambios</button>
          <button type="button" class="primary-action" data-answer="save">Guardar calendario</button>
        </footer>
      </section>
    `;

    const close = (result: FinancingScheduleRow[] | null) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (event) => {
      const answer = (eventElement(event)?.closest<HTMLElement>("[data-answer]"))?.dataset.answer;
      if (!answer) return;

      if (answer === "close") {
        close(null);
        return;
      }

      try {
        overlay.querySelectorAll<HTMLElement>("#schedule-modal-body .schedule-pair[data-index]").forEach((row) => {
          const item = workingCopy[Number(row.dataset.index)];
          item.vencimiento = query<HTMLInputElement>(row, ".fin-schedule-date").value;
          item.monto = query<HTMLInputElement>(row, ".fin-schedule-amount").value;
          if (!item.vencimiento) throw new Error(`El documento ${item.serie_pago} no tiene vencimiento.`);
          if (!item.monto) throw new Error(`El documento ${item.serie_pago} no tiene monto.`);
        });
        close(workingCopy);
      } catch (error) {
        const target = query<HTMLElement>(overlay, "#schedule-modal-error");
        target.className = "report-error";
        target.textContent = errorMessage(error);
      }
    });

    document.body.append(overlay);
    overlay.querySelectorAll<HTMLInputElement>(".fin-schedule-amount").forEach((input) => {
      bindMoneyInput(input);
    });
  });
}

export function messageDialog(message: string, title = "No fue posible continuar"): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `
      <section class="sam-modal corporate-modal message-modal" role="alertdialog" aria-modal="true">
        <header class="corporate-modal-header">
          <div><span class="modal-eyebrow">SAM</span><h2>${escapeHtml(title)}</h2></div>
        </header>
        <div class="corporate-modal-body"><p>${escapeHtml(message)}</p></div>
        <footer class="corporate-modal-footer">
          <button type="button" class="primary-action" data-answer="close">Entendido</button>
        </footer>
      </section>
    `;

    overlay.addEventListener("click", (event) => {
      if (!eventElement(event)?.closest("[data-answer='close']")) return;
      overlay.remove();
      resolve();
    });

    document.body.append(overlay);
    query<HTMLButtonElement>(overlay, "[data-answer='close']").focus();
  });
}

export function confirmFinancingDialog({ folio, total, applications, documents }: {
  folio: string;
  total: string;
  applications: number;
  documents: number;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `
      <section class="sam-modal corporate-modal" role="dialog" aria-modal="true">
        <header class="corporate-modal-header">
          <div><span class="modal-eyebrow">Confirmación</span><h2>Confirmar financiamiento</h2></div>
        </header>
        <div class="corporate-modal-body">
          <p class="modal-reference">${escapeHtml(folio)}</p>
          <p>Se financiarán <strong>${formatMoney(Number(total))}</strong> mediante ${applications} unidades u obligaciones.</p>
          <p>Se materializarán ${documents} documentos por pagar.</p>
        </div>
        <footer class="corporate-modal-footer split-actions">
          <button type="button" data-answer="cancel">Cancelar</button>
          <button type="button" class="primary-action" data-answer="confirm">Confirmar</button>
        </footer>
      </section>
    `;

    const close = (answer: boolean) => {
      overlay.remove();
      resolve(answer);
    };

    overlay.addEventListener("click", (event) => {
      const answer = eventElement(event)?.closest<HTMLElement>("[data-answer]")?.dataset.answer;
      if (answer) close(answer === "confirm");
    });

    document.body.append(overlay);
  });
}

export function cancellationDialog(folio?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `
      <section class="sam-modal corporate-modal" role="dialog" aria-modal="true">
        <header class="corporate-modal-header">
          <div><span class="modal-eyebrow">Cancelación</span><h2>Cancelar financiamiento</h2></div>
        </header>
        <div class="corporate-modal-body">
          <p class="modal-reference">${escapeHtml(folio)}</p>
          <label>Motivo<input id="fin-cancel-reason" type="text" autocomplete="off" /></label>
        </div>
        <footer class="corporate-modal-footer split-actions">
          <button type="button" data-answer="close">Regresar</button>
          <button type="button" class="danger-action" data-answer="cancel">Cancelar financiamiento</button>
        </footer>
      </section>
    `;

    overlay.addEventListener("click", (event) => {
      const answer = eventElement(event)?.closest<HTMLElement>("[data-answer]")?.dataset.answer;
      if (!answer) return;
      const reason = query<HTMLInputElement>(overlay, "#fin-cancel-reason").value.trim();
      if (answer === "cancel" && !reason) return;
      overlay.remove();
      resolve(answer === "cancel" ? reason : null);
    });

    document.body.append(overlay);
    query<HTMLInputElement>(overlay, "#fin-cancel-reason").focus();
  });
}
