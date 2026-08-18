use rusqlite::Transaction;

pub fn bloquear_financiamiento(transaccion: &Transaction<'_>, unit_id: i64) -> Result<(), String> {
    let actualizadas = transaccion
        .execute(
            "UPDATE tblUnits
             SET FINANCIADO = 1
             WHERE UNITID = ?1 AND ACTIVO = 1 AND FINANCIADO = 0",
            [unit_id],
        )
        .map_err(|error| format!("No fue posible bloquear la unidad {unit_id}: {error}"))?;

    if actualizadas != 1 {
        return Err(format!(
            "La unidad {unit_id} no está disponible para financiamiento"
        ));
    }

    Ok(())
}

pub fn liberar_financiamiento(transaccion: &Transaction<'_>, unit_id: i64) -> Result<(), String> {
    let actualizadas = transaccion
        .execute(
            "UPDATE tblUnits
             SET FINANCIADO = 0
             WHERE UNITID = ?1 AND FINANCIADO = 1",
            [unit_id],
        )
        .map_err(|error| format!("No fue posible liberar la unidad {unit_id}: {error}"))?;

    if actualizadas != 1 {
        return Err(format!(
            "La unidad {unit_id} no estaba marcada como financiada"
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{bloquear_financiamiento, liberar_financiamiento};
    use rusqlite::Connection;

    #[test]
    fn financiado_bloquea_un_segundo_financiamiento() {
        let mut conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(
                "CREATE TABLE tblUnits (
                    UNITID INTEGER PRIMARY KEY,
                    FINANCIADO INTEGER NOT NULL,
                    ACTIVO INTEGER NOT NULL
                );
                INSERT INTO tblUnits VALUES (1, 0, 1);",
            )
            .unwrap();
        let tx = conexion.transaction().unwrap();

        bloquear_financiamiento(&tx, 1).unwrap();
        assert!(bloquear_financiamiento(&tx, 1).is_err());
        liberar_financiamiento(&tx, 1).unwrap();
        bloquear_financiamiento(&tx, 1).unwrap();
    }
}
