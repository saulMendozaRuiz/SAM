export type IsoDate = string;
export type Money = number;

export interface AuthenticatedUser {
  id_usuario: number;
  usuario: string;
}

export interface Unit {
  unitid: number;
  id_con: number;
  concesionario: string;
  vin: string;
  no_motor: string | null;
  modelo_anio: number;
  marca: string;
  version: string;
  oc_mexrac: string | null;
  folio_factura: string | null;
  subtotal: Money;
  iva: Money;
  total: Money;
  entrega_patio: IsoDate | null;
  financiado: boolean;
  vencimiento_con: IsoDate | null;
  comentarios: string | null;
}

export interface Concessionaire {
  id_con: number;
  name: string;
  cluster: string | null;
  rfc: string;
  comentarios: string | null;
}

export interface FinancialInstitution {
  id_fin: number;
  razon_social: string;
  rfc: string;
  comentarios: string | null;
}

export interface FinanceableObligation {
  obligacion_id: number;
  entity: "CON" | "FIN";
  entity_id: number;
  acreedor: string;
  unit_id: number | null;
  vin: string | null;
  oc_mexrac: string | null;
  vencimiento: IsoDate;
  monto_original: Money;
  saldo: Money;
}

export interface Obligation extends FinanceableObligation {
  financiado: Money;
  abonado: Money;
  pagado: boolean;
}

export interface DebtSummary { entity: "CON" | "FIN"; entity_id: number; acreedor: string | null; saldo: Money }
export interface UncoveredUnit { unitid: number; vin: string; marca: string; version: string; concesionario: string; deuda_original: Money; financiado: Money; abonado: Money; saldo: Money }
export type DueDateClassification =
  | "VENCIDO CONCESIONARIO"
  | "POR VENCER CONCESIONARIO"
  | "VENCIDO FINANCIERA"
  | "POR VENCER FINANCIERA";
export interface DueDate { obligacion_id: number; entity: "CON" | "FIN"; entity_id: number; acreedor: string | null; vencimiento: IsoDate; saldo: Money; clasificacion: DueDateClassification }
export interface Reports { debtSummary: DebtSummary[]; uncoveredUnits: UncoveredUnit[]; dueDates: DueDate[] }
export interface CalendarItem { id_cupon: number; id_finto: number; financiera: string; folio: string; serie_pago: number; vencimiento: IsoDate; monto: Money; is_balloon: boolean; obligacion_id: number | null; abonado: Money; saldo: Money }

export interface Financing {
  id_finto: number;
  id_fin: number;
  financiera: string;
  folio: string;
  emision: IsoDate;
  monto_cupones: Money;
  cupones: number;
  monto_balloon: Money;
  capital_t0: Money;
  total_pagares: Money;
  diferencia_contractual: Money;
  monto_calendario: Money;
  monto_materializado: Money;
  unidades_financiadas: number;
  comentarios: string | null;
}

export interface FinancingScheduleRow {
  serie_pago: number;
  vencimiento: IsoDate;
  monto: string;
  is_balloon: 0 | 1;
}

export interface FinancingPayload {
  id_fin: number;
  folio: string;
  emision: IsoDate;
  monto_cupones: string;
  monto_balloon: string;
  capital_t0: string;
  aplicaciones: Array<{ obligacion_id: number; monto: string }>;
  unidades: Array<{
    unit_id: number;
    monto_asignado: string;
    pago_directo_con: boolean;
  }>;
  calendario: FinancingScheduleRow[];
  comentarios: string | null;
  total: string;
}

export interface FinancingConfirmed {
  id_finto: number;
  aplicaciones_guardadas: number;
  documentos_guardados: number;
  capital_t0: Money;
  total_pagares: Money;
  diferencia_contractual: Money;
}

export interface FinancingApplicationState extends FinanceableObligation {
  selected: boolean;
  amount: string;
  directPayment: boolean;
}

export interface FinancingFormState {
  applications: FinancingApplicationState[];
  schedule: FinancingScheduleRow[];
  scheduleSignature: string | null;
  idFin: string;
  folio: string;
  emision: string;
  montoCupones: string;
  montoBalloon: string;
  capitalT0: string;
  comments: string;
}

export interface AcquisitionInput {
  idCon: number | string;
  vin: string;
  noMotor?: string;
  modeloAnio: number | string;
  marca: string;
  version: string;
  ocMexrac?: string;
  folioFactura?: string;
  subtotal: string;
  iva: string;
  total: string;
  entregaPatio?: IsoDate;
  vencimiento: IsoDate;
  comentarios?: string;
}

export interface AcquisitionConfirmed {
  unitids: number[];
  unidades_guardadas: number;
  obligaciones_guardadas: number;
  monto_obligaciones: Money;
}
