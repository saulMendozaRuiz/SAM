import { confirmFinancing } from "../api.ts";
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

function value(id) {
  return document.getElementById(id).value;
}

function captureApplications(state) {
  document.querySelectorAll(".fin-app-amount").forEach((input) => {
    const item = state.applications.find(
      (row) => Number(row.obligacion_id) === Number(input.dataset.id),
    );
    item.amount = input.value || "0.00";
    item.selected = document.querySelector(
      `.fin-app-selected[data-id="${input.dataset.id}"]`,
    ).checked;
  });
}

function updateApplicationTotal(state) {
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

  document.getElementById("fin-application-total").textContent =
    formatMoney(appliedCents / 100);
  document.getElementById("fin-application-remaining").textContent =
    formatMoney(remainingCents / 100);
}

function scheduleConfiguration() {
  return JSON.stringify({
    couponAmount: value("fin-coupon-amount"),
    couponCount: value("fin-coupon-count"),
    firstDueDate: value("fin-first-due"),
    balloonAmount: value("fin-balloon-amount"),
    balloonDueDate: value("fin-balloon-due"),
  });
}

function updateScheduleSummary(state) {
  const target = document.getElementById("fin-schedule-summary");

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

function markScheduleStale(state) {
  if (!state.schedule.length) return;
  state.scheduleSignature = null;
  const target = document.getElementById("fin-schedule-summary");
  target.textContent = "Cambió la estructura. Vuelve a generar el calendario.";
  target.className = "schedule-summary stale";
}

export function initializeFinancingForm({ obligations, onBack, onCommitted }) {
  const state = {
    applications: obligations.map((item) => ({ ...item, selected: false, amount: "0.00" })),
    schedule: [],
    scheduleSignature: null,
  };

  document.getElementById("fin-applications").innerHTML = applicationRows(obligations);
  document.querySelectorAll(".fin-app-amount").forEach((input) => {
    bindMoneyInput(input, () => updateApplicationTotal(state));
  });

  ["fin-coupon-amount", "fin-balloon-amount"].forEach((id) => {
    bindMoneyInput(document.getElementById(id), () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
  });
  document.getElementById("back-financing").addEventListener("click", onBack);

  const firstDue = document.getElementById("fin-first-due");
  firstDue.value = addNaturalMonths(localIsoDate(), 1);

  document.getElementById("fin-emission").addEventListener("change", (event) => {
    if (!firstDue.value) firstDue.value = addNaturalMonths(event.target.value, 1);
  });

  document.getElementById("fin-applications").addEventListener("input", () => updateApplicationTotal(state));
  document.getElementById("fin-applications").addEventListener("change", () => updateApplicationTotal(state));

  [
    "fin-coupon-amount",
    "fin-coupon-count",
    "fin-first-due",
    "fin-balloon-amount",
    "fin-balloon-due",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
    document.getElementById(id).addEventListener("change", () => {
      markScheduleStale(state);
      updateApplicationTotal(state);
    });
  });

  document.getElementById("configure-schedule").addEventListener("click", async () => {
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
          document.getElementById("fin-balloon-due").value = balloon.vencimiento;
          state.scheduleSignature = scheduleConfiguration();
        }
      }

      const edited = await editScheduleDialog(state.schedule);
      if (!edited) return;

      state.schedule = edited;
      state.scheduleSignature = scheduleConfiguration();
      updateScheduleSummary(state);
    } catch (error) {
      await messageDialog(error.message);
    }
  });

  document.getElementById("confirm-financing").addEventListener("click", async () => {
    const button = document.getElementById("confirm-financing");

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
        applications: payload.aplicaciones.length,
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
      await messageDialog(error.message || String(error));
      button.disabled = false;
      button.textContent = "Confirmar";
    }
  });

  updateApplicationTotal(state);
  updateScheduleSummary(state);
}
