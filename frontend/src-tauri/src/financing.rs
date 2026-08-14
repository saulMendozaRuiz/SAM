use std::collections::{BTreeSet, HashMap};

use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

use crate::db::{abrir_bd_escritura, abrir_bd_lectura};

#[derive(Debug, Serialize)]
pub struct Financiamiento {
    id_finto: i64,
    id_fin: i64,
    financiera: String,
    folio: String,
    emision: String,
    monto_cupones: f64,
    cupones: i64,
    monto_balloon: f64,
    monto_aplicado: f64,
    monto_calendario: f64,
    monto_materializado: f64,
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
    monto_original: f64,
    saldo: f64,
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
    monto_financiado: String,
}

fn dinero_a_centavos(valor: &str, campo: &str) -> Result<i64, String> {
    let limpio = valor.trim().replace(',', "");

    if limpio.is_empty() {
        return Err(format!("El campo {campo} es obligatorio"));
    }

    if limpio.starts_with('-') {
        return Err(format!("El campo {campo} no puede ser negativo"));
    }

    let partes: Vec<&str> = limpio.split('.').collect();

    if partes.len() > 2 {
        return Err(format!("El importe de {campo} no es válido"));
    }

    let enteros = partes[0];

    if enteros.is_empty() || !enteros.chars().all(|caracter| caracter.is_ascii_digit()) {
        return Err(format!("El importe de {campo} no es válido"));
    }

    let decimales = if partes.len() == 2 { partes[1] } else { "" };

    if decimales.len() > 2 || !decimales.chars().all(|caracter| caracter.is_ascii_digit()) {
        return Err(format!(
            "El importe de {campo} debe tener máximo dos decimales"
        ));
    }

    let pesos: i64 = enteros
        .parse()
        .map_err(|_| format!("El importe de {campo} es demasiado grande"))?;

    let centavos = match decimales.len() {
        0 => 0,
        1 => {
            decimales
                .parse::<i64>()
                .map_err(|_| format!("El importe de {campo} no es válido"))?
                * 10
        }
        2 => decimales
            .parse::<i64>()
            .map_err(|_| format!("El importe de {campo} no es válido"))?,
        _ => unreachable!(),
    };

    pesos
        .checked_mul(100)
        .and_then(|resultado| resultado.checked_add(centavos))
        .ok_or_else(|| format!("El importe de {campo} es demasiado grande"))
}

fn centavos_a_decimal(centavos: i64) -> String {
    format!("{}.{:02}", centavos / 100, centavos % 100)
}

fn numero_a_centavos(valor: f64) -> Result<i64, String> {
    if !valor.is_finite() {
        return Err("Se encontró un importe no numérico en SQLite".to_string());
    }

    Ok((valor * 100.0).round() as i64)
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

fn es_bisiesto(anio: i32) -> bool {
    (anio % 4 == 0 && anio % 100 != 0) || anio % 400 == 0
}

fn validar_fecha_iso(valor: &str, campo: &str) -> Result<String, String> {
    let limpio = valor.trim();
    let partes: Vec<&str> = limpio.split('-').collect();

    if partes.len() != 3 || partes[0].len() != 4 || partes[1].len() != 2 || partes[2].len() != 2 {
        return Err(format!("{campo} debe utilizar el formato YYYY-MM-DD"));
    }

    let anio: i32 = partes[0]
        .parse()
        .map_err(|_| format!("{campo} no es una fecha válida"))?;
    let mes: u32 = partes[1]
        .parse()
        .map_err(|_| format!("{campo} no es una fecha válida"))?;
    let dia: u32 = partes[2]
        .parse()
        .map_err(|_| format!("{campo} no es una fecha válida"))?;

    let dias_mes = match mes {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if es_bisiesto(anio) => 29,
        2 => 28,
        _ => 0,
    };

    if anio < 1 || dia == 0 || dia > dias_mes {
        return Err(format!("{campo} no es una fecha válida"));
    }

    Ok(limpio.to_string())
}

fn saldo_obligacion(
    transaccion: &Transaction<'_>,
    obligacion_id: i64,
) -> Result<Option<i64>, String> {
    let valor: Option<f64> = transaccion
        .query_row(
            "
            SELECT
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
                ), 0)
            FROM tblDoctosXPagar AS D
            WHERE D.OBLIGACION_ID = ?1
              AND D.ACTIVO = 1
            ",
            [obligacion_id],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| {
            format!("No fue posible reconstruir la obligación {obligacion_id}: {error}")
        })?;

    valor.map(numero_a_centavos).transpose()
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
            WHERE S.SALDO > 0.005
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

    let mut aplicaciones = Vec::new();
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

        aplicaciones.push((aplicacion.obligacion_id, monto));
    }

    if total_aplicaciones != monto_financiamiento {
        return Err(format!(
            "El financiamiento es {}, pero las aplicaciones suman {}",
            centavos_a_decimal(monto_financiamiento),
            centavos_a_decimal(total_aplicaciones)
        ));
    }

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
            centavos_a_decimal(total_ordinario),
            centavos_a_decimal(monto_cupones)
        ));
    }

    if total_balloon != monto_balloon {
        return Err(format!(
            "El calendario balloon suma {}, pero MONTO_BALLOON es {}",
            centavos_a_decimal(total_balloon),
            centavos_a_decimal(monto_balloon)
        ));
    }

    if (monto_balloon > 0 && cantidad_balloon != 1) || (monto_balloon == 0 && cantidad_balloon != 0)
    {
        return Err("El calendario debe contener exactamente el balloon capturado".to_string());
    }

    let mut conexion = abrir_bd_escritura()?;
    let transaccion = conexion
        .transaction()
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
        let saldo = saldo_obligacion(&transaccion, *obligacion_id)?
            .ok_or_else(|| format!("La obligación {obligacion_id} no existe o está inactiva"))?;

        if *monto_aplicado > saldo {
            return Err(format!(
                "La obligación {obligacion_id} tiene saldo {}, pero se intentan financiar {}",
                centavos_a_decimal(saldo),
                centavos_a_decimal(*monto_aplicado)
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
                centavos_a_decimal(monto_cupones),
                cantidad_cupones as i64,
                centavos_a_decimal(monto_balloon),
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
                params![
                    id_finto,
                    obligacion_id,
                    centavos_a_decimal(*monto),
                    comentarios,
                ],
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
                    centavos_a_decimal(*monto),
                    is_balloon,
                    documento,
                ],
            )
            .map_err(|error| format!("No fue posible guardar el calendario: {error}"))?;

        transaccion
            .execute(
                "
                INSERT INTO tblDoctosXPagar (
                    ENTITY, ENTITY_ID, ID_FINTO, UNIT_ID,
                    VENCIMIENTO, MONTO, PAGADO, ACTIVO, COMENTARIOS
                )
                VALUES ('FIN', ?1, ?2, NULL, ?3, ?4, 0, 1, ?5)
                ",
                params![
                    entrada.id_fin,
                    id_finto,
                    vencimiento,
                    centavos_a_decimal(*monto),
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
        monto_financiado: centavos_a_decimal(monto_financiamiento),
    })
}

#[tauri::command]
pub fn cancelar_financiamiento(id_finto: i64, motivo: String) -> Result<(), String> {
    let motivo = texto_requerido(&motivo, "motivo de cancelación")?;
    let mut conexion = abrir_bd_escritura()?;
    let transaccion = conexion
        .transaction()
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
