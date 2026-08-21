function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replaceAll('"', '""');
  return `"${text}"`;
}

export async function exportTableToExcel(table: HTMLTableElement | null, filename: string): Promise<void> {
  if (!table) return;

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))
    .filter((row) => row.offsetParent !== null)
    .map((row) =>
      Array.from(row.querySelectorAll<HTMLTableCellElement>("th, td"))
        .filter((cell) => !cell.classList.contains("export-ignore"))
        .map((cell) => {
          const input = cell.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
          return csvCell(input ? input.value : cell.innerText);
        })
        .join(","),
    );

  const archivo = await exportTable(filename.replace(/\.csv$/i, ""), `\ufeff${rows.join("\r\n")}`);
  await messageDialog(
    `El archivo '${archivo.nombre}' se almacenó en '${archivo.ruta}'.`,
    "Archivo exportado",
    "Cerrar",
  );
}

export function bindTableExportButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-export-table]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selector = button.dataset.exportTable;
      const filename = button.dataset.exportFilename || "sam-export";
      const table = selector ? root.querySelector<HTMLTableElement>(selector) ?? document.querySelector<HTMLTableElement>(selector) : null;
      try {
        await exportTableToExcel(table, filename);
      } catch {
        // La capa de API ya mostró el error al usuario.
      }
    });
  });
}
import { exportTable } from "../api.ts";
import { messageDialog } from "./message.ts";
