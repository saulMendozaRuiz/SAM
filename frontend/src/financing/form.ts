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
  centsToMoney,
  distributeProportionally,
  formatMoney,
  generateSchedule,
  localIsoDate,
  moneyToCents,
  validateFinancing,
} from "./validation.ts";

let ocFilterController: AbortController | null = null;
const REFINANCING_FILTER = "__REFINANCIAMIENTOS__";

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
    item.selected = row?.querySelector<HTMLInputElement>(".fin-app-selected")?.checked ?? false;
    const direct = row?.querySelector<HTMLInputElement>(".fin-direct-payment");
    item.directPayment = direct ? direct.checked : false;
  });
}

function dispositionAmountCents(): number {
  return moneyToCents(value("fin-disposition-amount") || "0");
}

function distributeAssignedAmounts(state: FinancingFormState): void {
  const selected = state.applications.filter((item) => item.selected);
  state.applications.filter((item) => !item.selected).forEach((item) => {
    item.amount = "0.00";
  });
  if (!selected.length) return;

  const shares = distributeProportionally(
    dispositionAmountCents(),
    selected.map((item) => moneyToCents(item.saldo, "Saldo")),
  );
  shares.forEach((cents, index) => {
    selected[index].amount = centsToMoney(cents);
  });
}

function showAssignedAmounts(state: FinancingFormState): void {
  const applicationsById = new Map(
    state.applications.map((item) => [Number(item.obligacion_id), item]),
  );
  document.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
    const item = applicationsById.get(Number(input.dataset.id));
    if (item) input.value = formatMoney(moneyToCents(item.amount || "0") / 100);
  });
}

