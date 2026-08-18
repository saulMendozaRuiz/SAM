use rusqlite::{params, OptionalExtension, TransactionBehavior};

use crate::db::abrir_bd_escritura;
use crate::obligation_state::restaurar_saldo;
use crate::unit_state::liberar_financiamiento;

use super::texto_requerido;

#[tauri::command]
pub fn cancelar_financiamiento(id_finto: i64, motivo: String) -> Result<(), String> {
    let motivo = texto_requerido(&motivo, "motivo de cancelación")?;
    let mut conexion = abrir_bd_escritura()?;
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    let activo: Option<i64> = transaccion
        .query_row(
            "SELECT ID_FINTO FROM tblFinanciamientos WHERE ID_FINTO = ?1 AND ACTIVO = 1",
            [id_finto],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible validar el financiamiento: {error}"))?;

    if activo.is_none() {
        return Err(format!(
            "El financiamiento {id_finto} no existe o ya está cancelado"
        ));
    }

    let documento_con_abonos: Option<i64> = transaccion
        .query_row(
            "
            SELECT D.OBLIGACION_ID
            FROM tblDoctosXPagar AS D
            WHERE D.ID_FINTO = ?1
              AND D.ENTITY = 'FIN'
              AND D.ACTIVO = 1
              AND EXISTS (
                  SELECT 1
                  FROM tblAplicacionesAbonos AS AA
                  WHERE AA.OBLIGACION_ID = D.OBLIGACION_ID
                    AND AA.ACTIVO = 1
              )
            LIMIT 1
            ",
            [id_finto],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible revisar los abonos: {error}"))?;

    if let Some(obligacion_id) = documento_con_abonos {
        return Err(format!(
            "No puede cancelarse el financiamiento {id_finto}: la obligación generada {obligacion_id} ya tiene abonos"
        ));
    }

    let financiamiento_descendiente: Option<(i64, i64)> = transaccion
        .query_row(
            "
            SELECT HIJO.ID_FINTO, ORIGEN.OBLIGACION_ID
            FROM tblDoctosXPagar AS ORIGEN
            INNER JOIN tblFinAplicaciones AS APLICACION
                ON APLICACION.ID_DPP = ORIGEN.OBLIGACION_ID
               AND APLICACION.ACTIVO = 1
            INNER JOIN tblFinanciamientos AS HIJO
                ON HIJO.ID_FINTO = APLICACION.ID_FINTO
               AND HIJO.ACTIVO = 1
            WHERE ORIGEN.ID_FINTO = ?1
              AND ORIGEN.ENTITY = 'FIN'
              AND ORIGEN.ACTIVO = 1
            LIMIT 1
            ",
            [id_finto],
            |fila| Ok((fila.get(0)?, fila.get(1)?)),
        )
        .optional()
        .map_err(|error| format!("No fue posible revisar refinanciamientos: {error}"))?;

    if let Some((id_hijo, obligacion_id)) = financiamiento_descendiente {
        return Err(format!(
            "No puede cancelarse el financiamiento {id_finto}: la obligación {obligacion_id} es origen del financiamiento activo {id_hijo}"
        ));
    }

    let mut consulta_origen = transaccion
        .prepare(
            "SELECT ID_DPP, SUM(MONTO_AMPARADO)
             FROM tblFinAplicaciones
             WHERE ID_FINTO = ?1 AND ACTIVO = 1
             GROUP BY ID_DPP",
        )
        .map_err(|error| format!("No fue posible preparar obligaciones origen: {error}"))?;

    let aplicaciones_origen = consulta_origen
        .query_map([id_finto], |fila| {
            Ok((fila.get::<_, i64>(0)?, fila.get::<_, i64>(1)?))
        })
        .map_err(|error| format!("No fue posible consultar obligaciones origen: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer obligaciones origen: {error}"))?;

    drop(consulta_origen);

    let mut consulta_unidades = transaccion
        .prepare(
            "SELECT UNIT_ID FROM tblFinanciamientoUnidades
             WHERE ID_FINTO = ?1 AND ACTIVO = 1",
        )
        .map_err(|error| format!("No fue posible preparar las unidades financiadas: {error}"))?;
    let unidades_financiadas = consulta_unidades
        .query_map([id_finto], |fila| fila.get::<_, i64>(0))
        .map_err(|error| format!("No fue posible consultar las unidades financiadas: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer una unidad financiada: {error}"))?;
    drop(consulta_unidades);

    let comentario = format!("CANCELADO: {motivo}");

    for (tabla, filtro) in [
        ("tblFinanciamientos", "ID_FINTO = ?2"),
        ("tblFinanciamientoUnidades", "ID_FINTO = ?2 AND ACTIVO = 1"),
        ("tblFinAplicaciones", "ID_FINTO = ?2 AND ACTIVO = 1"),
        ("tblFinCalendario", "ID_FINTO = ?2 AND ACTIVO = 1"),
        (
            "tblDoctosXPagar",
            "ID_FINTO = ?2 AND ENTITY = 'FIN' AND ACTIVO = 1",
        ),
    ] {
        let sentencia = format!(
            "UPDATE {tabla}
             SET ACTIVO = 0,
                 ERASED_AT = CURRENT_TIMESTAMP,
                 COMENTARIOS = COALESCE(COMENTARIOS || ' | ', '') || ?1
             WHERE {filtro}"
        );

        transaccion
            .execute(&sentencia, params![comentario, id_finto])
            .map_err(|error| format!("No fue posible cancelar registros en {tabla}: {error}"))?;
    }

    for (obligacion_id, monto_restaurado) in aplicaciones_origen {
        restaurar_saldo(&transaccion, obligacion_id, monto_restaurado)?;
    }

    for unit_id in unidades_financiadas {
        liberar_financiamiento(&transaccion, unit_id)?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible cancelar el financiamiento: {error}"))
}
