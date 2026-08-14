use crate::db;

use rusqlite::{params, TransactionBehavior};

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
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub monto: i64,
    pub aplicaciones: usize,
}

fn dinero_a_centavos(valor: &str, nombre: &str) -> Result<i64, String> {
    crate::validation::dinero_a_centavos(valor, nombre)
}

fn validar_fecha_iso(fecha: &str) -> Result<(), String> {
    crate::validation::validar_fecha_iso(fecha, "FECHA").map(|_| ())
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
            "El abono es {}, pero sus aplicaciones suman {}",
            crate::money::formatear_centavos(monto_abono),
            crate::money::formatear_centavos(total_aplicado),
        ));
    }

    let mut conexion = db::abrir_bd_escritura()?;

    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    let resultado = (|| -> Result<AbonoRegistrado, String> {
        let mut saldos_actuales: HashMap<i64, i64> = HashMap::new();

        for (obligacion_id, nueva_aplicacion) in &total_por_obligacion {
            let saldo_centavos =
                crate::obligation_state::validar_obligacion_abierta(&transaccion, *obligacion_id)?;

            if *nueva_aplicacion > saldo_centavos {
                return Err(format!(
                    "La obligación {} tiene saldo {}, pero se intentan aplicar {}",
                    obligacion_id,
                    crate::money::formatear_centavos(saldo_centavos),
                    crate::money::formatear_centavos(*nueva_aplicacion),
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
                params![fecha, monto_abono, referencia, comentarios,],
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
                    params![id_abono, obligacion_id, monto_aplicado, comentarios,],
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
            monto: monto_abono,
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
