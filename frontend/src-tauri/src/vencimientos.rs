use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};

use crate::{
    db::abrir_bd_escritura, obligation_state::validar_obligacion_abierta,
    validation::validar_fecha_iso,
};

struct ObligacionVencimiento {
    entity: String,
    id_cupon: Option<i64>,
    vencimiento: String,
}

fn corregir_en_transaccion(
    transaccion: &Transaction<'_>,
    obligacion_id: i64,
    nuevo_vencimiento: &str,
    motivo: &str,
) -> Result<(), String> {
    if obligacion_id <= 0 {
        return Err("OBLIGACION_ID debe ser mayor que cero".to_string());
    }

    let nuevo_vencimiento = validar_fecha_iso(nuevo_vencimiento, "VENCIMIENTO_NUEVO")?;
    let motivo = motivo.trim();
    if motivo.is_empty() {
        return Err("MOTIVO es obligatorio".to_string());
    }
    if motivo.chars().count() > 500 {
        return Err("MOTIVO no puede exceder 500 caracteres".to_string());
    }

    validar_obligacion_abierta(transaccion, obligacion_id)?;

    let obligacion: ObligacionVencimiento = transaccion
        .query_row(
            "
            SELECT ENTITY, ID_CUPON, VENCIMIENTO
            FROM tblDoctosXPagar
            WHERE OBLIGACION_ID = ?1
              AND ACTIVO = 1
            ",
            [obligacion_id],
            |fila| {
                Ok(ObligacionVencimiento {
                    entity: fila.get(0)?,
                    id_cupon: fila.get(1)?,
                    vencimiento: fila.get(2)?,
                })
            },
        )
        .map_err(|error| format!("No fue posible leer la obligacion {obligacion_id}: {error}"))?;

    if obligacion.vencimiento == nuevo_vencimiento {
        return Err("El nuevo vencimiento es igual al vencimiento actual".to_string());
    }

    match obligacion.entity.as_str() {
        "CON" if obligacion.id_cupon.is_some() => {
            return Err(format!(
                "La obligacion {obligacion_id} de concesionario tiene un cupon inesperado"
            ));
        }
        "CON" => {}
        "FIN" => {
            let id_cupon = obligacion.id_cupon.ok_or_else(|| {
                format!("La obligacion financiera {obligacion_id} no tiene ID_CUPON")
            })?;
            let vencimiento_calendario: Option<String> = transaccion
                .query_row(
                    "
                    SELECT VENCIMIENTO
                    FROM tblFinCalendario
                    WHERE ID_CUPON = ?1
                      AND ACTIVO = 1
                    ",
                    [id_cupon],
                    |fila| fila.get(0),
                )
                .optional()
                .map_err(|error| format!("No fue posible validar el cupon {id_cupon}: {error}"))?;

            match vencimiento_calendario {
                None => {
                    return Err(format!(
                        "El cupon {id_cupon} no existe o no esta activo; se bloqueo la correccion"
                    ));
                }
                Some(fecha) if fecha != obligacion.vencimiento => {
                    return Err(format!(
                        "La obligacion {obligacion_id} y el cupon {id_cupon} tienen vencimientos distintos"
                    ));
                }
                Some(_) => {}
            }
        }
        _ => {
            return Err(format!(
                "La obligacion {obligacion_id} tiene un tipo no reconocido"
            ));
        }
    }

    transaccion
        .execute(
            "
            INSERT INTO tblCambiosVencimiento (
                OBLIGACION_ID, ID_CUPON, VENCIMIENTO_ANTERIOR,
                VENCIMIENTO_NUEVO, MOTIVO
            )
            VALUES (?1, ?2, ?3, ?4, ?5)
            ",
            params![
                obligacion_id,
                obligacion.id_cupon,
                obligacion.vencimiento,
                nuevo_vencimiento,
                motivo,
            ],
        )
        .map_err(|error| format!("No fue posible registrar el cambio de vencimiento: {error}"))?;

    let documentos_actualizados = transaccion
        .execute(
            "
            UPDATE tblDoctosXPagar
            SET VENCIMIENTO = ?1
            WHERE OBLIGACION_ID = ?2
              AND VENCIMIENTO = ?3
              AND PAGADO = 0
              AND ACTIVO = 1
            ",
            params![nuevo_vencimiento, obligacion_id, obligacion.vencimiento,],
        )
        .map_err(|error| format!("No fue posible actualizar la obligacion: {error}"))?;

    if documentos_actualizados != 1 {
        return Err("La obligacion cambio durante la operacion; no se actualizo".to_string());
    }

    if let Some(id_cupon) = obligacion.id_cupon {
        let cupones_actualizados = transaccion
            .execute(
                "
                UPDATE tblFinCalendario
                SET VENCIMIENTO = ?1
                WHERE ID_CUPON = ?2
                  AND VENCIMIENTO = ?3
                  AND ACTIVO = 1
                ",
                params![nuevo_vencimiento, id_cupon, obligacion.vencimiento],
            )
            .map_err(|error| format!("No fue posible actualizar el calendario: {error}"))?;

        if cupones_actualizados != 1 {
            return Err("El calendario cambio durante la operacion; no se actualizo".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn corregir_vencimiento(
    obligacion_id: i64,
    nuevo_vencimiento: String,
    motivo: String,
) -> Result<(), String> {
    let mut conexion = abrir_bd_escritura()?;
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la correccion de vencimiento: {error}"))?;

    corregir_en_transaccion(&transaccion, obligacion_id, &nuevo_vencimiento, &motivo)?;

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar el cambio de vencimiento: {error}"))
}

#[cfg(test)]
mod tests {
    use super::corregir_en_transaccion;
    use rusqlite::{Connection, TransactionBehavior};

    fn conexion_prueba() -> Connection {
        let conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(
                "
                PRAGMA foreign_keys = ON;
                CREATE TABLE tblFinCalendario (
                    ID_CUPON INTEGER PRIMARY KEY,
                    VENCIMIENTO TEXT NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                CREATE TABLE tblDoctosXPagar (
                    OBLIGACION_ID INTEGER PRIMARY KEY,
                    ENTITY TEXT NOT NULL,
                    ID_CUPON INTEGER,
                    VENCIMIENTO TEXT NOT NULL,
                    MONTO INTEGER NOT NULL,
                    PAGADO INTEGER NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                CREATE TABLE tblFinAplicaciones (
                    ID_DPP INTEGER NOT NULL,
                    MONTO_AMPARADO INTEGER NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                CREATE TABLE tblAplicacionesAbonos (
                    OBLIGACION_ID INTEGER NOT NULL,
                    MONTO INTEGER NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                CREATE TABLE tblCambiosVencimiento (
                    ID_CAMBIO INTEGER PRIMARY KEY,
                    OBLIGACION_ID INTEGER NOT NULL,
                    ID_CUPON INTEGER,
                    VENCIMIENTO_ANTERIOR TEXT NOT NULL,
                    VENCIMIENTO_NUEVO TEXT NOT NULL,
                    MOTIVO TEXT NOT NULL,
                    CREATED_AT TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CHECK (VENCIMIENTO_ANTERIOR <> VENCIMIENTO_NUEVO)
                );
                ",
            )
            .unwrap();
        conexion
    }

    #[test]
    fn corrige_obligacion_abierta_y_deja_historial() {
        let mut conexion = conexion_prueba();
        conexion
            .execute_batch(
                "INSERT INTO tblDoctosXPagar VALUES (1, 'CON', NULL, '2026-09-01', 10000, 0, 1);",
            )
            .unwrap();

        let tx = conexion
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        corregir_en_transaccion(&tx, 1, "2026-10-15", "Prorroga autorizada").unwrap();
        tx.commit().unwrap();

        let fecha: String = conexion
            .query_row(
                "SELECT VENCIMIENTO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 1",
                [],
                |f| f.get(0),
            )
            .unwrap();
        let historial: (String, String, String) = conexion
            .query_row(
                "SELECT VENCIMIENTO_ANTERIOR, VENCIMIENTO_NUEVO, MOTIVO FROM tblCambiosVencimiento",
                [],
                |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)),
            )
            .unwrap();
        assert_eq!(fecha, "2026-10-15");
        assert_eq!(
            historial,
            (
                "2026-09-01".into(),
                "2026-10-15".into(),
                "Prorroga autorizada".into()
            )
        );
    }

    #[test]
    fn sincroniza_documento_financiero_y_calendario() {
        let mut conexion = conexion_prueba();
        conexion
            .execute_batch(
                "
            INSERT INTO tblFinCalendario VALUES (20, '2026-09-01', 1);
            INSERT INTO tblDoctosXPagar VALUES (2, 'FIN', 20, '2026-09-01', 10000, 0, 1);
            ",
            )
            .unwrap();

        let tx = conexion.transaction().unwrap();
        corregir_en_transaccion(&tx, 2, "2026-11-01", "Convenio").unwrap();
        tx.commit().unwrap();

        let fechas: (String, String) = conexion.query_row(
            "SELECT D.VENCIMIENTO, C.VENCIMIENTO FROM tblDoctosXPagar D JOIN tblFinCalendario C ON C.ID_CUPON = D.ID_CUPON WHERE D.OBLIGACION_ID = 2",
            [],
            |f| Ok((f.get(0)?, f.get(1)?)),
        ).unwrap();
        assert_eq!(fechas, ("2026-11-01".into(), "2026-11-01".into()));
    }

    #[test]
    fn permite_corregir_el_saldo_parcialmente_financiado() {
        let mut conexion = conexion_prueba();
        conexion
            .execute_batch(
                "
                INSERT INTO tblDoctosXPagar VALUES (5, 'CON', NULL, '2026-09-01', 10000, 0, 1);
                INSERT INTO tblFinAplicaciones VALUES (5, 4000, 1);
                ",
            )
            .unwrap();

        let tx = conexion.transaction().unwrap();
        corregir_en_transaccion(&tx, 5, "2026-10-01", "Prorroga del saldo insoluto").unwrap();
        tx.commit().unwrap();

        let fecha: String = conexion
            .query_row(
                "SELECT VENCIMIENTO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 5",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(fecha, "2026-10-01");
    }

    #[test]
    fn bloquea_pagada_y_revierte_cualquier_cambio() {
        let mut conexion = conexion_prueba();
        conexion
            .execute_batch(
                "INSERT INTO tblDoctosXPagar VALUES (3, 'CON', NULL, '2026-09-01', 10000, 1, 1);
             INSERT INTO tblAplicacionesAbonos VALUES (3, 10000, 1);",
            )
            .unwrap();

        let tx = conexion.transaction().unwrap();
        assert!(corregir_en_transaccion(&tx, 3, "2026-12-01", "No procede").is_err());
        drop(tx);

        let cambios: i64 = conexion
            .query_row("SELECT COUNT(*) FROM tblCambiosVencimiento", [], |f| {
                f.get(0)
            })
            .unwrap();
        let fecha: String = conexion
            .query_row(
                "SELECT VENCIMIENTO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 3",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(cambios, 0);
        assert_eq!(fecha, "2026-09-01");
    }

    #[test]
    fn bloquea_inconsistencia_entre_documento_y_calendario() {
        let mut conexion = conexion_prueba();
        conexion
            .execute_batch(
                "
            INSERT INTO tblFinCalendario VALUES (30, '2026-09-02', 1);
            INSERT INTO tblDoctosXPagar VALUES (4, 'FIN', 30, '2026-09-01', 10000, 0, 1);
            ",
            )
            .unwrap();

        let tx = conexion.transaction().unwrap();
        let error = corregir_en_transaccion(&tx, 4, "2026-12-01", "Correccion").unwrap_err();
        assert!(error.contains("vencimientos distintos"));
    }
}
