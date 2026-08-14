import {
  loadConcessionaires,
} from "../api.ts";

import {
  acquisitionScreen,
} from "./template.ts";

import {
  initializeAcquisitionForm,
} from "./form.ts";

export async function renderAcquisitions(
  successMessage = "",
) {
  const content = document.getElementById(
    "module-content",
  );

  content.innerHTML = `
    <div class="report-loading">
      Cargando concesionarios…
    </div>
  `;

  try {
    const concessionaires =
      await loadConcessionaires();

    if (concessionaires.length === 0) {
      content.innerHTML = `
        <div class="report-error">
          No existen concesionarios activos.
        </div>
      `;

      return;
    }

    content.innerHTML =
      acquisitionScreen({
        concessionaires,
        successMessage,
      });

    initializeAcquisitionForm({
      renderAcquisitions,
      concessionaires,
    });
  } catch (error) {
    console.error(
      "Acquisition form loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible preparar la adquisición.
      </div>
    `;
  }
}