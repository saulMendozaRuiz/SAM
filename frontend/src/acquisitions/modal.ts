import { formatMoney } from "./validation.ts";

export function showConfirmationDialog({ units, total }: { units: number; total: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.innerHTML = `<section class="sam-modal" role="dialog" aria-modal="true" aria-labelledby="acquisition-confirm-title">
      <div class="sam-modal-accent"></div><header><h2 id="acquisition-confirm-title">Confirmar adquisición</h2></header>
      <div class="sam-modal-content"><p>Se registrarán <strong>${units} ${units === 1 ? "unidad" : "unidades"}</strong> por:</p>
        <strong class="sam-modal-amount">${formatMoney(total)}</strong>
        <p class="sam-modal-warning">Se crearán las unidades y sus obligaciones con el concesionario.</p>
      </div><footer><button class="sam-modal-cancel" type="button">Cancelar</button><button class="sam-modal-accept" type="button">Confirmar</button></footer>
    </section>`;
    document.body.appendChild(overlay);

    const close = (result: boolean): void => {
      document.removeEventListener("keydown", keyboard);
      overlay.remove();
      resolve(result);
    };
    const keyboard = (event: KeyboardEvent): void => { if (event.key === "Escape") close(false); };
    overlay.querySelector(".sam-modal-accept")?.addEventListener("click", () => close(true));
    overlay.querySelector(".sam-modal-cancel")?.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(false); });
    document.addEventListener("keydown", keyboard);
    overlay.querySelector<HTMLButtonElement>(".sam-modal-accept")?.focus();
  });
}
