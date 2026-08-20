use crate::{auth, db, validation::validar_fecha_iso};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Unidad {
    unitid: i64,
    id_con: i64,
    concesionario: String,
    vin: String,
    no_motor: Option<String>,
    modelo_anio: i64,
    marca: String,
    version: String,
    oc_mexrac: Option<String>,
    folio_factura: Option<String>,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    subtotal: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    iva: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    total: i64,
    entrega_patio: Option<String>,
    financiado: bool,
    vencimiento_con: Option<String>,
    comentarios: Option<String>,
}

#[tauri::command]
pub fn listar_unidades() -> Result<Vec<Unidad>, String> {
    let conexion = db::abrir_bd_lectura()?;

    let mut consulta = conexion
        .prepare(
            "
            SELECT
                U.UNITID,
                U.ID_CON,
                C.NAME_,
                U.VIN,
                U.NO_MOTOR,
                U.MODELO_ANIO,
                U.MARCA,
                U.VERSION_,
                U.OC_MEXRAC,
                U.FOLIO_FACTURA,
                U.SUBTOTAL,
                U.IVA,
                U.TOTAL,
                U.ENTREGA_PATIO,
                U.FINANCIADO,
                (
                    SELECT D.VENCIMIENTO
                    FROM tblDoctosXPagar AS D
                    WHERE D.ENTITY = 'CON' AND D.UNIT_ID = U.UNITID AND D.ACTIVO = 1
                    ORDER BY D.OBLIGACION_ID
                    LIMIT 1
                ),
                U.COMENTARIOS
            FROM tblUnits AS U
            INNER JOIN tblConcesionarios AS C
                ON C.ID_CON = U.ID_CON
            WHERE U.ACTIVO = 1
            ORDER BY U.UNITID
            ",
        )
        .map_err(|error| format!("No fue posible preparar la consulta de unidades: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(Unidad {
                unitid: fila.get(0)?,
                id_con: fila.get(1)?,
                concesionario: fila.get(2)?,
                vin: fila.get(3)?,
                no_motor: fila.get(4)?,
                modelo_anio: fila.get(5)?,
                marca: fila.get(6)?,
                version: fila.get(7)?,
                oc_mexrac: fila.get(8)?,
                folio_factura: fila.get(9)?,
                subtotal: fila.get(10)?,
                iva: fila.get(11)?,
                total: fila.get(12)?,
                entrega_patio: fila.get(13)?,
                financiado: fila.get::<_, i64>(14)? == 1,
                vencimiento_con: fila.get(15)?,
                comentarios: fila.get(16)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar las unidades: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer las unidades: {error}"))
}

#[tauri::command]
pub fn corregir_vencimiento_con(
    unitid: i64,
    vencimiento: String,
    usuario: String,
    contrasena: String,
) -> Result<(), String> {
    let mut conexion = db::abrir_bd_escritura()?;
    corregir_en_conexion(&mut conexion, unitid, &vencimiento, &usuario, &contrasena)
}

#[tauri::command]
pub fn corregir_entrega_patio(unitid: i64, entrega_patio: String) -> Result<(), String> {
    let mut conexion = db::abrir_bd_escritura()?;
    corregir_entrega_en_conexion(&mut conexion, unitid, &entrega_patio)
}

fn corregir_entrega_en_conexion(
    conexion: &mut Connection,
    unitid: i64,
    entrega_patio: &str,
) -> Result<(), String> {
    let entrega_patio = if entrega_patio.trim().is_empty() {
        None
    } else {
        Some(validar_fecha_iso(entrega_patio, "INGRESO A PATIO")?)
    };
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la corrección: {error}"))?;
    let modificadas = transaccion
        .execute(
            "UPDATE tblUnits
             SET ENTREGA_PATIO = ?1, UPDATED_AT = CURRENT_TIMESTAMP
             WHERE UNITID = ?2 AND ACTIVO = 1",
            (entrega_patio.as_deref(), unitid),
        )
        .map_err(|error| format!("No fue posible corregir el ingreso a patio: {error}"))?;
    if modificadas != 1 {
        return Err("La unidad no existe o está inactiva".to_string());
    }
    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar el ingreso a patio: {error}"))
}

const UNIDAD_CON_COMPROMISOS: &str = "No se puede eliminar esta unidad porque tiene financiamientos, refinanciamientos o abonos asociados.";

fn asegurar_eliminable(conexion: &Connection, unitid: i64) -> Result<(), String> {
    let activa: Option<i64> = conexion
        .query_row(
            "SELECT UNITID FROM tblUnits WHERE UNITID = ?1 AND ACTIVO = 1",
            [unitid],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible revisar la unidad: {error}"))?;
    if activa.is_none() {
        return Err("La unidad no existe o ya fue eliminada".to_string());
    }

    let movimientos: i64 = conexion
        .query_row(
            "SELECT EXISTS (
                SELECT 1 FROM tblFinanciamientoUnidades FU WHERE FU.UNIT_ID = ?1
                UNION ALL
                SELECT 1
                FROM tblFinAplicaciones FA
                JOIN tblDoctosXPagar D ON D.OBLIGACION_ID = FA.ID_DPP
                WHERE D.UNIT_ID = ?1
                UNION ALL
                SELECT 1
                FROM tblAplicacionesAbonos AA
                JOIN tblDoctosXPagar D ON D.OBLIGACION_ID = AA.OBLIGACION_ID
                WHERE D.UNIT_ID = ?1
            )",
            [unitid],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible revisar los compromisos de la unidad: {error}"))?;

    let documentos: (i64, i64) = conexion
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE
                        WHEN ENTITY = 'CON' AND ACTIVO = 1 AND PAGADO = 0 AND SALDO = MONTO
                        THEN 1 ELSE 0 END), 0)
             FROM tblDoctosXPagar
             WHERE UNIT_ID = ?1",
            [unitid],
            |fila| Ok((fila.get(0)?, fila.get(1)?)),
        )
        .map_err(|error| format!("No fue posible revisar los documentos de la unidad: {error}"))?;

    let solo_documento_original = documentos.0 == 0 || documentos == (1, 1);
    if movimientos != 0 || !solo_documento_original {
        return Err(UNIDAD_CON_COMPROMISOS.to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn verificar_eliminacion_unidad(unitid: i64) -> Result<(), String> {
    let conexion = db::abrir_bd_lectura()?;
    asegurar_eliminable(&conexion, unitid)
}

#[tauri::command]
pub fn eliminar_unidad(unitid: i64) -> Result<(), String> {
    let mut conexion = db::abrir_bd_escritura()?;
    eliminar_en_conexion(&mut conexion, unitid)
}

fn eliminar_en_conexion(conexion: &mut Connection, unitid: i64) -> Result<(), String> {
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la eliminación: {error}"))?;

    asegurar_eliminable(&transaccion, unitid)?;

    transaccion
        .execute(
            "UPDATE tblDoctosXPagar
             SET ACTIVO = 0,
                 ERASED_AT = CURRENT_TIMESTAMP,
                 UPDATED_AT = CURRENT_TIMESTAMP,
                 COMENTARIOS = COALESCE(COMENTARIOS || ' | ', '') || 'UNIDAD ELIMINADA'
             WHERE UNIT_ID = ?1 AND ENTITY = 'CON' AND ACTIVO = 1",
            [unitid],
        )
        .map_err(|error| format!("No fue posible retirar la obligación original: {error}"))?;

    let modificadas = transaccion
        .execute(
            "UPDATE tblUnits
             SET ACTIVO = 0,
                 ERASED_AT = CURRENT_TIMESTAMP,
                 UPDATED_AT = CURRENT_TIMESTAMP
             WHERE UNITID = ?1 AND ACTIVO = 1",
            [unitid],
        )
        .map_err(|error| format!("No fue posible eliminar la unidad: {error}"))?;
    if modificadas != 1 {
        return Err("La unidad no existe o ya fue eliminada".to_string());
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar la eliminación: {error}"))
}

fn corregir_en_conexion(
    conexion: &mut Connection,
    unitid: i64,
    vencimiento: &str,
    usuario: &str,
    contrasena: &str,
) -> Result<(), String> {
    auth::validar_contrasena(conexion, usuario, contrasena)?;
    let vencimiento = validar_fecha_iso(vencimiento, "VENCIMIENTO")?;
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la corrección: {error}"))?;
    let modificados = transaccion
        .execute(
            "UPDATE tblDoctosXPagar
             SET VENCIMIENTO = ?1
             WHERE ENTITY = 'CON' AND UNIT_ID = ?2 AND ACTIVO = 1 AND PAGADO = 0",
            (&vencimiento, unitid),
        )
        .map_err(|error| format!("No fue posible corregir el vencimiento: {error}"))?;
    if modificados != 1 {
        return Err("La unidad no tiene una obligación pendiente con concesionario".to_string());
    }
    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar la corrección: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{
        asegurar_eliminable, corregir_en_conexion, corregir_entrega_en_conexion,
        eliminar_en_conexion,
    };
    use crate::security;
    use rusqlite::Connection;

    #[test]
    fn solo_corrige_el_vencimiento_del_concesionario() {
        let mut conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .unwrap();
        let hash = security::hash_password("secreto").unwrap();
        conexion
            .execute(
                "INSERT INTO tblUsuarios (USUARIO, PASSWORD_HASH) VALUES ('operador', ?1)",
                [hash],
            )
            .unwrap();
        conexion.execute("INSERT INTO tblConcesionarios (ID_CON, NAME_, RFC) VALUES (1, 'DEMO', 'DEM010101AAA')", []).unwrap();
        conexion.execute("INSERT INTO tblUnits (UNITID, ID_CON, VIN, MODELO_ANIO, MARCA, VERSION_, SUBTOTAL, IVA, TOTAL) VALUES (1, 1, 'VIN-1', 2026, 'M', 'V', 100, 16, 116)", []).unwrap();
        conexion.execute("INSERT INTO tblDoctosXPagar (OBLIGACION_ID, ENTITY, ENTITY_ID, UNIT_ID, VENCIMIENTO, MONTO, SALDO) VALUES (1, 'CON', 1, 1, '2026-09-01', 116, 116)", []).unwrap();
        conexion.execute("INSERT INTO tblFinancieras (ID_FIN, RAZON_SOCIAL, RFC) VALUES (1, 'FIN DEMO', 'FIN010101AAA')", []).unwrap();
        conexion.execute("INSERT INTO tblFinanciamientos (ID_FINTO, ID_FIN, FOLIO, EMISION, MONTO_CUPONES, CUPONES) VALUES (1, 1, 'F-1', '2026-08-01', 116, 1)", []).unwrap();
        conexion.execute("INSERT INTO tblDoctosXPagar (OBLIGACION_ID, ENTITY, ENTITY_ID, ID_FINTO, VENCIMIENTO, MONTO, SALDO) VALUES (2, 'FIN', 1, 1, '2026-10-01', 116, 116)", []).unwrap();

        corregir_en_conexion(&mut conexion, 1, "2026-09-30", "operador", "secreto").unwrap();
        let fechas: (String, String) = conexion
            .query_row(
                "SELECT MIN(VENCIMIENTO), MAX(VENCIMIENTO) FROM tblDoctosXPagar",
                [],
                |fila| Ok((fila.get(0)?, fila.get(1)?)),
            )
            .unwrap();
        assert_eq!(fechas, ("2026-09-30".to_string(), "2026-10-01".to_string()));
    }

    #[test]
    fn corrige_y_permite_limpiar_el_ingreso_a_patio() {
        let mut conexion = unidad_con_obligacion_original();
        corregir_entrega_en_conexion(&mut conexion, 1, "2026-08-20").unwrap();
        let fecha: Option<String> = conexion
            .query_row(
                "SELECT ENTREGA_PATIO FROM tblUnits WHERE UNITID = 1",
                [],
                |fila| fila.get(0),
            )
            .unwrap();
        assert_eq!(fecha.as_deref(), Some("2026-08-20"));

        corregir_entrega_en_conexion(&mut conexion, 1, "").unwrap();
        let fecha: Option<String> = conexion
            .query_row(
                "SELECT ENTREGA_PATIO FROM tblUnits WHERE UNITID = 1",
                [],
                |fila| fila.get(0),
            )
            .unwrap();
        assert_eq!(fecha, None);
    }

    fn unidad_con_obligacion_original() -> Connection {
        let conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .unwrap();
        conexion.execute("INSERT INTO tblConcesionarios (ID_CON, NAME_, RFC) VALUES (1, 'DEMO', 'DEM010101AAA')", []).unwrap();
        conexion.execute("INSERT INTO tblUnits (UNITID, ID_CON, VIN, MODELO_ANIO, MARCA, VERSION_, SUBTOTAL, IVA, TOTAL) VALUES (1, 1, 'VIN-1', 2026, 'M', 'V', 100, 16, 116)", []).unwrap();
        conexion.execute("INSERT INTO tblDoctosXPagar (OBLIGACION_ID, ENTITY, ENTITY_ID, UNIT_ID, VENCIMIENTO, MONTO, SALDO) VALUES (1, 'CON', 1, 1, '2026-09-01', 116, 116)", []).unwrap();
        conexion
    }

    #[test]
    fn unidad_sin_movimientos_es_eliminable() {
        let mut conexion = unidad_con_obligacion_original();
        asegurar_eliminable(&conexion, 1).unwrap();
        eliminar_en_conexion(&mut conexion, 1).unwrap();

        let estados: (i64, i64) = conexion
            .query_row(
                "SELECT U.ACTIVO, D.ACTIVO FROM tblUnits U JOIN tblDoctosXPagar D ON D.UNIT_ID = U.UNITID WHERE U.UNITID = 1",
                [],
                |fila| Ok((fila.get(0)?, fila.get(1)?)),
            )
            .unwrap();
        assert_eq!(estados, (0, 0));
    }

    #[test]
    fn financiamiento_historico_bloquea_eliminacion() {
        let conexion = unidad_con_obligacion_original();
        conexion.execute("INSERT INTO tblFinancieras (ID_FIN, RAZON_SOCIAL, RFC) VALUES (1, 'FIN', 'FIN010101AAA')", []).unwrap();
        conexion.execute("INSERT INTO tblFinanciamientos (ID_FINTO, ID_FIN, FOLIO, EMISION, MONTO_CUPONES, CUPONES) VALUES (1, 1, 'F-1', '2026-08-01', 116, 1)", []).unwrap();
        conexion.execute("INSERT INTO tblFinanciamientoUnidades (ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON) VALUES (1, 1, 116, 1)", []).unwrap();

        assert_eq!(
            asegurar_eliminable(&conexion, 1).unwrap_err(),
            super::UNIDAD_CON_COMPROMISOS
        );
    }

    #[test]
    fn abono_historico_bloquea_eliminacion() {
        let conexion = unidad_con_obligacion_original();
        conexion
            .execute(
                "INSERT INTO tblAbonos (ID_ABONO, FECHA, MONTO) VALUES (1, '2026-08-20', 10)",
                [],
            )
            .unwrap();
        conexion.execute("INSERT INTO tblAplicacionesAbonos (ABONO_ID, OBLIGACION_ID, MONTO) VALUES (1, 1, 10)", []).unwrap();

        assert_eq!(
            asegurar_eliminable(&conexion, 1).unwrap_err(),
            super::UNIDAD_CON_COMPROMISOS
        );
    }

    #[test]
    fn refinanciamiento_historico_bloquea_eliminacion() {
        let conexion = unidad_con_obligacion_original();
        conexion.execute("INSERT INTO tblFinancieras (ID_FIN, RAZON_SOCIAL, RFC) VALUES (1, 'FIN', 'FIN010101AAA')", []).unwrap();
        conexion.execute("INSERT INTO tblFinanciamientos (ID_FINTO, ID_FIN, FOLIO, EMISION, MONTO_CUPONES, CUPONES) VALUES (1, 1, 'R-1', '2026-08-01', 116, 1)", []).unwrap();
        conexion.execute("INSERT INTO tblFinAplicaciones (ID_FINTO, ID_DPP, MONTO_AMPARADO) VALUES (1, 1, 116)", []).unwrap();

        assert_eq!(
            asegurar_eliminable(&conexion, 1).unwrap_err(),
            super::UNIDAD_CON_COMPROMISOS
        );
    }
}
