use crate::db;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Obligacion {
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
    financiado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    abonado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    saldo: i64,
    pagado: bool,
}

#[tauri::command]
pub fn listar_obligaciones() -> Result<Vec<Obligacion>, String> {
    let conexion = db::abrir_bd_lectura()?;

    let mut consulta = conexion
        .prepare(
            "
            WITH FINANCIADO AS (
                SELECT
                    ID_DPP,
                    SUM(MONTO_AMPARADO) AS MONTO
                FROM tblFinAplicaciones
                WHERE ACTIVO = 1
                GROUP BY ID_DPP
            ),
            ABONADO AS (
                SELECT
                    OBLIGACION_ID,
                    SUM(MONTO) AS MONTO
                FROM tblAplicacionesAbonos
                WHERE ACTIVO = 1
                GROUP BY OBLIGACION_ID
            ),
            UNIDADES_FINANCIAMIENTO AS (
                SELECT
                    FU.ID_FINTO,
                    GROUP_CONCAT(DISTINCT U.VIN) AS VIN
                FROM tblFinanciamientoUnidades AS FU
                INNER JOIN tblUnits AS U
                    ON U.UNITID = FU.UNIT_ID
                WHERE FU.ACTIVO = 1 AND U.ACTIVO = 1
                GROUP BY FU.ID_FINTO
            )
            SELECT
                D.OBLIGACION_ID,
                D.ENTITY,
                D.ENTITY_ID,

                CASE
                    WHEN D.ENTITY = 'CON'
                        THEN C.NAME_
                    WHEN D.ENTITY = 'FIN'
                        THEN F.RAZON_SOCIAL
                    ELSE 'ACREEDOR DESCONOCIDO'
                END AS ACREEDOR,

                D.UNIT_ID,
                COALESCE(U.VIN, UF.VIN),
                D.VENCIMIENTO,
                D.MONTO AS MONTO_ORIGINAL,

                CASE
                    WHEN D.ENTITY = 'CON'
                        THEN COALESCE(FIN.MONTO, 0)
                    ELSE 0
                END AS FINANCIADO,

                COALESCE(AB.MONTO, 0)
                    AS ABONADO,

                D.SALDO,

                D.PAGADO

            FROM tblDoctosXPagar AS D

            LEFT JOIN tblConcesionarios AS C
                ON D.ENTITY = 'CON'
               AND C.ID_CON = D.ENTITY_ID

            LEFT JOIN tblFinancieras AS F
                ON D.ENTITY = 'FIN'
               AND F.ID_FIN = D.ENTITY_ID

            LEFT JOIN FINANCIADO AS FIN
                ON FIN.ID_DPP = D.OBLIGACION_ID

            LEFT JOIN tblUnits AS U
                ON U.UNITID = D.UNIT_ID AND U.ACTIVO = 1

            LEFT JOIN UNIDADES_FINANCIAMIENTO AS UF
                ON UF.ID_FINTO = D.ID_FINTO

            LEFT JOIN ABONADO AS AB
                ON AB.OBLIGACION_ID =
                   D.OBLIGACION_ID

            WHERE D.ACTIVO = 1

            ORDER BY
                D.VENCIMIENTO,
                D.OBLIGACION_ID
            ",
        )
        .map_err(|error| format!("No fue posible preparar la consulta de obligaciones: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            let pagado: i64 = fila.get(11)?;

            Ok(Obligacion {
                obligacion_id: fila.get(0)?,
                entity: fila.get(1)?,
                entity_id: fila.get(2)?,
                acreedor: fila.get(3)?,
                unit_id: fila.get(4)?,
                vin: fila.get(5)?,
                vencimiento: fila.get(6)?,
                monto_original: fila.get(7)?,
                financiado: fila.get(8)?,
                abonado: fila.get(9)?,
                saldo: fila.get(10)?,
                pagado: pagado == 1,
            })
        })
        .map_err(|error| format!("No fue posible consultar las obligaciones: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer las obligaciones: {error}"))
}
