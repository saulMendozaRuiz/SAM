import { confirmFinancing } from "../api.ts";
import type {
  FinanceableObligation,
  FinancingFormState,
} from "../domain/types.ts";
import { byId } from "../ui/dom.ts";
import { errorMessage } from "../ui/format.ts";
import {
  confirmFinancingDialog,
  editScheduleDialog,
  messageDialog,
} from "./modal.ts";
import { applicationRows } from "./template.ts";
import {
  addNaturalMonths,
  bindMoneyInput,
  formatMoney,
  generateSchedule,
  localIsoDate,
  moneyToCents,
  validateFinancing,
} from "./validation.ts";

function value(id: string): string {
  return byId<HTMLInputElement>(id).value;
}

function captureApplications(state: FinancingFormState): void {
  document.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
    const item = state.applications.find(
      (row) => Number(row.obligacion_id) === Number(input.dataset.id),
    );
    if (!item) return;
    item.amount = input.value || "0.00";
    item.selected = document.querySelector<HTMLInputElement>(
      `.fin-app-selected[data-id="${input.dataset.id}"]`,
    )?.checked ?? false;
    const direct = document.querySelector<HTMLInputElement>(
      `.fin-direct-payment[data-id="${input.dataset.id}"]`,
    );
    item.directPayment = direct ? direct.checked : false;
  });
}

function updateApplicationTotal(state: FinancingFormState): void {
  captureApplications(state);

  const appliedCents = state.applications.reduce((sum, item) => {
    try {
      return sum + moneyToCents(item.amount || "0");
    } catch {
      return sum;
    }
  }, 0);

  let financingCents = 0;
  try {
    financingCents =
      moneyToCents(value("fin-coupon-amount") || "0") +
      moneyToCents(value("fin-balloon-amount") || "0");
  } catch {
    financingCents = 0;
  }

  const remainingCents = financingCents - appliedCents;

  byId("fin-application-total").textContent =
    formatMoney(appliedCents / 100);
  byId("fin-application-remaining").textContent =
    formatMoney(remainingCents / 100);
}

function scheduleConfiguration(): string {
  return JSON.stringify({
    couponAmount: value("fin-coupon-amount"),
    couponCount: value("fin-coupon-count"),
    firstDueDate: value("fin-first-due"),
    balloonAmount: value("fin-balloon-amount"),
    balloonDueDate: value("fin-balloon-due"),
  });
}

function updateScheduleSummary(state: FinancingFormState): void {
  const target = byId("fin-schedule-summary");

  if (!state.schedule.length) {
    target.textContent = "Calendario pendiente.";
    target.className = "schedule-summary pending";
    return;
  }

  const ordinary = state.schedule.filter((item) => !item.is_balloon).length;
  const balloons = state.schedule.filter((item) => item.is_balloon).length;
  target.textContent = `${ordinary} cupones${balloons ? " + 1 balloon" : ""} · ${state.schedule.length} documentos listos`;
  target.className = "schedule-summary ready";
}

function markScheduleStale(state: FinancingFormState): void {
  if (!state.schedule.length) return;
  state.scheduleSignature = null;
  const target = byId("fin-schedule-summary");
  target.textContent = "Cambió la estructura. Vuelve a generar el calendario.";
  target.className = "schedule-summary stale";
}

export function initializeFinancingForm({ obligations, onBack, onCommitted }: {
  obligations: FinanceableObligation[];
  onBack: () => void;
  onCommitted: (message: string) => Promise<void>;
}): void {
  const state: FinancingFormState = {
    applications: obligations.map((item) => ({ ...item, selected: false, amount: "0.00", directPayment: item.entity === "CON" })),
    schedule: [],
    scheduleSignature: null,
    idFin: "",
    folio: "",
    emision: "",
    montoCupones: "0.00",
    montoBalloon: "0.00",
    comments: "",
  };

  byId("fin-applications").innerHTML = applicationRows(obligations);
  document.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
    bindMoneyInput(input, () => updateApplicationTotal(state));
  });

  ["fin-coupon-amount", "fin-balloon-amount"].forEach((id) => {
    bindMoneyInput(byId<HTMLInputElement>(id), () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
  });
  byId("back-financing").addEventListener("click", onBack);

  const firstDue = byId<HTMLInputElement>("fin-first-due");
  firstDue.value = addNaturalMonths(localIsoDate(), 1);

  byId<HTMLInputElement>("fin-emission").addEventListener("change", (event) => {
    if (!firstDue.value) firstDue.value = addNaturalMonths((event.currentTarget as HTMLInputElement).value, 1);
  });

  byId("fin-applications").addEventListener("input", () => updateApplicationTotal(state));
  byId("fin-applications").addEventListener("change", () => updateApplicationTotal(state));

  [
    "fin-coupon-amount",
    "fin-coupon-count",
    "fin-first-due",
    "fin-balloon-amount",
    "fin-balloon-due",
  ].forEach((id) => {
    byId(id).addEventListener("input", () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
    byId(id).addEventListener("change", () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
  });

  byId("configure-schedule").addEventListener("click", async () => {
    try {
      const signature = scheduleConfiguration();

      if (!state.schedule.length || state.scheduleSignature !== signature) {
        state.schedule = generateSchedule({
          couponAmount: value("fin-coupon-amount"),
          couponCount: value("fin-coupon-count"),
          firstDueDate: value("fin-first-due"),
          balloonAmount: value("fin-balloon-amount"),
          balloonDueDate: value("fin-balloon-due"),
        });
        state.scheduleSignature = signature;

        const balloon = state.schedule.find((item) => item.is_balloon);
        if (balloon && !value("fin-balloon-due")) {
          byId<HTMLInputElement>("fin-balloon-due").value = balloon.vencimiento;
          state.scheduleSignature = scheduleConfiguration();
        }
      }

      const edited = await editScheduleDialog(state.schedule);
      if (!edited) return;

      state.schedule = edited;
      state.scheduleSignature = scheduleConfiguration();
      updateScheduleSummary(state);
    } catch (error) {
      await messageDialog(errorMessage(error));
    }
  });

  byId("confirm-financing").addEventListener("click", async () => {
    const button = byId<HTMLButtonElement>("confirm-financing");

    try {
      captureApplications(state);

      if (state.schedule.length && state.scheduleSignature !== scheduleConfiguration()) {
        throw new Error("La estructura cambió. Vuelve a generar y guardar el calendario.");
      }

      Object.assign(state, {
        idFin: value("fin-id"),
        folio: value("fin-folio"),
        emision: value("fin-emission"),
        montoCupones: value("fin-coupon-amount"),
        montoBalloon: value("fin-balloon-amount"),
        comments: value("fin-comments"),
      });

      const payload = validateFinancing(state);
      const accepted = await confirmFinancingDialog({
        folio: payload.folio,
        total: payload.total,
        applications: payload.aplicaciones.length + payload.unidades.length,
        documents: payload.calendario.length,
      });
      if (!accepted) return;

      button.disabled = true;
      button.textContent = "Confirmando…";

      const result = await confirmFinancing(payload);
      window.dispatchEvent(new CustomEvent("sam:data-changed"));
      await onCommitted(
        `Financiamiento ${result.id_finto} confirmado por ${formatMoney(Number(result.monto_financiado))}.`,
      );
    } catch (error) {
      console.error("Financing confirmation failed:", error);
      await messageDialog(errorMessage(error));
      button.disabled = false;
      button.textContent = "Confirmar";
    }
  });

  updateApplicationTotal(state);
  updateScheduleSummary(state);
}
