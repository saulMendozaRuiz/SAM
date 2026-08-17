use rusqlite::params;
use serde::Serialize;

use crate::db;
use crate::validation::validar_rango_fechas;

const SQL_SALDOS: &str = r#"
WITH
financiado AS (
    SELECT
        ID_DPP AS OBLIGACION_ID,
        SUM(MONTO_AMPARADO) AS TOTAL
    FROM tblFinAplicaciones
    WHERE ACTIVO = 1
    GROUP BY ID_DPP
),
abonado AS (
    SELECT
        OBLIGACION_ID,
        SUM(MONTO) AS TOTAL
    FROM tblAplicacionesAbonos
    WHERE ACTIVO = 1
    GROUP BY OBLIGACION_ID
),
saldos AS (
    SELECT
        D.OBLIGACION_ID,
        D.ENTITY,
        D.ENTITY_ID,
        D.ID_FINTO,
        D.UNIT_ID,
        D.VENCIMIENTO,
        D.MONTO,
        COALESCE(F.TOTAL, 0) AS FINANCIADO,
        COALESCE(A.TOTAL, 0) AS ABONADO,
        D.SALDO
    FROM tblDoctosXPagar AS D
    LEFT JOIN financiado AS F
        ON F.OBLIGACION_ID = D.OBLIGACION_ID
    LEFT JOIN abonado AS A
        ON A.OBLIGACION_ID = D.OBLIGACION_ID
    WHERE D.ACTIVO = 1
)
"#;

#[derive(Debug, Serialize)]
pub struct ResumenDeuda {
    pub entity: String,
    pub entity_id: i64,
    pub acreedor: Option<String>,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
}

#[derive(Debug, Serialize)]
pub struct UnidadSinCobertura {
    pub unitid: i64,
    pub vin: String,
    pub marca: String,
    pub version: String,
    pub concesionario: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub deuda_original: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub financiado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub abonado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
}

#[derive(Debug, Serialize)]
pub struct Vencimiento {
    pub obligacion_id: i64,
    pub entity: String,
    pub entity_id: i64,
    pub acreedor: Option<String>,
    pub vencimiento: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
    pub clasificacion: String,
}

#[tauri::command]
pub fn resumen_deuda() -> Result<Vec<ResumenDeuda>, String> {
    let conexion = db::abrir_bd_lectura()?;

    let sql = format!(
        r#"
        {SQL_SALDOS}

        SELECT
            S.ENTITY,
            S.ENTITY_ID,
            CASE
                WHEN S.ENTITY = 'CON' THEN C.NAME_
                WHEN S.ENTITY = 'FIN' THEN FI.RAZON_SOCIAL
            END AS ACREEDOR,
            SUM(S.SALDO) AS SALDO
        FROM saldos AS S
        LEFT JOIN tblConcesionarios AS C
            ON S.ENTITY = 'CON'
           AND C.ID_CON = S.ENTITY_ID
        LEFT JOIN tblFinancieras AS FI
            ON S.ENTITY = 'FIN'
           AND FI.ID_FIN = S.ENTITY_ID
        WHERE S.SALDO > 0
        GROUP BY
            S.ENTITY,
            S.ENTITY_ID,
            ACREEDOR
        ORDER BY S.ENTITY, ACREEDOR;
        "#
    );

    let mut consulta = conexion
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare debt summary: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(ResumenDeuda {
                entity: fila.get(0)?,
                entity_id: fila.get(1)?,
                acreedor: fila.get(2)?,
                saldo: fila.get(3)?,
            })
        })
        .map_err(|error| format!("Could not execute debt summary: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read debt summary: {error}"))
}

#[tauri::command]
pub fn unidades_sin_cobertura_total() -> Result<Vec<UnidadSinCobertura>, String> {
    let conexion = db::abrir_bd_lectura()?;

    let sql = format!(
        r#"
        {SQL_SALDOS}

        SELECT
            U.UNITID,
            U.VIN,
            U.MARCA,
            U.VERSION_,
            C.NAME_ AS CONCESIONARIO,
            S.MONTO AS DEUDA_ORIGINAL,
            S.FINANCIADO,
            S.ABONADO,
            S.SALDO
        FROM saldos AS S
        JOIN tblUnits AS U
            ON U.UNITID = S.UNIT_ID
        JOIN tblConcesionarios AS C
            ON C.ID_CON = U.ID_CON
        WHERE S.ENTITY = 'CON'
          AND S.SALDO > 0
        ORDER BY S.SALDO DESC, U.UNITID;
        "#
    );

    let mut consulta = conexion
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare uncovered vehicles report: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(UnidadSinCobertura {
                unitid: fila.get(0)?,
                vin: fila.get(1)?,
                marca: fila.get(2)?,
                version: fila.get(3)?,
                concesionario: fila.get(4)?,
                deuda_original: fila.get(5)?,
                financiado: fila.get(6)?,
                abonado: fila.get(7)?,
                saldo: fila.get(8)?,
            })
        })
        .map_err(|error| format!("Could not execute uncovered vehicles report: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read uncovered vehicles report: {error}"))
}

#[tauri::command]
pub fn vencimientos(fecha_corte: String, fecha_hasta: String) -> Result<Vec<Vencimiento>, String> {
    let (fecha_corte, fecha_hasta) = validar_rango_fechas(&fecha_corte, &fecha_hasta)?;
    let conexion = db::abrir_bd_lectura()?;

    let sql = format!(
        r#"
        {SQL_SALDOS}

        SELECT
            S.OBLIGACION_ID,
            S.ENTITY,
            S.ENTITY_ID,
            CASE
                WHEN S.ENTITY = 'CON' THEN C.NAME_
                WHEN S.ENTITY = 'FIN' THEN FI.RAZON_SOCIAL
            END AS ACREEDOR,
            S.VENCIMIENTO,
            S.SALDO,
            CASE
                WHEN DATE(S.VENCIMIENTO) < DATE(?1)
                    THEN 'VENCIDO'
                WHEN DATE(S.VENCIMIENTO)
                     <= DATE(?2, '+365 days')
                    THEN 'CORTO PLAZO'
                ELSE 'LARGO PLAZO'
            END AS CLASIFICACION
        FROM saldos AS S
        LEFT JOIN tblConcesionarios AS C
            ON S.ENTITY = 'CON'
           AND C.ID_CON = S.ENTITY_ID
        LEFT JOIN tblFinancieras AS FI
            ON S.ENTITY = 'FIN'
           AND FI.ID_FIN = S.ENTITY_ID
        WHERE S.SALDO > 0
          AND DATE(S.VENCIMIENTO) <= DATE(?3)
        ORDER BY
            DATE(S.VENCIMIENTO),
            S.OBLIGACION_ID;
        "#
    );

    let mut consulta = conexion
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare due dates report: {error}"))?;

    let filas = consulta
        .query_map(params![fecha_corte, fecha_corte, fecha_hasta], |fila| {
            Ok(Vencimiento {
                obligacion_id: fila.get(0)?,
                entity: fila.get(1)?,
                entity_id: fila.get(2)?,
                acreedor: fila.get(3)?,
                vencimiento: fila.get(4)?,
                saldo: fila.get(5)?,
                clasificacion: fila.get(6)?,
            })
        })
        .map_err(|error| format!("Could not execute due dates report: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read due dates report: {error}"))
}
