use crate::db;

use rusqlite::{params, OptionalExtension, TransactionBehavior};

use serde::{Deserialize, Serialize};

use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct AplicacionAbonoEntrada {
    pub obligacion_id: i64,
    pub monto: String,
}

#[derive(Debug, Serialize)]
pub struct AbonoRegistrado {
    pub id_abono: i64,
    pub monto: f64,
    pub aplicaciones: usize,
}

fn dinero_a_centavos(valor: &str, nombre: &str) -> Result<i64, String> {
    let valor_limpio = valor.trim();

    if valor_limpio.is_empty() {
        return Err(format!("{nombre} no puede estar vacío"));
    }

    let numero = valor_limpio
        .parse::<f64>()
        .map_err(|_| format!("{nombre} debe ser un número válido"))?;

    if !numero.is_finite() {
        return Err(format!("{nombre} debe ser un número finito"));
    }

    let centavos = (numero * 100.0).round();

    if centavos > i64::MAX as f64 {
        return Err(format!("{nombre} excede el importe permitido"));
    }

    if centavos < i64::MIN as f64 {
        return Err(format!("{nombre} excede el importe permitido"));
    }

    Ok(centavos as i64)
}

fn centavos_a_numero(centavos: i64) -> f64 {
    centavos as f64 / 100.0
}

