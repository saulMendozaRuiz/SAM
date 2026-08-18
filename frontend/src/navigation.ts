import { renderPaymentCalendar } from "./calendar.ts";
import { renderConcessionaires } from "./concessionaires.ts";
import { renderFinancialInstitutions } from "./financial-institutions.ts";
import { renderFinancing } from "./financing/index.ts";
import { renderObligations } from "./obligations.ts";
import { renderPayments } from "./payments.ts";
import { renderReports } from "./reports.ts";
type Renderer = () => void | Promise<void>;
const content = (): HTMLElement => {
  const element = document.getElementById("module-content");
  if (!element) throw new Error("Falta #module-content");
  return element;
};

const renderers: Record<string, Renderer> = {
  Unidades: async () => (await import("./units.ts")).renderUnits(),
  Concesionarios: renderConcessionaires,
  Financieras: renderFinancialInstitutions,
  Obligaciones: renderObligations,
  Financiamientos: renderFinancing,
  "Calendario de pagos": () => renderPaymentCalendar(undefined, undefined),
  "Registrar abono": renderPayments,
};

function activate(moduleName: string): void {
  document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.module === moduleName));
  const title = document.getElementById("module-title");
  if (title) title.textContent = moduleName;
}

export async function openModule(moduleName: string): Promise<void> {
  activate(moduleName);
  try {
    if (moduleName === "Reportes") return await renderReports();
    const render = renderers[moduleName];
    if (!render) throw new Error(`Módulo desconocido: ${moduleName}`);
    await render();
  } catch (error) {
    console.error("Module loading failed:", error);
    content().innerHTML = `<div class="report-error">No fue posible preparar los datos de SAM.</div>`;
  }
}

export function initializeNavigation(): void {
  document.querySelectorAll<HTMLElement>(".nav-item").forEach((button) =>
    button.addEventListener("click", () => openModule(button.dataset.module || "Unidades")));
}

export const resetNavigation = (): Promise<void> => openModule("Unidades");
