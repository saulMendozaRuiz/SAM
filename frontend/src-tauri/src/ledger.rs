use crate::db;
use crate::validation::validar_rango_fechas;
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct LedgerEntry {
    fecha: String,
    tipo: String,
    entity: String,
    entity_id: i64,
    acreedor: String,
    obligacion_id: i64,
    id_finto: Option<i64>,
    unit_id: Option<i64>,
    referencia: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    debe: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    haber: i64,
}

#[tauri::command]
pub fn listar_ledger(fecha_desde: String, fecha_hasta: String) -> Result<Vec<LedgerEntry>, String> {
    let (fecha_desde, fecha_hasta) = validar_rango_fechas(&fecha_desde, &fecha_hasta)?;
    let conexion = db::abrir_bd_pruebas()?;

    let mut consulta = conexion
        .prepare(
            r#"
            WITH movimientos AS (
                /*
                 * Nacimiento de una obligación.
                 * Aumenta la deuda: HABER.
                 */
                SELECT
                    CASE
                        WHEN D.ENTITY = 'FIN'
                            THEN COALESCE(F.EMISION, SUBSTR(D.CREATED_AT, 1, 10))
                        ELSE SUBSTR(D.CREATED_AT, 1, 10)
                    END AS FECHA,

                    'OBLIGACION' AS TIPO,
                    D.ENTITY,
                    D.ENTITY_ID,

                    CASE
                        WHEN D.ENTITY = 'CON'
                            THEN COALESCE(C.NAME_, 'CONCESIONARIO SIN NOMBRE')
                        WHEN D.ENTITY = 'FIN'
                            THEN COALESCE(FI.RAZON_SOCIAL, 'FINANCIERA SIN NOMBRE')
                    END AS ACREEDOR,

                    D.OBLIGACION_ID,
                    D.ID_FINTO,
                    D.UNIT_ID,
                    COALESCE(D.COMENTARIOS, 'OBLIGACION') AS REFERENCIA,
                    0 AS DEBE,
                    D.MONTO AS HABER,
                    1 AS ORDEN

                FROM tblDoctosXPagar AS D

                LEFT JOIN tblConcesionarios AS C
                    ON D.ENTITY = 'CON'
                   AND C.ID_CON = D.ENTITY_ID

                LEFT JOIN tblFinancieras AS FI
                    ON D.ENTITY = 'FIN'
                   AND FI.ID_FIN = D.ENTITY_ID

                LEFT JOIN tblFinanciamientos AS F
                    ON F.ID_FINTO = D.ID_FINTO

                WHERE D.ACTIVO = 1

                UNION ALL

                /*
                 * Un financiamiento cubre una obligación
                 * anterior del concesionario.
                 * Reduce esa deuda: DEBE.
                 */
                SELECT
                    F.EMISION AS FECHA,
                    'FINANCIAMIENTO' AS TIPO,
                    D.ENTITY,
                    D.ENTITY_ID,

                    COALESCE(
                        C.NAME_,
                        'CONCESIONARIO SIN NOMBRE'
                    ) AS ACREEDOR,

                    D.OBLIGACION_ID,
                    F.ID_FINTO,
                    D.UNIT_ID,

                    'FINANCIAMIENTO ' || F.FOLIO
                        AS REFERENCIA,

                    FA.MONTO_AMPARADO AS DEBE,
                    0 AS HABER,
                    2 AS ORDEN

                FROM tblFinAplicaciones AS FA

                JOIN tblFinanciamientos AS F
                    ON F.ID_FINTO = FA.ID_FINTO

                JOIN tblDoctosXPagar AS D
                    ON D.OBLIGACION_ID = FA.ID_DPP

                LEFT JOIN tblConcesionarios AS C
                    ON D.ENTITY = 'CON'
                   AND C.ID_CON = D.ENTITY_ID

                WHERE FA.ACTIVO = 1
                  AND F.ACTIVO = 1
                  AND D.ACTIVO = 1

                UNION ALL

                /*
                 * Un abono aplicado reduce una obligación
                 * de concesionario o financiera: DEBE.
                 */
                SELECT
                    A.FECHA,
                    'ABONO' AS TIPO,
                    D.ENTITY,
                    D.ENTITY_ID,

                    CASE
                        WHEN D.ENTITY = 'CON'
                            THEN COALESCE(C.NAME_, 'CONCESIONARIO SIN NOMBRE')
                        WHEN D.ENTITY = 'FIN'
                            THEN COALESCE(FI.RAZON_SOCIAL, 'FINANCIERA SIN NOMBRE')
                    END AS ACREEDOR,

                    D.OBLIGACION_ID,
                    D.ID_FINTO,
                    D.UNIT_ID,

                    COALESCE(
                        A.REFERENCIA,
                        'ABONO ' || A.ID_ABONO
                    ) AS REFERENCIA,

                    AP.MONTO AS DEBE,
                    0 AS HABER,
                    3 AS ORDEN

                FROM tblAplicacionesAbonos AS AP

                JOIN tblAbonos AS A
                    ON A.ID_ABONO = AP.ABONO_ID

                JOIN tblDoctosXPagar AS D
                    ON D.OBLIGACION_ID = AP.OBLIGACION_ID

                LEFT JOIN tblConcesionarios AS C
                    ON D.ENTITY = 'CON'
                   AND C.ID_CON = D.ENTITY_ID

                LEFT JOIN tblFinancieras AS FI
                    ON D.ENTITY = 'FIN'
                   AND FI.ID_FIN = D.ENTITY_ID

                WHERE AP.ACTIVO = 1
                  AND A.ACTIVO = 1
                  AND D.ACTIVO = 1
            )

            SELECT
                FECHA,
                TIPO,
                ENTITY,
                ENTITY_ID,
                ACREEDOR,
                OBLIGACION_ID,
                ID_FINTO,
                UNIT_ID,
                REFERENCIA,
                DEBE,
                HABER
            FROM movimientos
            WHERE FECHA BETWEEN ?1 AND ?2
            ORDER BY
                FECHA,
                ORDEN,
                OBLIGACION_ID
            "#,
        )
        .map_err(|error| format!("No fue posible preparar el Ledger: {error}"))?;

    let filas = consulta
        .query_map(params![fecha_desde, fecha_hasta], |fila| {
            Ok(LedgerEntry {
                fecha: fila.get(0)?,
                tipo: fila.get(1)?,
                entity: fila.get(2)?,
                entity_id: fila.get(3)?,
                acreedor: fila.get(4)?,
                obligacion_id: fila.get(5)?,
                id_finto: fila.get(6)?,
                unit_id: fila.get(7)?,
                referencia: fila.get(8)?,
                debe: fila.get(9)?,
                haber: fila.get(10)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar el Ledger: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer el Ledger: {error}"))
}
