import { bindTableExportButtons } from "./ui/export-table.ts";
import { displayValue, escapeHtml, formatMoney } from "./ui/format.ts";
import { byId } from "./ui/dom.ts";
import type { Unit } from "./domain/types.ts";
import { filterUnits, type UnitFilterField } from "./units-filter.ts";
import { renderAcquisitions } from "./acquisitions/index.ts";

import {
  correctConcessionaireDueDate,
  correctYardDelivery,
  checkUnitDeletion,
  deleteUnit,
  loadUnits,
} from "./api.ts";

type UnitEdit = { field: "delivery" | "due"; date: string; password: string };

function editUnitDialog(unit: Unit): Promise<UnitEdit | null> {
  return new Promise((resolve) => {
    document.querySelectorAll("[data-unit-dialog]").forEach((element) => element.remove());
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.dataset.unitDialog = "edit";
    overlay.innerHTML = `<form class="sam-modal corporate-modal unit-date-editor">
      <header class="corporate-modal-header"><div><span class="modal-eyebrow">Inventario</span><h2>Editar unidad</h2></div></header>
      <div class="corporate-modal-body"><p class="modal-reference">${escapeHtml(unit.vin)} · ${escapeHtml(unit.concesionario)}</p>
        <label>Dato a editar<select id="unit-edit-field" required><option value="">Selecciona una opción</option><option value="delivery">Fecha de patio</option><option value="due">Vencimiento concesionario</option></select></label>
        <label id="unit-edit-date-label" hidden><span>Fecha</span><input id="unit-edit-date" type="date" /></label>
        <label id="unit-edit-password-label" hidden><span>Contraseña</span><input id="unit-edit-password" type="password" autocomplete="current-password" /></label>
      </div>
      <footer class="corporate-modal-footer"><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary-action">Guardar</button></footer>
    </form>`;
    const field = overlay.querySelector<HTMLSelectElement>("#unit-edit-field")!;
    const dateLabel = overlay.querySelector<HTMLLabelElement>("#unit-edit-date-label")!;
    const dateCaption = dateLabel.querySelector("span")!;
    const date = overlay.querySelector<HTMLInputElement>("#unit-edit-date")!;
    const passwordLabel = overlay.querySelector<HTMLLabelElement>("#unit-edit-password-label")!;
    const password = overlay.querySelector<HTMLInputElement>("#unit-edit-password")!;
    const selectField = () => {
      const selected = field.value as UnitEdit["field"] | "";
      dateLabel.hidden = !selected;
      passwordLabel.hidden = selected !== "due";
      password.required = selected === "due";
      password.value = "";
      dateCaption.textContent = selected === "due" ? "Vencimiento concesionario" : "Fecha de patio";
      date.value = selected === "due" ? unit.vencimiento_con ?? "" : selected === "delivery" ? unit.entrega_patio ?? "" : "";
      date.required = selected === "due";
      if (selected) date.focus();
    };
    let closed = false;
    const close = (answer: UnitEdit | null) => {
      if (closed) return;
      closed = true;
      date.value = "";
      password.value = "";
      overlay.remove();
      resolve(answer);
    };
    field.addEventListener("change", selectField);
    overlay.querySelector<HTMLButtonElement>("[data-cancel]")?.addEventListener("click", () => close(null), { once: true });
    overlay.querySelector<HTMLFormElement>("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (field.value !== "delivery" && field.value !== "due") return;
      close({ field: field.value, date: date.value, password: password.value });
    });
    document.body.append(overlay);
    field.focus();
  });
}

function deletionDialog(unit: Unit): Promise<boolean> {
  return new Promise((resolve) => {
    document.querySelectorAll("[data-unit-dialog]").forEach((element) => element.remove());
    const overlay = document.createElement("div");
    overlay.className = "sam-modal-overlay";
    overlay.dataset.unitDialog = "deletion";
    overlay.innerHTML = `<section class="sam-modal corporate-modal unit-deletion" role="alertdialog" aria-modal="true">
      <header class="corporate-modal-header"><div><span class="modal-eyebrow">Inventario</span><h2>¿Eliminar esta unidad?</h2></div></header>
      <div class="corporate-modal-body">
        <p>Se retirará del inventario activo. Esta acción solamente está permitida porque la unidad no tiene compromisos asociados.</p>
        <p class="modal-reference"><strong>VIN:</strong> ${escapeHtml(unit.vin)}<br><strong>Factura:</strong> ${displayValue(unit.folio_factura)}<br><strong>Concesionario:</strong> ${escapeHtml(unit.concesionario)}</p>
      </div>
      <footer class="corporate-modal-footer"><button type="button" data-cancel>Cancelar</button><button type="button" class="danger-action" data-delete>Eliminar unidad</button></footer>
    </section>`;
    let closed = false;
    const close = (answer: boolean) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(answer);
    };
    overlay.querySelector<HTMLButtonElement>("[data-cancel]")?.addEventListener("click", () => close(false), { once: true });
    overlay.querySelector<HTMLButtonElement>("[data-delete]")?.addEventListener("click", () => close(true), { once: true });
    document.body.append(overlay);
    overlay.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
  });
}