function updateApplicationTotal(state: FinancingFormState): void {
  captureApplications(state);

  const appliedCents = state.applications.filter((item) => item.selected).reduce((sum, item) => {
    try {
      return sum + moneyToCents(item.amount || "0");
    } catch {
      return sum;
    }
  }, 0);

  let capitalCents = 0;
  try {
    capitalCents = dispositionAmountCents();
  } catch {
    capitalCents = 0;
  }

  const remainingCents = capitalCents - appliedCents;

  byId("fin-application-total").textContent =
    formatMoney(appliedCents / 100);
  byId("fin-application-remaining").textContent =
    formatMoney(remainingCents / 100);
  byId("fin-selected-count").textContent = String(
    state.applications.filter((item) => item.selected).length,
  );
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
    montoDisposicion: "0.00",
    comments: "",
  };

  const applicationBody = byId("fin-applications");
  const ocOptions = byId("fin-oc-options");
  const ocSummary = byId("fin-oc-filter-summary");
  const ocFilter = ocOptions.closest<HTMLDetailsElement>(".financing-oc-filter");
  const selectAll = byId<HTMLInputElement>("fin-select-all");

  ocFilterController?.abort();
  ocFilterController = new AbortController();
  document.addEventListener("pointerdown", (event) => {
    if (ocFilter?.open && event.target instanceof Node && !ocFilter.contains(event.target)) {
      ocFilter.open = false;
    }
  }, { capture: true, signal: ocFilterController.signal });

  const selectedOrders = (): Set<string> => new Set(
    Array.from(ocOptions.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
      .map((option) => option.value)
      .filter(Boolean),
  );

  const allOrdersSelected = (): boolean =>
    ocOptions.querySelector<HTMLInputElement>('input[type="checkbox"][value=""]')?.checked ?? false;

  const matchesFilter = (
    item: FinancingFormState["applications"][number],
    orders: Set<string>,
    allOrders: boolean,
  ): boolean => allOrders
    ? Boolean(item.oc_mexrac)
    : (orders.has(REFINANCING_FILTER)
      ? item.entity === "FIN"
      : Boolean(item.oc_mexrac && orders.has(item.oc_mexrac)));

  const updateSelectAll = (filtered: FinancingFormState["applications"]): void => {
    const selectedInFilter = filtered.filter((item) => item.selected).length;
    selectAll.checked = filtered.length > 0 && selectedInFilter === filtered.length;
    selectAll.indeterminate = selectedInFilter > 0 && selectedInFilter < filtered.length;
    selectAll.disabled = filtered.length === 0;
  };

  const compareApplications = (
    left: FinancingFormState["applications"][number],
    right: FinancingFormState["applications"][number],
  ): number => {
    if (left.oc_mexrac === null && right.oc_mexrac !== null) return 1;
    if (left.oc_mexrac !== null && right.oc_mexrac === null) return -1;
    const byOrder = (left.oc_mexrac || "").localeCompare(right.oc_mexrac || "", "es-MX", { numeric: true });
    return byOrder || (left.vin || "").localeCompare(right.vin || "", "es-MX", { numeric: true });
  };

  const renderApplications = (capture = true): void => {
    if (capture) captureApplications(state);
    const orders = selectedOrders();
    const allOrders = allOrdersSelected();
    const filtered = state.applications.filter((item) => matchesFilter(item, orders, allOrders));
    const rows = filtered.sort(compareApplications);

    applicationBody.innerHTML = rows.length
      ? applicationRows(rows)
      : `<tr><td colspan="8" class="empty-table-message">—</td></tr>`;
    applicationBody.querySelectorAll<HTMLInputElement>(".fin-app-amount").forEach((input) => {
      bindMoneyInput(input, () => updateApplicationTotal(state));
    });
    updateSelectAll(filtered);
    ocSummary.textContent = allOrders
      ? "Todas las OC"
      : orders.has(REFINANCING_FILTER)
        ? "Refinanciamientos"
        : `${orders.size} OC seleccionadas`;
    updateApplicationTotal(state);
  };

  ocOptions.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      const options = Array.from(ocOptions.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
      const all = options.find((option) => option.value === "");
      if (target === all && target.checked) {
        options.filter((option) => option !== all).forEach((option) => { option.checked = false; });
      } else if (target !== all) {
        if (target.checked && all) all.checked = false;
      }

      if (target.checked && target.value === REFINANCING_FILTER) {
        options.filter((option) => option.value !== REFINANCING_FILTER).forEach((option) => { option.checked = false; });
        state.applications.filter((item) => item.entity === "CON").forEach((item) => {
          item.selected = false;
          item.amount = "0.00";
        });
      } else if (target.checked) {
        options.filter((option) => option.value === REFINANCING_FILTER).forEach((option) => { option.checked = false; });
        state.applications.filter((item) => item.entity === "FIN").forEach((item) => {
          item.selected = false;
          item.amount = "0.00";
        });
      }
    }
    renderApplications();
  });
  selectAll.addEventListener("change", () => {
    captureApplications(state);
    const orders = selectedOrders();
    const filtered = state.applications.filter((item) => matchesFilter(item, orders, allOrdersSelected()));
    const shouldSelect = !filtered.every((item) => item.selected);
    filtered.forEach((item) => { item.selected = shouldSelect; });
    distributeAssignedAmounts(state);
    renderApplications(false);
  });
  renderApplications();

  bindMoneyInput(byId<HTMLInputElement>("fin-disposition-amount"), () => {
      captureApplications(state);
      distributeAssignedAmounts(state);
      showAssignedAmounts(state);
      updateApplicationTotal(state);
  });
  byId<HTMLInputElement>("fin-disposition-amount").addEventListener("input", () => {
    try {
      captureApplications(state);
      distributeAssignedAmounts(state);
      showAssignedAmounts(state);
      updateApplicationTotal(state);
    } catch {
      // El importe todavía puede estar incompleto mientras el usuario escribe.
    }
  });

  ["fin-coupon-amount", "fin-balloon-amount"].forEach((id) => {
    bindMoneyInput(byId<HTMLInputElement>(id));
  });
  byId("back-financing").addEventListener("click", onBack);

  const firstDue = byId<HTMLInputElement>("fin-first-due");
  firstDue.value = addNaturalMonths(localIsoDate(), 1);

  byId<HTMLInputElement>("fin-emission").addEventListener("change", (event) => {
    if (!firstDue.value) firstDue.value = addNaturalMonths((event.currentTarget as HTMLInputElement).value, 1);
  });

  applicationBody.addEventListener("input", () => updateApplicationTotal(state));
  applicationBody.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.classList.contains("fin-app-selected")) {
      captureApplications(state);
      distributeAssignedAmounts(state);
      showAssignedAmounts(state);
      const orders = selectedOrders();
      updateSelectAll(state.applications.filter((item) => matchesFilter(item, orders, allOrdersSelected())));
    }
    updateApplicationTotal(state);
  });

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
        montoDisposicion: value("fin-disposition-amount"),
        comments: value("fin-comments"),
      });

      const payload = validateFinancing(state);
      const accepted = await confirmFinancingDialog({
        folio: payload.folio,
        montoDisposicion: payload.monto_disposicion,
        totalPagares: payload.total,
        applications: payload.aplicaciones.length + payload.unidades.length,
        documents: payload.calendario.length,
      });
      if (!accepted) return;

      button.disabled = true;
      button.textContent = "Confirmando…";

      const result = await confirmFinancing(payload);
      window.dispatchEvent(new CustomEvent("sam:data-changed"));
      await onCommitted(
        `Financiamiento ${result.id_finto} confirmado: ${formatMoney(Number(result.monto_disposicion))} de disposición y ${formatMoney(Number(result.total_pagares))} en pagarés.`,
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
