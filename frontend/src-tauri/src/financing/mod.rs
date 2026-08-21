use serde::{Deserialize, Serialize};

pub(crate) mod cancel;
pub(crate) mod confirm;
pub(crate) mod queries;

#[derive(Debug, Serialize)]
pub struct Financiamiento {
    id_finto: i64,
    id_fin: i64,
    financiera: String,
    folio: String,
    emision: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_cupones: i64,
    cupones: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_balloon: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    capital_t0: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    total_pagares: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    diferencia_contractual: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_calendario: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_materializado: i64,
    unidades_financiadas: i64,
    comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ObligacionFinanciable {
    obligacion_id: i64,
    entity: String,
    entity_id: i64,
    acreedor: String,
    unit_id: Option<i64>,
    vin: Option<String>,
    oc_mexrac: Option<String>,
    vencimiento: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_original: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    saldo: i64,
}

#[derive(Debug, Deserialize)]
pub struct AplicacionEntrada {
    obligacion_id: i64,
    monto: String,
}

#[derive(Debug, Deserialize)]
pub struct UnidadFinanciamientoEntrada {
    unit_id: i64,
    monto_asignado: String,
    pago_directo_con: bool,
}

#[derive(Debug, Deserialize)]
pub struct CalendarioEntrada {
    serie_pago: i64,
    vencimiento: String,
    monto: String,
    is_balloon: i64,
}

#[derive(Debug, Deserialize)]
pub struct FinanciamientoEntrada {
    id_fin: i64,
    folio: String,
    emision: String,
    monto_cupones: String,
    monto_balloon: String,
    capital_t0: String,
    #[serde(default)]
    aplicaciones: Vec<AplicacionEntrada>,
    #[serde(default)]
    unidades: Vec<UnidadFinanciamientoEntrada>,
    calendario: Vec<CalendarioEntrada>,
    comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FinanciamientoConfirmado {
    id_finto: i64,
    aplicaciones_guardadas: usize,
    documentos_guardados: usize,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    capital_t0: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    total_pagares: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    diferencia_contractual: i64,
}

fn texto_requerido(valor: &str, campo: &str) -> Result<String, String> {
    let limpio = valor.trim();

    if limpio.is_empty() {
        return Err(format!("El campo {campo} es obligatorio"));
    }

    Ok(limpio.to_string())
}

fn texto_opcional(valor: Option<String>) -> Option<String> {
    valor.and_then(|texto| {
        let limpio = texto.trim();

        if limpio.is_empty() {
            None
        } else {
            Some(limpio.to_string())
        }
    })
}
