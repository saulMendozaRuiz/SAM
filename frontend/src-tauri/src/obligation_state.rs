use rusqlite::{OptionalExtension, Transaction};

fn validar_estado(obligacion_id: i64, pagado: i64, saldo_centavos: i64) -> Result<i64, String> {
    if pagado != 0 && pagado != 1 {
        return Err(format!(
            "La obligación {obligacion_id} tiene un estado PAGADO inválido: {pagado}"
        ));
    }

    if saldo_centavos < 0 {
        return Err(format!(
            "La obligación {obligacion_id} tiene saldo negativo; se bloqueó la operación"
        ));
    }

    match (pagado, saldo_centavos) {
        (1, 0) => Err(format!(
            "La obligación {obligacion_id} está pagada y no admite nuevas operaciones"
        )),
        (1, _) => Err(format!(
            "La obligación {obligacion_id} está marcada como pagada, pero conserva saldo; se bloqueó la operación"
        )),
        (0, 0) => Err(format!(
            "La obligación {obligacion_id} tiene saldo cero, pero no está marcada como pagada; se bloqueó la operación"
        )),
        (0, saldo) => Ok(saldo),
        _ => unreachable!(),
    }
}

pub fn validar_obligacion_abierta(
    transaccion: &Transaction<'_>,
    obligacion_id: i64,
) -> Result<i64, String> {
    let estado: Option<(i64, i64)> = transaccion
        .query_row(
            "
            SELECT
                D.PAGADO,
                D.SALDO
            FROM tblDoctosXPagar AS D
            WHERE D.OBLIGACION_ID = ?1
              AND D.ACTIVO = 1
            ",
            [obligacion_id],
            |fila| Ok((fila.get(0)?, fila.get(1)?)),
        )
        .optional()
        .map_err(|error| {
            format!("No fue posible validar la obligación {obligacion_id}: {error}")
        })?;

    let (pagado, saldo) = estado
        .ok_or_else(|| format!("La obligación {obligacion_id} no existe o no está activa"))?;

    validar_estado(obligacion_id, pagado, saldo)
}

#[cfg(test)]
mod tests {
    use super::validar_estado;

    #[test]
    fn permite_solamente_obligaciones_abiertas_con_saldo() {
        assert_eq!(validar_estado(1, 0, 100).unwrap(), 100);
        assert!(validar_estado(1, 1, 0).unwrap_err().contains("pagada"));
        assert!(validar_estado(1, 1, 100)
            .unwrap_err()
            .contains("conserva saldo"));
        assert!(validar_estado(1, 0, 0).unwrap_err().contains("saldo cero"));
        assert!(validar_estado(1, 0, -1)
            .unwrap_err()
            .contains("saldo negativo"));
    }
}
