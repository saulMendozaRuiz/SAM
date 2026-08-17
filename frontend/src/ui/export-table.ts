function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replaceAll('"', '""');
  return `"${text}"`;
}

export function exportTableToExcel(table: HTMLTableElement | null, filename: string): void {
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

  const blob = new Blob(["\ufeff", rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function bindTableExportButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-export-table]").forEach((button) => {
    button.addEventListener("click", () => {
      const selector = button.dataset.exportTable;
      const filename = button.dataset.exportFilename || "sam-export";
      const table = selector ? root.querySelector<HTMLTableElement>(selector) ?? document.querySelector<HTMLTableElement>(selector) : null;
      exportTableToExcel(table, filename);
    });
  });
}
