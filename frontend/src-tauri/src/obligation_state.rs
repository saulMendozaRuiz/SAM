use rusqlite::{params, OptionalExtension, Transaction};

pub fn aplicar_monto(
    transaccion: &Transaction<'_>,
    obligacion_id: i64,
    monto: i64,
) -> Result<i64, String> {
    if monto <= 0 {
        return Err("El monto aplicado debe ser positivo".to_string());
    }

    let saldo: Option<i64> = transaccion
        .query_row(
            "UPDATE tblDoctosXPagar
             SET SALDO = SALDO - ?1,
                 PAGADO = CASE WHEN SALDO - ?1 = 0 THEN 1 ELSE 0 END
             WHERE OBLIGACION_ID = ?2
               AND ACTIVO = 1
               AND PAGADO = 0
               AND SALDO >= ?1
             RETURNING SALDO",
            params![monto, obligacion_id],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| {
            format!("No fue posible aplicar el monto a la obligación {obligacion_id}: {error}")
        })?;

    saldo.ok_or_else(|| {
        format!("La obligación {obligacion_id} no está abierta o no tiene saldo suficiente")
    })
}

pub fn restaurar_saldo(
    transaccion: &Transaction<'_>,
    obligacion_id: i64,
    monto: i64,
) -> Result<(), String> {
    if monto <= 0 {
        return Err("El monto restaurado debe ser positivo".to_string());
    }

    let actualizadas = transaccion
        .execute(
            "UPDATE tblDoctosXPagar
             SET SALDO = SALDO + ?1, PAGADO = 0
             WHERE OBLIGACION_ID = ?2 AND ACTIVO = 1",
            params![monto, obligacion_id],
        )
        .map_err(|error| {
            format!("No fue posible restaurar la obligación {obligacion_id}: {error}")
        })?;

    if actualizadas != 1 {
        return Err(format!(
            "No se pudo restaurar la obligación {obligacion_id}"
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{aplicar_monto, restaurar_saldo};
    use rusqlite::Connection;

    fn conexion_prueba() -> Connection {
        let conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(
                "CREATE TABLE tblDoctosXPagar (
                    OBLIGACION_ID INTEGER PRIMARY KEY,
                    SALDO INTEGER NOT NULL,
                    PAGADO INTEGER NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                INSERT INTO tblDoctosXPagar VALUES (1, 100, 0, 1);",
            )
            .unwrap();
        conexion
    }

    #[test]
    fn pagado_es_el_guardian_autoritativo() {
        let mut conexion = conexion_prueba();
        conexion
            .execute(
                "UPDATE tblDoctosXPagar SET PAGADO = 1 WHERE OBLIGACION_ID = 1",
                [],
            )
            .unwrap();
        let tx = conexion.transaction().unwrap();

        assert!(aplicar_monto(&tx, 1, 1).is_err());
    }

    #[test]
    fn aplicar_monto_actualiza_saldo_y_pagado_juntos() {
        let mut conexion = conexion_prueba();
        let tx = conexion.transaction().unwrap();

        assert_eq!(aplicar_monto(&tx, 1, 100).unwrap(), 0);
        let pagada: (i64, i64) = tx
            .query_row(
                "SELECT SALDO, PAGADO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 1",
                [],
                |fila| Ok((fila.get(0)?, fila.get(1)?)),
            )
            .unwrap();
        assert_eq!(pagada, (0, 1));

        restaurar_saldo(&tx, 1, 40).unwrap();
        let saldo: i64 = tx
            .query_row(
                "SELECT SALDO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 1",
                [],
                |fila| fila.get(0),
            )
            .unwrap();
        assert_eq!(saldo, 40);
    }

    #[test]
    fn no_permite_aplicar_mas_que_el_saldo() {
        let mut conexion = conexion_prueba();
        let tx = conexion.transaction().unwrap();

        assert!(aplicar_monto(&tx, 1, 101).is_err());
        let saldo: i64 = tx
            .query_row(
                "SELECT SALDO FROM tblDoctosXPagar WHERE OBLIGACION_ID = 1",
                [],
                |fila| fila.get(0),
            )
            .unwrap();
        assert_eq!(saldo, 100);
    }
}
