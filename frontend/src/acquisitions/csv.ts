import { pastedCell } from "./paste.ts";

export type AcquisitionCsvRow = Record<string, string>;

const columns: Record<string, string> = {
  vin: "vin",
  no_motor: "engine",
  modelo_anio: "year",
  marca: "brand",
  version: "version",
  folio_factura: "invoice",
  subtotal: "subtotal",
  iva: "vat",
  total: "total",
  entrega_patio: "delivery",
  vencimiento: "dueDate",
  comentarios: "comments",
};

const required = ["vin", "modelo_anio", "marca", "version", "subtotal", "iva", "total", "vencimiento"];

function parse(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === "") quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("El CSV contiene una celda con comillas sin cerrar");
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function acquisitionRowsFromCsv(source: string): AcquisitionCsvRow[] {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const rows = parse(text, firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
  if (rows.length < 2) throw new Error("El CSV no contiene unidades");

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}`);

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length) throw new Error(`La fila ${rowIndex + 2} tiene columnas adicionales`);
    const result: AcquisitionCsvRow = {};
    headers.forEach((header, index) => {
      const field = columns[header];
      if (field) result[field] = pastedCell(field, values[index] ?? "");
    });
    return result;
  });
}
