use std::collections::{BTreeSet, HashMap};

use rusqlite::{params, OptionalExtension, TransactionBehavior};

use crate::db::abrir_bd_escritura;
use crate::money::formatear_centavos;
use crate::obligation_state::aplicar_monto;
use crate::unit_state::bloquear_financiamiento;
use crate::validation::{dinero_a_centavos, validar_fecha_iso};

use super::{texto_opcional, texto_requerido, FinanciamientoConfirmado, FinanciamientoEntrada};

fn validar_totales_contractuales(
    capital_t0: i64,
    total_pagares: i64,
    total_asignado: i64,
) -> Result<i64, String> {
    if total_asignado != capital_t0 {
        return Err(format!(
            "El capital T0 es {}, pero los montos asignados suman {}",
            formatear_centavos(capital_t0),
            formatear_centavos(total_asignado)
        ));
    }
    if total_pagares < capital_t0 {
        return Err(format!(
            "El total de pagarés {} no puede ser menor que el capital T0 {}",
            formatear_centavos(total_pagares),
            formatear_centavos(capital_t0)
        ));
    }
    Ok(total_pagares - capital_t0)
}

#[tauri::command]
pub fn confirmar_financiamiento(
    entrada: FinanciamientoEntrada,
) -> Result<FinanciamientoConfirmado, String> {
    let folio = texto_requerido(&entrada.folio, "folio")?;
    let emision = validar_fecha_iso(&entrada.emision, "EMISION")?;
    let comentarios = texto_opcional(entrada.comentarios);
    let monto_cupones = dinero_a_centavos(&entrada.monto_cupones, "monto de cupones")?;
    let monto_balloon = dinero_a_centavos(&entrada.monto_balloon, "monto balloon")?;
    let capital_t0 = dinero_a_centavos(&entrada.capital_t0, "capital T0")?;

    if monto_cupones <= 0 {
        return Err("El monto de cupones debe ser mayor que cero".to_string());
    }

    if capital_t0 <= 0 {
        return Err("El capital T0 debe ser mayor que cero".to_string());
    }

    let total_pagares = monto_cupones
        .checked_add(monto_balloon)
        .ok_or_else(|| "El monto del financiamiento es demasiado grande".to_string())?;

    if entrada.aplicaciones.is_empty() && entrada.unidades.is_empty() {
        return Err("El financiamiento debe incluir al menos una unidad u obligacion".to_string());
    }

    if !entrada.aplicaciones.is_empty() && !entrada.unidades.is_empty() {
        return Err(
            "No se pueden mezclar unidades y refinanciamientos en una misma operacion".to_string(),
        );
    }

    if entrada.calendario.is_empty() {
        return Err("El financiamiento debe tener calendario".to_string());
    }

    let mut aplicado_por_obligacion: HashMap<i64, i64> = HashMap::new();
    let mut total_aplicaciones = 0_i64;

    for aplicacion in entrada.aplicaciones {
        if aplicacion.obligacion_id <= 0 {
            return Err("La obligación aplicada no es válida".to_string());
        }

        let monto = dinero_a_centavos(&aplicacion.monto, "monto amparado")?;

        if monto <= 0 {
            return Err("Los montos amparados deben ser positivos".to_string());
        }

        total_aplicaciones = total_aplicaciones
            .checked_add(monto)
            .ok_or_else(|| "La suma de aplicaciones es demasiado grande".to_string())?;

        let acumulado = aplicado_por_obligacion
            .entry(aplicacion.obligacion_id)
            .or_insert(0);
        *acumulado = acumulado
            .checked_add(monto)
            .ok_or_else(|| "La aplicación acumulada es demasiado grande".to_string())?;
    }

    let mut unidades_capturadas = BTreeSet::new();
    let mut unidades = Vec::new();
    let mut total_unidades = 0_i64;

    for unidad in entrada.unidades {
        if unidad.unit_id <= 0 || !unidades_capturadas.insert(unidad.unit_id) {
            return Err(
                "Las unidades del financiamiento no son validas o estan repetidas".to_string(),
            );
        }

        let monto = dinero_a_centavos(&unidad.monto_asignado, "monto asignado a la unidad")?;
        if monto <= 0 {
            return Err("El monto asignado a cada unidad debe ser positivo".to_string());
        }
        total_unidades = total_unidades
            .checked_add(monto)
            .ok_or_else(|| "La suma asignada a unidades es demasiado grande".to_string())?;
        unidades.push((unidad.unit_id, monto, unidad.pago_directo_con));
    }

    let total_origen = if unidades.is_empty() {
        total_aplicaciones
    } else {
        total_unidades
    };

    let diferencia_contractual =
        validar_totales_contractuales(capital_t0, total_pagares, total_origen)?;

    let mut aplicaciones: Vec<(i64, i64)> = aplicado_por_obligacion
        .iter()
        .map(|(obligacion_id, monto)| (*obligacion_id, *monto))
        .collect();
    aplicaciones.sort_unstable_by_key(|(obligacion_id, _)| *obligacion_id);

    let mut calendario = Vec::new();
    let mut series_ordinarias = BTreeSet::new();
    let mut total_ordinario = 0_i64;
    let mut total_balloon = 0_i64;
    let mut cantidad_balloon = 0_usize;

    for renglon in entrada.calendario {
        if renglon.serie_pago <= 0 {
            return Err("SERIE_PAGO debe ser un entero positivo".to_string());
        }

        if renglon.is_balloon != 0 && renglon.is_balloon != 1 {
            return Err("IS_BALLOON solamente admite 0 o 1".to_string());
        }

        let vencimiento = validar_fecha_iso(&renglon.vencimiento, "VENCIMIENTO")?;
        let monto = dinero_a_centavos(&renglon.monto, "monto del calendario")?;

        if monto <= 0 {
            return Err("Los montos del calendario deben ser positivos".to_string());
        }

        if renglon.is_balloon == 1 {
            cantidad_balloon += 1;
            total_balloon = total_balloon
                .checked_add(monto)
                .ok_or_else(|| "La suma balloon es demasiado grande".to_string())?;
        } else {
            if !series_ordinarias.insert(renglon.serie_pago) {
                return Err(format!("El cupón {} está repetido", renglon.serie_pago));
            }
            total_ordinario = total_ordinario
                .checked_add(monto)
                .ok_or_else(|| "La suma de cupones es demasiado grande".to_string())?;
        }

        calendario.push((renglon.serie_pago, vencimiento, monto, renglon.is_balloon));
    }

    let cantidad_cupones = series_ordinarias.len();

    if cantidad_cupones == 0 {
        return Err("Debe existir al menos un cupón ordinario".to_string());
    }

    for esperada in 1..=cantidad_cupones as i64 {
        if !series_ordinarias.contains(&esperada) {
            return Err("La serie de cupones debe ser consecutiva desde 1".to_string());
        }
    }

    if total_ordinario != monto_cupones {
        return Err(format!(
            "Los cupones suman {}, pero MONTO_CUPONES es {}",
            formatear_centavos(total_ordinario),
            formatear_centavos(monto_cupones)
        ));
    }

    if total_balloon != monto_balloon {
        return Err(format!(
            "El calendario balloon suma {}, pero MONTO_BALLOON es {}",
            formatear_centavos(total_balloon),
            formatear_centavos(monto_balloon)
        ));
    }

    if (monto_balloon > 0 && cantidad_balloon != 1) || (monto_balloon == 0 && cantidad_balloon != 0)
    {
        return Err("El calendario debe contener exactamente el balloon capturado".to_string());
    }

    let mut conexion = abrir_bd_escritura()?;
    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    for (unit_id, monto, pago_directo) in &unidades {
        let unidad: Option<(String, i64)> = transaccion
            .query_row(
                "SELECT VIN, ID_CON
                 FROM tblUnits
                 WHERE UNITID = ?1 AND ACTIVO = 1 AND FINANCIADO = 0",
                [unit_id],
                |fila| Ok((fila.get(0)?, fila.get(1)?)),
            )
            .optional()
            .map_err(|error| format!("No fue posible validar la unidad {unit_id}: {error}"))?;
        let (vin, _id_con) = unidad.ok_or_else(|| {
            format!("La unidad {unit_id} no existe, esta inactiva o ya esta financiada")
        })?;

        if *pago_directo {
            let obligacion_id: i64 = transaccion
                .query_row(
                    "SELECT OBLIGACION_ID FROM tblDoctosXPagar
                     WHERE UNIT_ID = ?1 AND ENTITY = 'CON' AND ACTIVO = 1
                     ORDER BY OBLIGACION_ID LIMIT 1",
                    [unit_id],
                    |fila| fila.get(0),
                )
                .optional()
                .map_err(|error| {
                    format!("No fue posible localizar la deuda del VIN {vin}: {error}")
                })?
                .ok_or_else(|| {
                    format!("El VIN {vin} no tiene una obligacion activa con concesionario")
                })?;
            aplicado_por_obligacion.insert(obligacion_id, *monto);
        }
    }

    if !unidades.is_empty() {
        aplicaciones = aplicado_por_obligacion
            .iter()
            .map(|(obligacion_id, monto)| (*obligacion_id, *monto))
            .collect();
        aplicaciones.sort_unstable_by_key(|(obligacion_id, _)| *obligacion_id);
    }

    for (obligacion_id, monto_aplicado) in &aplicado_por_obligacion {
        aplicar_monto(&transaccion, *obligacion_id, *monto_aplicado)?;
    }

    let financiamientos_insertados = transaccion
        .execute(
            "
            INSERT INTO tblFinanciamientos (
                ID_FIN, FOLIO, EMISION, MONTO_CUPONES,
                CUPONES, MONTO_BALLOON, ACTIVO, COMENTARIOS
            )
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, ?7
            FROM tblFinancieras
            WHERE ID_FIN = ?1 AND ACTIVO = 1
            ",
            params![
                entrada.id_fin,
                folio,
                emision,
                monto_cupones,
                cantidad_cupones as i64,
                monto_balloon,
                comentarios,
            ],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                "Ya existe ese folio para la financiera seleccionada".to_string()
            } else {
                format!("No fue posible guardar el financiamiento: {error}")
            }
        })?;

    if financiamientos_insertados != 1 {
        return Err(format!(
            "La financiera {} no existe o está inactiva",
            entrada.id_fin
        ));
    }

    let id_finto = transaccion.last_insert_rowid();

    for (unit_id, monto, pago_directo) in &unidades {
        transaccion
            .execute(
                "INSERT INTO tblFinanciamientoUnidades
                 (ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON, ACTIVO, COMENTARIOS)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                params![
                    id_finto,
                    unit_id,
                    monto,
                    if *pago_directo { 1 } else { 0 },
                    comentarios
                ],
            )
            .map_err(|error| {
                if error.to_string().contains("uq_fin_unidad_activa") {
                    format!("La unidad {unit_id} acaba de ser bloqueada por otro financiamiento")
                } else {
                    format!("No fue posible bloquear la unidad {unit_id}: {error}")
                }
            })?;

        bloquear_financiamiento(&transaccion, *unit_id)?;
    }

    for (obligacion_id, monto) in &aplicaciones {
        transaccion
            .execute(
                "
                INSERT INTO tblFinAplicaciones (
                    ID_FINTO, ID_DPP, MONTO_AMPARADO, ACTIVO, COMENTARIOS
                )
                VALUES (?1, ?2, ?3, 1, ?4)
                ",
                params![id_finto, obligacion_id, monto, comentarios,],
            )
            .map_err(|error| format!("No fue posible guardar una aplicación: {error}"))?;
    }

    for (serie_pago, vencimiento, monto, is_balloon) in &calendario {
        let documento = if *is_balloon == 1 {
            format!("{folio} / BALLOON")
        } else {
            format!("{folio} / CUPON {serie_pago}")
        };

        transaccion
            .execute(
                "
                INSERT INTO tblFinCalendario (
                    ID_FINTO, SERIE_PAGO, VENCIMIENTO,
                    MONTO, IS_BALLOON, ACTIVO, COMENTARIOS
                )
                VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
                ",
                params![
                    id_finto,
                    serie_pago,
                    vencimiento,
                    monto,
                    is_balloon,
                    documento,
                ],
            )
            .map_err(|error| format!("No fue posible guardar el calendario: {error}"))?;

        let id_cupon = transaccion.last_insert_rowid();

        transaccion
            .execute(
                "
                INSERT INTO tblDoctosXPagar (
                    ENTITY, ENTITY_ID, ID_FINTO, ID_CUPON, UNIT_ID,
                    VENCIMIENTO, MONTO, SALDO, PAGADO, ACTIVO, COMENTARIOS
                )
                VALUES ('FIN', ?1, ?2, ?3, NULL, ?4, ?5, ?5, 0, 1, ?6)
                ",
                params![
                    entrada.id_fin,
                    id_finto,
                    id_cupon,
                    vencimiento,
                    monto,
                    documento,
                ],
            )
            .map_err(|error| format!("No fue posible materializar el documento: {error}"))?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar el financiamiento: {error}"))?;

    Ok(FinanciamientoConfirmado {
        id_finto,
        aplicaciones_guardadas: aplicaciones.len(),
        documentos_guardados: calendario.len(),
        capital_t0,
        total_pagares,
        diferencia_contractual,
    })
}

#[cfg(test)]
mod tests {
    use super::validar_totales_contractuales;

    #[test]
    fn acepta_pagares_mayores_que_el_capital_t0() {
        assert_eq!(
            validar_totales_contractuales(100_000_00, 115_000_00, 100_000_00).unwrap(),
            15_000_00
        );
    }

    #[test]
    fn rechaza_asignaciones_que_no_cuadran_con_capital_t0() {
        assert!(validar_totales_contractuales(100_000_00, 115_000_00, 99_000_00).is_err());
    }

    #[test]
    fn rechaza_pagares_menores_que_el_capital_t0() {
        assert!(validar_totales_contractuales(100_000_00, 99_000_00, 100_000_00).is_err());
    }
}