fn validar_fecha_iso(fecha: &str) -> Result<(), String> {
    let bytes = fecha.as_bytes();

    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(indice, byte)| indice == 4 || indice == 7 || byte.is_ascii_digit())
    {
        return Err("FECHA debe utilizar el formato YYYY-MM-DD".to_string());
    }

    let anio = fecha[0..4]
        .parse::<i32>()
        .map_err(|_| "FECHA contiene un año inválido".to_string())?;

    let mes = fecha[5..7]
        .parse::<u32>()
        .map_err(|_| "FECHA contiene un mes inválido".to_string())?;

    let dia = fecha[8..10]
        .parse::<u32>()
        .map_err(|_| "FECHA contiene un día inválido".to_string())?;

    if anio < 1 || !(1..=12).contains(&mes) {
        return Err("FECHA no es una fecha válida".to_string());
    }

    let bisiesto = anio % 4 == 0 && (anio % 100 != 0 || anio % 400 == 0);

    let dias_del_mes = match mes {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if bisiesto => 29,
        2 => 28,
        _ => 0,
    };

    if dia == 0 || dia > dias_del_mes {
        return Err("FECHA no es una fecha válida".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn registrar_abono(
    fecha: String,
    monto: String,
    referencia: String,
    aplicaciones: Vec<AplicacionAbonoEntrada>,
    comentarios: Option<String>,
) -> Result<AbonoRegistrado, String> {
    validar_fecha_iso(&fecha)?;

    let monto_abono = dinero_a_centavos(&monto, "El monto del abono")?;

    if monto_abono <= 0 {
        return Err("El monto del abono debe ser positivo".to_string());
    }

    if aplicaciones.is_empty() {
        return Err("El abono debe contener aplicaciones".to_string());
    }

    let mut aplicaciones_normalizadas = Vec::with_capacity(aplicaciones.len());

    let mut total_por_obligacion: HashMap<i64, i64> = HashMap::new();

    let mut total_aplicado: i64 = 0;

    for aplicacion in aplicaciones {
        if aplicacion.obligacion_id <= 0 {
            return Err("OBLIGACION_ID debe ser positivo".to_string());
        }

        let monto_aplicado = dinero_a_centavos(&aplicacion.monto, "El monto aplicado")?;

        if monto_aplicado <= 0 {
            return Err("Todos los montos aplicados deben ser positivos".to_string());
        }

        total_aplicado = total_aplicado
            .checked_add(monto_aplicado)
            .ok_or_else(|| "La suma de aplicaciones excede el importe permitido".to_string())?;

        let acumulado = total_por_obligacion
            .entry(aplicacion.obligacion_id)
            .or_insert(0);

        *acumulado = acumulado.checked_add(monto_aplicado).ok_or_else(|| {
            format!(
                "Las aplicaciones de la obligación {} exceden el importe permitido",
                aplicacion.obligacion_id
            )
        })?;

        aplicaciones_normalizadas.push((aplicacion.obligacion_id, monto_aplicado));
    }

    if total_aplicado != monto_abono {
        return Err(format!(
            "El abono es {:.2}, pero sus aplicaciones suman {:.2}",
            centavos_a_numero(monto_abono),
            centavos_a_numero(total_aplicado),
        ));
    }

    let mut conexion = db::abrir_bd_escritura()?;

    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    let resultado = (|| -> Result<AbonoRegistrado, String> {
        let mut saldos_actuales: HashMap<i64, i64> = HashMap::new();

        for (obligacion_id, nueva_aplicacion) in &total_por_obligacion {
            let saldo_bd: Option<f64> = transaccion
                .query_row(
                    r#"
                            SELECT
                                D.MONTO
                                - COALESCE((
                                    SELECT SUM(
                                        FA.MONTO_AMPARADO
                                    )
                                    FROM tblFinAplicaciones AS FA
                                    WHERE
                                        FA.ID_DPP =
                                            D.OBLIGACION_ID
                                        AND FA.ACTIVO = 1
                                ), 0)
                                - COALESCE((
                                    SELECT SUM(AA.MONTO)
                                    FROM tblAplicacionesAbonos AS AA
                                    WHERE
                                        AA.OBLIGACION_ID =
                                            D.OBLIGACION_ID
                                        AND AA.ACTIVO = 1
                                ), 0)
                                AS SALDO
                            FROM tblDoctosXPagar AS D
                            WHERE
                                D.OBLIGACION_ID = ?1
                                AND D.ACTIVO = 1
                            "#,
                    params![obligacion_id],
                    |fila| fila.get(0),
                )
                .optional()
                .map_err(|error| {
                    format!(
                        "No fue posible consultar la obligación {}: {}",
                        obligacion_id, error
                    )
                })?;

            let saldo_bd = saldo_bd.ok_or_else(|| {
                format!("La obligación {} no existe o no está activa", obligacion_id)
            })?;

            let saldo_centavos =
                dinero_a_centavos(&saldo_bd.to_string(), "El saldo de la obligación")?;

            if *nueva_aplicacion > saldo_centavos {
                return Err(format!(
                    "La obligación {} tiene saldo {:.2}, pero se intentan aplicar {:.2}",
                    obligacion_id,
                    centavos_a_numero(saldo_centavos,),
                    centavos_a_numero(*nueva_aplicacion,),
                ));
            }

            saldos_actuales.insert(*obligacion_id, saldo_centavos);
        }

        transaccion
            .execute(
                r#"
                    INSERT INTO tblAbonos (
                        FECHA,
                        MONTO,
                        REFERENCIA,
                        ACTIVO,
                        COMENTARIOS
                    )
                    VALUES (?1, ?2, ?3, 1, ?4)
                    "#,
                params![
                    fecha,
                    centavos_a_numero(monto_abono,),
                    referencia,
                    comentarios,
                ],
            )
            .map_err(|error| format!("No fue posible registrar el abono: {error}"))?;

        let id_abono = transaccion.last_insert_rowid();

        for (obligacion_id, monto_aplicado) in &aplicaciones_normalizadas {
            transaccion
                .execute(
                    r#"
                        INSERT INTO tblAplicacionesAbonos (
                            ABONO_ID,
                            OBLIGACION_ID,
                            MONTO,
                            ACTIVO,
                            COMENTARIOS
                        )
                        VALUES (?1, ?2, ?3, 1, ?4)
                        "#,
                    params![
                        id_abono,
                        obligacion_id,
                        centavos_a_numero(*monto_aplicado,),
                        comentarios,
                    ],
                )
                .map_err(|error| {
                    format!(
                        "No fue posible aplicar el abono a la obligación {}: {}",
                        obligacion_id, error
                    )
                })?;
        }

        for (obligacion_id, monto_nuevo) in &total_por_obligacion {
            let saldo_actual = saldos_actuales.get(obligacion_id).ok_or_else(|| {
                format!(
                    "No fue posible recuperar el saldo de la obligación {}",
                    obligacion_id
                )
            })?;

            let saldo_final = saldo_actual - monto_nuevo;

            transaccion
                .execute(
                    r#"
                        UPDATE tblDoctosXPagar
                        SET PAGADO = ?1
                        WHERE OBLIGACION_ID = ?2
                        "#,
                    params![if saldo_final == 0 { 1 } else { 0 }, obligacion_id,],
                )
                .map_err(|error| {
                    format!(
                        "No fue posible actualizar la obligación {}: {}",
                        obligacion_id, error
                    )
                })?;
        }

        Ok(AbonoRegistrado {
            id_abono,
            monto: centavos_a_numero(monto_abono),
            aplicaciones: aplicaciones_normalizadas.len(),
        })
    })();

    match resultado {
        Ok(abono) => {
            transaccion
                .commit()
                .map_err(|error| format!("No fue posible confirmar el abono: {error}"))?;

            Ok(abono)
        }

        Err(error) => {
            // Al salir sin commit, rusqlite ejecuta rollback.
            Err(error)
        }
    }
}
