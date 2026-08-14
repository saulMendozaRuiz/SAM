import {
  formatMoney,
} from "./validation.ts";

export function showConfirmationDialog({
  units,
  total,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");

    overlay.className = "sam-modal-overlay";

    overlay.innerHTML = `
      <section
        class="sam-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acquisition-confirm-title"
      >
        <div class="sam-modal-accent"></div>

        <header>
          <h2 id="acquisition-confirm-title">
            Confirmar adquisición
          </h2>
        </header>

        <div class="sam-modal-content">
          <p>
            Se registrarán
            <strong>
              ${units} ${units === 1 ? "unidad" : "unidades"}
            </strong>
            por:
          </p>

          <strong class="sam-modal-amount">
            ${formatMoney(total)}
          </strong>

          <p class="sam-modal-warning">
            Se crearán las unidades y sus obligaciones
            con el concesionario.
          </p>
        </div>

        <footer>
          <button
            class="sam-modal-cancel"
            type="button"
          >
            Cancelar
          </button>

          <button
            class="sam-modal-accept"
            type="button"
          >
            Confirmar
          </button>
        </footer>
      </section>
    `;

    document.body.appendChild(overlay);

    const acceptButton = overlay.querySelector(
      ".sam-modal-accept",
    );

    const cancelButton = overlay.querySelector(
      ".sam-modal-cancel",
    );

    function close(result) {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      overlay.remove();
      resolve(result);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }

    acceptButton.addEventListener(
      "click",
      () => close(true),
    );

    cancelButton.addEventListener(
      "click",
      () => close(false),
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(false);
      }
    });

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    acceptButton.focus();
  });
}