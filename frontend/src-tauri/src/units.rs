use crate::{auth, db, validation::validar_fecha_iso};
use rusqlite::{Connection, TransactionBehavior};
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
    use super::corregir_en_conexion;
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
}
