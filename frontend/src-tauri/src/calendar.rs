use crate::db;
use serde::Serialize;

#[derive(Serialize)]
pub struct CalendarItem {
    id_cupon: i64,
    id_finto: i64,
    financiera: String,
    folio: String,
    serie_pago: i64,
    vencimiento: String,
    monto: f64,
    is_balloon: bool,
    obligacion_id: Option<i64>,
    abonado: f64,
    saldo: f64,
}

#[tauri::command]
pub fn listar_calendario(
    fecha_desde: Option<String>,
    fecha_hasta: Option<String>,
) -> Result<Vec<CalendarItem>, String> {
    let conexion = db::abrir_bd_pruebas()?;

    let mut consulta = conexion
        .prepare(
            r#"
            WITH abonos_por_obligacion AS (
                SELECT
                    OBLIGACION_ID,
                    SUM(MONTO) AS ABONADO
                FROM tblAplicacionesAbonos
                WHERE ACTIVO = 1
                GROUP BY OBLIGACION_ID
            )
            SELECT
                C.ID_CUPON,
                C.ID_FINTO,
                FI.RAZON_SOCIAL AS FINANCIERA,
                F.FOLIO,
                C.SERIE_PAGO,
                C.VENCIMIENTO,
                C.MONTO,
                C.IS_BALLOON,
                D.OBLIGACION_ID,
                COALESCE(A.ABONADO, 0) AS ABONADO,
                C.MONTO - COALESCE(A.ABONADO, 0) AS SALDO
            FROM tblFinCalendario AS C
            JOIN tblFinanciamientos AS F
                ON F.ID_FINTO = C.ID_FINTO
            JOIN tblFinancieras AS FI
                ON FI.ID_FIN = F.ID_FIN
            LEFT JOIN tblDoctosXPagar AS D
                ON D.ENTITY = 'FIN'
               AND D.ID_FINTO = C.ID_FINTO
               AND D.VENCIMIENTO = C.VENCIMIENTO
               AND D.MONTO = C.MONTO
               AND D.COMENTARIOS = C.COMENTARIOS
               AND D.ACTIVO = 1
            LEFT JOIN abonos_por_obligacion AS A
                ON A.OBLIGACION_ID = D.OBLIGACION_ID
            WHERE C.ACTIVO = 1
              AND F.ACTIVO = 1
              AND FI.ACTIVO = 1
              AND (?1 IS NULL OR C.VENCIMIENTO >= ?1)
              AND (?2 IS NULL OR C.VENCIMIENTO <= ?2)
            ORDER BY
                C.VENCIMIENTO,
                C.ID_FINTO,
                C.SERIE_PAGO,
                C.IS_BALLOON
            "#,
        )
        .map_err(|error| format!("No fue posible preparar el calendario: {error}"))?;

    let filas = consulta
        .query_map(
            rusqlite::params![fecha_desde.as_deref(), fecha_hasta.as_deref()],
            |fila| {
                Ok(CalendarItem {
                    id_cupon: fila.get(0)?,
                    id_finto: fila.get(1)?,
                    financiera: fila.get(2)?,
                    folio: fila.get(3)?,
                    serie_pago: fila.get(4)?,
                    vencimiento: fila.get(5)?,
                    monto: fila.get(6)?,
                    is_balloon: fila.get::<_, i64>(7)? == 1,
                    obligacion_id: fila.get(8)?,
                    abonado: fila.get(9)?,
                    saldo: fila.get(10)?,
                })
            },
        )
        .map_err(|error| format!("No fue posible consultar el calendario: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer el calendario: {error}"))
}
