use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};

use crate::db::abrir_bd_escritura;
use crate::validation::{dinero_a_centavos, validar_fecha_iso};

#[derive(Debug, Deserialize)]
pub struct UnidadAdquisicion {
    pub id_con: i64,
    pub vin: String,
    pub no_motor: Option<String>,
    pub modelo_anio: i64,
    pub marca: String,
    pub version: String,
    pub oc_mexrac: Option<String>,
    pub folio_factura: Option<String>,
    pub subtotal: String,
    pub iva: String,
    pub total: String,
    pub entrega_patio: Option<String>,
    pub vencimiento: String,
    pub comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdquisicionConfirmada {
    pub unitids: Vec<i64>,
    pub unidades_guardadas: usize,
    pub obligaciones_guardadas: usize,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub monto_obligaciones: i64,
}

fn texto_requerido(valor: &str, campo: &str) -> Result<String, String> {
    let limpio = valor.trim();

    if limpio.is_empty() {
        return Err(format!("El campo {campo} es obligatorio",));
    }

    Ok(limpio.to_uppercase())
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

#[tauri::command]
pub fn confirmar_adquisicion(
    unidades: Vec<UnidadAdquisicion>,
) -> Result<AdquisicionConfirmada, String> {
    let mut conexion = abrir_bd_escritura()?;
    confirmar_en_conexion(&mut conexion, unidades)
}

fn confirmar_en_conexion(
    conexion: &mut Connection,
    unidades: Vec<UnidadAdquisicion>,
) -> Result<AdquisicionConfirmada, String> {
    if unidades.is_empty() {
        return Err("La adquisición debe contener al menos una unidad".to_string());
    }

    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    let mut vins_capturados = std::collections::HashSet::new();

    let mut unitids = Vec::new();
    let mut monto_total_centavos = 0_i64;

    for (indice, unidad) in unidades.iter().enumerate() {
        let numero = indice + 1;

        let vin = texto_requerido(&unidad.vin, &format!("VIN de la unidad {numero}"))?;

        if !vins_capturados.insert(vin.clone()) {
            return Err(format!(
                "El VIN {vin} está repetido dentro de la adquisición",
            ));
        }

        if unidad.modelo_anio <= 0 {
            return Err(format!("El modelo del VIN {vin} no es válido",));
        }

        let marca = texto_requerido(&unidad.marca, &format!("marca del VIN {vin}"))?;

        let version = texto_requerido(&unidad.version, &format!("versión del VIN {vin}"))?;

        let vencimiento =
            validar_fecha_iso(&unidad.vencimiento, &format!("VENCIMIENTO del VIN {vin}"))?;

        let subtotal_centavos = dinero_a_centavos(&unidad.subtotal, "subtotal")?;

        let iva_centavos = dinero_a_centavos(&unidad.iva, "IVA")?;

        let total_centavos = dinero_a_centavos(&unidad.total, "total")?;

        if total_centavos <= 0 {
            return Err(format!("El total del VIN {vin} debe ser mayor que cero",));
        }

        if subtotal_centavos + iva_centavos != total_centavos {
            return Err(format!(
                "El subtotal más IVA del VIN {vin} no coincide con el total",
            ));
        }

        monto_total_centavos = monto_total_centavos
            .checked_add(total_centavos)
            .ok_or_else(|| "El monto total de la adquisición es demasiado grande".to_string())?;

        let no_motor = texto_opcional(unidad.no_motor.clone()).map(|texto| texto.to_uppercase());

        let oc_mexrac = texto_opcional(unidad.oc_mexrac.clone());

        let folio_factura = texto_opcional(unidad.folio_factura.clone());

        let entrega_patio = texto_opcional(unidad.entrega_patio.clone())
            .map(|fecha| validar_fecha_iso(&fecha, &format!("ENTREGA_PATIO del VIN {vin}")))
            .transpose()?;

        let comentarios = texto_opcional(unidad.comentarios.clone());

        let unidades_insertadas = transaccion
            .execute(
                "
                INSERT INTO tblUnits (
                    ID_CON,
                    VIN,
                    NO_MOTOR,
                    MODELO_ANIO,
                    MARCA,
                    VERSION_,
                    OC_MEXRAC,
                    FOLIO_FACTURA,
                    SUBTOTAL,
                    IVA,
                    TOTAL,
                    ENTREGA_PATIO,
                    COMENTARIOS
                )
                SELECT
                    ?1, ?2, ?3, ?4, ?5,
                    ?6, ?7, ?8, ?9, ?10,
                    ?11, ?12, ?13
                FROM tblConcesionarios
                WHERE ID_CON = ?1 AND ACTIVO = 1
                ",
                params![
                    unidad.id_con,
                    vin,
                    no_motor,
                    unidad.modelo_anio,
                    marca,
                    version,
                    oc_mexrac,
                    folio_factura,
                    subtotal_centavos,
                    iva_centavos,
                    total_centavos,
                    entrega_patio,
                    comentarios,
                ],
            )
            .map_err(|error| {
                if error
                    .to_string()
                    .contains("UNIQUE constraint failed: tblUnits.VIN")
                {
                    format!("El VIN {vin} ya existe en la base de datos")
                } else {
                    format!("No fue posible guardar el VIN {vin}: {error}")
                }
            })?;

        if unidades_insertadas != 1 {
            return Err(format!(
                "El concesionario {} no existe o está inactivo",
                unidad.id_con
            ));
        }

        let unitid = transaccion.last_insert_rowid();

        unitids.push(unitid);

        transaccion
            .execute(
                "
                INSERT INTO tblDoctosXPagar (
                    ENTITY,
                    ENTITY_ID,
                    UNIT_ID,
                    VENCIMIENTO,
                    MONTO,
                    SALDO,
                    PAGADO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES (
                    'CON',
                    ?1,
                    ?2,
                    ?3,
                    ?4,
                    ?4,
                    0,
                    1,
                    ?5
                )
                ",
                params![
                    unidad.id_con,
                    unitid,
                    vencimiento,
                    total_centavos,
                    "ADQUISICION VEHICULO",
                ],
            )
            .map_err(|error| {
                format!(
                    "No fue posible crear la obligación del VIN {}: {}",
                    unidad.vin, error,
                )
            })?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar la adquisición: {error}"))?;

    let cantidad = unitids.len();

    Ok(AdquisicionConfirmada {
        unitids,
        unidades_guardadas: cantidad,
        obligaciones_guardadas: cantidad,
        monto_obligaciones: monto_total_centavos,
    })
}

#[cfg(test)]
mod tests {
    use super::{confirmar_en_conexion, UnidadAdquisicion};
    use rusqlite::Connection;

    fn unidad(vin: &str, total: &str) -> UnidadAdquisicion {
        UnidadAdquisicion {
            id_con: 1,
            vin: vin.to_string(),
            no_motor: None,
            modelo_anio: 2026,
            marca: "MARCA".to_string(),
            version: "VERSION".to_string(),
            oc_mexrac: None,
            folio_factura: None,
            subtotal: "100.00".to_string(),
            iva: "16.00".to_string(),
            total: total.to_string(),
            entrega_patio: None,
            vencimiento: "2026-09-30".to_string(),
            comentarios: None,
        }
    }

    #[test]
    fn una_fila_invalida_revierte_toda_la_carga() {
        let mut conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .unwrap();
        conexion
            .execute(
                "INSERT INTO tblConcesionarios (ID_CON, NAME_, RFC) VALUES (1, 'DEMO', 'DEM010101AAA')",
                [],
            )
            .unwrap();

        let resultado = confirmar_en_conexion(
            &mut conexion,
            vec![
                unidad("VIN-CORRECTO", "116.00"),
                unidad("VIN-INVALIDO", "115.00"),
            ],
        );

        assert!(resultado.is_err());
        let unidades: i64 = conexion
            .query_row("SELECT COUNT(*) FROM tblUnits", [], |fila| fila.get(0))
            .unwrap();
        let obligaciones: i64 = conexion
            .query_row("SELECT COUNT(*) FROM tblDoctosXPagar", [], |fila| {
                fila.get(0)
            })
            .unwrap();
        assert_eq!((unidades, obligaciones), (0, 0));
    }
}
