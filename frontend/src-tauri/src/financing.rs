use std::collections::{BTreeSet, HashMap};

use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};

use crate::db::{abrir_bd_escritura, abrir_bd_lectura};
use crate::money::formatear_centavos;
use crate::obligation_state::{saldo_obligacion, validar_obligacion_abierta};
use crate::validation::{dinero_a_centavos, validar_fecha_iso};

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
    monto_aplicado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_calendario: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_materializado: i64,
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
    aplicaciones: Vec<AplicacionEntrada>,
    calendario: Vec<CalendarioEntrada>,
    comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FinanciamientoConfirmado {
    id_finto: i64,
    aplicaciones_guardadas: usize,
    documentos_guardados: usize,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    monto_financiado: i64,
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

#[tauri::command]
pub fn listar_financiamientos() -> Result<Vec<Financiamiento>, String> {
    let conexion = abrir_bd_lectura()?;
    let mut consulta = conexion
        .prepare(
            "
            WITH APLICACIONES AS (
                SELECT ID_FINTO, SUM(MONTO_AMPARADO) AS MONTO
                FROM tblFinAplicaciones
                WHERE ACTIVO = 1
                GROUP BY ID_FINTO
            ),
            CALENDARIO AS (
                SELECT ID_FINTO, SUM(MONTO) AS MONTO
                FROM tblFinCalendario
                WHERE ACTIVO = 1
                GROUP BY ID_FINTO
            ),
            MATERIALIZADO AS (
                SELECT ID_FINTO, SUM(MONTO) AS MONTO
                FROM tblDoctosXPagar
                WHERE ENTITY = 'FIN'
                  AND ACTIVO = 1
                  AND ID_FINTO IS NOT NULL
                GROUP BY ID_FINTO
            )
            SELECT
                F.ID_FINTO,
                F.ID_FIN,
                FI.RAZON_SOCIAL,
                F.FOLIO,
                F.EMISION,
                F.MONTO_CUPONES,
                F.CUPONES,
                F.MONTO_BALLOON,
                COALESCE(A.MONTO, 0),
                COALESCE(C.MONTO, 0),
                COALESCE(M.MONTO, 0),
                F.COMENTARIOS
            FROM tblFinanciamientos AS F
            INNER JOIN tblFinancieras AS FI ON FI.ID_FIN = F.ID_FIN
            LEFT JOIN APLICACIONES AS A ON A.ID_FINTO = F.ID_FINTO
            LEFT JOIN CALENDARIO AS C ON C.ID_FINTO = F.ID_FINTO
            LEFT JOIN MATERIALIZADO AS M ON M.ID_FINTO = F.ID_FINTO
            WHERE F.ACTIVO = 1
            ORDER BY F.EMISION, F.ID_FINTO
            ",
        )
        .map_err(|error| format!("No fue posible preparar financiamientos: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(Financiamiento {
                id_finto: fila.get(0)?,
                id_fin: fila.get(1)?,
                financiera: fila.get(2)?,
                folio: fila.get(3)?,
                emision: fila.get(4)?,
                monto_cupones: fila.get(5)?,
                cupones: fila.get(6)?,
                monto_balloon: fila.get(7)?,
                monto_aplicado: fila.get(8)?,
                monto_calendario: fila.get(9)?,
                monto_materializado: fila.get(10)?,
                comentarios: fila.get(11)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar financiamientos: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer financiamientos: {error}"))
}

#[tauri::command]
pub fn listar_obligaciones_financiables() -> Result<Vec<ObligacionFinanciable>, String> {
    let conexion = abrir_bd_lectura()?;
    let mut consulta = conexion
        .prepare(
            "
            WITH SALDOS AS (
                SELECT
                    D.OBLIGACION_ID,
                    D.ENTITY,
                    D.ENTITY_ID,
                    D.UNIT_ID,
                    D.VENCIMIENTO,
                    D.MONTO,
                    D.PAGADO,
                    D.MONTO
                    - COALESCE((
                        SELECT SUM(FA.MONTO_AMPARADO)
                        FROM tblFinAplicaciones AS FA
                        WHERE FA.ID_DPP = D.OBLIGACION_ID
                          AND FA.ACTIVO = 1
                    ), 0)
                    - COALESCE((
                        SELECT SUM(AA.MONTO)
                        FROM tblAplicacionesAbonos AS AA
                        WHERE AA.OBLIGACION_ID = D.OBLIGACION_ID
                          AND AA.ACTIVO = 1
                    ), 0) AS SALDO
                FROM tblDoctosXPagar AS D
                WHERE D.ACTIVO = 1
            )
            SELECT
                S.OBLIGACION_ID,
                S.ENTITY,
                S.ENTITY_ID,
                CASE
                    WHEN S.ENTITY = 'CON' THEN C.NAME_
                    ELSE FI.RAZON_SOCIAL
                END AS ACREEDOR,
                S.UNIT_ID,
                U.VIN,
                S.VENCIMIENTO,
                S.MONTO,
                S.SALDO
            FROM SALDOS AS S
            LEFT JOIN tblConcesionarios AS C
              ON S.ENTITY = 'CON' AND C.ID_CON = S.ENTITY_ID
            LEFT JOIN tblFinancieras AS FI
              ON S.ENTITY = 'FIN' AND FI.ID_FIN = S.ENTITY_ID
            LEFT JOIN tblUnits AS U ON U.UNITID = S.UNIT_ID
            WHERE S.PAGADO = 0
              AND S.SALDO > 0
            ORDER BY S.VENCIMIENTO, S.OBLIGACION_ID
            ",
        )
        .map_err(|error| format!("No fue posible preparar obligaciones financiables: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(ObligacionFinanciable {
                obligacion_id: fila.get(0)?,
                entity: fila.get(1)?,
                entity_id: fila.get(2)?,
                acreedor: fila.get(3)?,
                unit_id: fila.get(4)?,
                vin: fila.get(5)?,
                vencimiento: fila.get(6)?,
                monto_original: fila.get(7)?,
                saldo: fila.get(8)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar obligaciones financiables: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer obligaciones financiables: {error}"))
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

    if monto_cupones <= 0 {
        return Err("El monto de cupones debe ser mayor que cero".to_string());
    }

    let monto_financiamiento = monto_cupones
        .checked_add(monto_balloon)
        .ok_or_else(|| "El monto del financiamiento es demasiado grande".to_string())?;

    if entrada.aplicaciones.is_empty() {
        return Err("El financiamiento debe tener aplicaciones".to_string());
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

    if total_aplicaciones != monto_financiamiento {
        return Err(format!(
            "El financiamiento es {}, pero las aplicaciones suman {}",
            formatear_centavos(monto_financiamiento),
            formatear_centavos(total_aplicaciones)
        ));
    }

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

    let financiera: Option<i64> = transaccion
        .query_row(
            "SELECT ID_FIN FROM tblFinancieras WHERE ID_FIN = ?1 AND ACTIVO = 1",
            [entrada.id_fin],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible validar la financiera: {error}"))?;

    if financiera.is_none() {
        return Err(format!(
            "La financiera {} no existe o está inactiva",
            entrada.id_fin
        ));
    }

    let folio_existente: Option<i64> = transaccion
        .query_row(
            "SELECT ID_FINTO FROM tblFinanciamientos WHERE ID_FIN = ?1 AND FOLIO = ?2",
            params![entrada.id_fin, folio],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible validar el folio: {error}"))?;

    if folio_existente.is_some() {
        return Err("Ya existe ese folio para la financiera seleccionada".to_string());
    }

    let mut saldos_origen = HashMap::new();

    for (obligacion_id, monto_aplicado) in &aplicado_por_obligacion {
        let saldo = validar_obligacion_abierta(&transaccion, *obligacion_id)?;

        if *monto_aplicado > saldo {
            return Err(format!(
                "La obligación {obligacion_id} tiene saldo {}, pero se intentan financiar {}",
                formatear_centavos(saldo),
                formatear_centavos(*monto_aplicado)
            ));
        }

        saldos_origen.insert(*obligacion_id, saldo);
    }

    transaccion
        .execute(
            "
            INSERT INTO tblFinanciamientos (
                ID_FIN, FOLIO, EMISION, MONTO_CUPONES,
                CUPONES, MONTO_BALLOON, ACTIVO, COMENTARIOS
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
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
        .map_err(|error| format!("No fue posible guardar el financiamiento: {error}"))?;

    let id_finto = transaccion.last_insert_rowid();

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
                    VENCIMIENTO, MONTO, PAGADO, ACTIVO, COMENTARIOS
                )
                VALUES ('FIN', ?1, ?2, ?3, NULL, ?4, ?5, 0, 1, ?6)
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

    for (obligacion_id, monto_aplicado) in &aplicado_por_obligacion {
        let saldo_final = saldos_origen[obligacion_id] - *monto_aplicado;

        transaccion
            .execute(
                "UPDATE tblDoctosXPagar SET PAGADO = ?1 WHERE OBLIGACION_ID = ?2",
                params![if saldo_final == 0 { 1 } else { 0 }, obligacion_id],
            )
            .map_err(|error| format!("No fue posible actualizar la obligación origen: {error}"))?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar el financiamiento: {error}"))?;

    Ok(FinanciamientoConfirmado {
        id_finto,
        aplicaciones_guardadas: aplicaciones.len(),
        documentos_guardados: calendario.len(),
        monto_financiado: monto_financiamiento,
    })
}

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
            "SELECT DISTINCT ID_DPP FROM tblFinAplicaciones WHERE ID_FINTO = ?1 AND ACTIVO = 1",
        )
        .map_err(|error| format!("No fue posible preparar obligaciones origen: {error}"))?;

    let obligaciones_origen = consulta_origen
        .query_map([id_finto], |fila| fila.get::<_, i64>(0))
        .map_err(|error| format!("No fue posible consultar obligaciones origen: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer obligaciones origen: {error}"))?;

    drop(consulta_origen);

    let comentario = format!("CANCELADO: {motivo}");

    for (tabla, filtro) in [
        ("tblFinanciamientos", "ID_FINTO = ?2"),
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

    for obligacion_id in obligaciones_origen {
        let saldo = saldo_obligacion(&transaccion, obligacion_id)?
            .ok_or_else(|| format!("No se pudo reconstruir la obligación {obligacion_id}"))?;

        transaccion
            .execute(
                "UPDATE tblDoctosXPagar SET PAGADO = ?1 WHERE OBLIGACION_ID = ?2",
                params![if saldo == 0 { 1 } else { 0 }, obligacion_id],
            )
            .map_err(|error| format!("No fue posible restaurar la obligación origen: {error}"))?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible cancelar el financiamiento: {error}"))
}
