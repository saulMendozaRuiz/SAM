// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
import {
  loadReports,
} from "./api.ts";

import {
  renderPayments,
} from "./payments.ts";

import {
  renderReports,
} from "./reports.ts";

import {
  renderFinancing,
} from "./financing/index.ts";

import {
  renderConcessionaires,
} from "./concessionaires.ts";

import {
  renderFinancialInstitutions,
} from "./financial-institutions.ts";

import {
  renderObligations,
} from "./obligations.ts";

import {
  renderPaymentCalendar,
} from "./calendar.ts";

import {
  renderLedger,
} from "./ledger.ts";
import { escapeHtml } from "./ui/format.ts";


function getModuleContent() {
  return document.getElementById(
    "module-content",
  );
}

function setActiveModule(moduleName) {
  document
    .querySelectorAll(".nav-item")
    .forEach((item) => {
      item.classList.toggle(
        "active",
        item.dataset.module === moduleName,
      );
    });

  document.getElementById(
    "module-title",
  ).textContent = moduleName;
}

export function renderHome() {
  const username = document.getElementById(
    "active-user",
  ).textContent;

  getModuleContent().innerHTML = `
    <div class="home-message">
      <span class="home-accent"></span>

      <div>
        <h1>
          Bienvenido, ${escapeHtml(username)}
        </h1>

        <p>
          Selecciona una opción del menú para comenzar.
        </p>
      </div>
    </div>
  `;
}

function renderPendingModule(moduleName) {
  getModuleContent().innerHTML = `
    <div class="home-message">
      <span class="home-accent"></span>

      <div>
        <h1>${escapeHtml(moduleName)}</h1>
        <p>Módulo pendiente de conexión.</p>
      </div>
    </div>
  `;
}

function renderPreparationError() {
  getModuleContent().innerHTML = `
    <div class="report-error">
      No fue posible preparar los datos de SAM.
    </div>
  `;
}

const moduleRenderers = {
  Unidades: async () => {
    const { renderUnits } = await import(
      "./units.ts"
    );

    await renderUnits();
  },
  Concesionarios: renderConcessionaires,
  Financieras: renderFinancialInstitutions,
  Obligaciones: renderObligations,
  Financiamientos: renderFinancing,
  "Calendario de pagos": renderPaymentCalendar,
  Ledger: renderLedger,
  "Registrar abono": renderPayments,
};

async function openReports() {
  getModuleContent().innerHTML = `
    <div class="report-loading">
      Cargando reportes…
    </div>
  `;

  try {
    const reports = await loadReports();

    await renderReports({
      reports,
    });
  } catch (error) {
    console.error(
      "SAM report loading failed:",
      error,
    );

    renderPreparationError();
  }
}
export async function openModule(moduleName) {
  setActiveModule(moduleName);

  if (moduleName === "Reportes") {
    await openReports();
    return;
  }

  const renderer =
    moduleRenderers[moduleName];

  if (renderer) {
    await renderer();
    return;
  }

  renderPendingModule(moduleName);
}

export function initializeNavigation() {
  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await openModule(
            button.dataset.module,
          );
        },
      );
    });
}

export async function resetNavigation() {
  await openModule("Unidades");
}
