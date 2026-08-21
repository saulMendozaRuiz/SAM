import { confirmFinancing, ReportedMutationError } from "../api.ts";
import type {
  FinanceableObligation,
  FinancingFormState,
} from "../domain/types.ts";
import { byId } from "../ui/dom.ts";
import { messageDialog } from "../ui/message.ts";
import {
  confirmFinancingDialog,
  editScheduleDialog,
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
  const applicationsById = new Map(
    state.applications.map((item) => [Number(item.obligacion_id), item]),
  );
  document.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
    const item = applicationsById.get(Number(input.dataset.id));
    if (!item) return;
    const row = input.closest<HTMLTableRowElement>("tr");
    item.amount = input.value || "0.00";
    const direct = row?.querySelector<HTMLInputElement>(".fin-direct-payment");
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
    applications: obligations.map((item) => ({ ...item, amount: "0.00", directPayment: item.entity === "CON" })),
    schedule: [],
    scheduleSignature: null,
    idFin: "",
    folio: "",
    emision: "",
    montoCupones: "0.00",
    montoBalloon: "0.00",
    comments: "",
  };

  const applicationBody = byId("fin-applications");
  const ocOptions = byId("fin-oc-options");
  const ocSummary = byId("fin-oc-filter-summary");

  const renderApplications = (): void => {
    captureApplications(state);
    const selectedOrders = new Set(
      Array.from(ocOptions.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map((option) => option.value),
    );
    const visible = selectedOrders.size
      ? state.applications.filter((item) => item.oc_mexrac && selectedOrders.has(item.oc_mexrac))
      : state.applications;

    applicationBody.innerHTML = applicationRows(visible);
    applicationBody.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
      bindMoneyInput(input, () => updateApplicationTotal(state));
    });
    ocSummary.textContent = selectedOrders.size ? `${selectedOrders.size} OC seleccionadas` : "Todas las OC";
    updateApplicationTotal(state);
  };

  ocOptions.addEventListener("change", renderApplications);
  renderApplications();

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

  applicationBody.addEventListener("input", () => updateApplicationTotal(state));
  applicationBody.addEventListener("change", () => updateApplicationTotal(state));

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
      await messageDialog(error);
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
      if (!(error instanceof ReportedMutationError)) await messageDialog(error);
      button.disabled = false;
      button.textContent = "Confirmar";
    }
  });

  updateApplicationTotal(state);
  updateScheduleSummary(state);
}