function unitRows(units: Unit[]): string {
  return units
    .map(
      (unit) => `
        <tr>
          <td class="unit-oc">
            ${displayValue(unit.oc_mexrac)}
          </td>

          <td>
            <strong>
              ${escapeHtml(unit.vin)}
            </strong>
          </td>

          <td>
            ${displayValue(unit.no_motor)}
          </td>

          <td>
            ${escapeHtml(unit.modelo_anio)}
          </td>

          <td>
            ${escapeHtml(unit.marca)}
          </td>

          <td>
            ${escapeHtml(unit.version)}
          </td>

          <td>
            ${escapeHtml(unit.concesionario)}
          </td>

          <td>
            ${displayValue(unit.folio_factura)}
          </td>

          <td>
            ${displayValue(unit.entrega_patio)}
          </td>

          <td>${displayValue(unit.vencimiento_con)}</td>

          <td class="number-cell">
            ${formatMoney(unit.total)}
          </td>

          <td>
            <span class="status-badge ${unit.financiado ? "overdue" : "long-term"}">
              ${unit.financiado ? "FINANCIADO" : "SIN FINANCIAR"}
            </span>
          </td>
          <td class="export-ignore"><div class="unit-row-actions"><button type="button" class="table-action edit-unit" data-unitid="${unit.unitid}" title="Editar unidad" aria-label="Editar unidad ${escapeHtml(unit.vin)}"><span aria-hidden="true">✎</span></button><button type="button" class="table-action delete-unit" data-unitid="${unit.unitid}" title="Eliminar unidad" aria-label="Eliminar unidad ${escapeHtml(unit.vin)}"><span aria-hidden="true">🗑</span></button></div></td>
        </tr>
      `,
    )
    .join("");
}

export async function renderUnits() {
  const content = byId("module-content");

  content.innerHTML = `
    <div class="report-loading">
      Cargando unidades…
    </div>
  `;

  try {
    const units = await loadUnits();

    content.innerHTML = `
      <section
        class="reports-view units-view"
        aria-label="Unidades"
      >
        <div class="report-toolbar report-toolbar-actions-only">
          <button id="new-acquisition" type="button">Nueva adquisición</button>
        </div>

        <article
          class="report-panel due-panel"
        >
          <header>
            <h2>Inventario de unidades</h2>

            <button
              type="button"
              data-export-table="#units-table"
              data-export-filename="unidades"
            >EXPORTAR A EXCEL</button>
          </header>

          <div class="unit-filter-bar">
            <label>Buscar en
              <select id="unit-filter-field">
                <option value="all">Todos</option>
                <option value="vin">VIN</option>
                <option value="version">Versión</option>
                <option value="marca">Marca</option>
                <option value="oc_mexrac">OC</option>
                <option value="concesionario">Concesionario</option>
              </select>
            </label>
            <label>Filtro
              <input id="unit-filter" type="search" autocomplete="off" placeholder="Ejemplo: *ASD" />
            </label>
            <span id="unit-filter-count">${units.length} unidades</span>
          </div>

          <div class="table-frame">
            <table id="units-table" class="units-table">
              <thead>
                <tr>
                  <th class="unit-oc">OC</th>
                  <th>VIN</th>
                  <th>Número de motor</th>
                  <th>Modelo</th>
                  <th>Marca</th>
                  <th>Versión</th>
                  <th>Concesionario</th>
                  <th>Factura</th>
                  <th>Ingreso a patio</th>
                  <th>Vencimiento concesionario</th>
                  <th class="number-cell">
                    Total
                  </th>
                  <th>Financiamiento</th>
                  <th class="export-ignore">Acciones</th>
                </tr>
              </thead>

              <tbody id="units-body">
                ${unitRows(units)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    `;

    bindTableExportButtons(content);

    let unitDialogOpen = false;
    content.addEventListener("click", async (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".edit-unit, .delete-unit");
      if (!button || unitDialogOpen) return;
      const unit = units.find((item) => item.unitid === Number(button.dataset.unitid));
      if (!unit) return;
      unitDialogOpen = true;
      try {
        if (button.classList.contains("edit-unit")) {
          const edit = await editUnitDialog(unit);
          if (!edit) return;
          if (edit.field === "due") {
            await correctConcessionaireDueDate(
              unit.unitid,
              edit.date,
              byId("active-user").textContent?.trim() ?? "",
              edit.password,
            );
            unit.vencimiento_con = edit.date;
          } else {
            await correctYardDelivery(unit.unitid, edit.date);
            unit.entrega_patio = edit.date || null;
          }
          applyFilter();
          return;
        }

        await checkUnitDeletion(unit.unitid);
        if (!await deletionDialog(unit)) return;
        await deleteUnit(unit.unitid);
        const index = units.findIndex((item) => item.unitid === unit.unitid);
        if (index >= 0) units.splice(index, 1);
        applyFilter();
        window.dispatchEvent(new CustomEvent("sam:data-changed"));
      } catch { /* invokeMutation ya mostró el error */
      } finally {
        unitDialogOpen = false;
      }
    });

    const applyFilter = () => {
      const field = byId<HTMLSelectElement>("unit-filter-field").value as UnitFilterField;
      const filtered = filterUnits(units, field, byId<HTMLInputElement>("unit-filter").value);
      byId<HTMLTableSectionElement>("units-body").innerHTML = unitRows(filtered);
      byId("unit-filter-count").textContent = `${filtered.length} ${filtered.length === 1 ? "unidad" : "unidades"}`;
    };
    byId("unit-filter-field").addEventListener("change", applyFilter);
    byId("unit-filter").addEventListener("input", applyFilter);

    document
      .getElementById("new-acquisition")
      ?.addEventListener("click", () => {
        renderAcquisitions();
      });
  } catch (error) {
    console.error(
      "Unit loading failed:",
      error,
    );

    content.innerHTML = `
      <div class="report-error">
        No fue posible cargar las unidades.
      </div>
    `;
  }
}
