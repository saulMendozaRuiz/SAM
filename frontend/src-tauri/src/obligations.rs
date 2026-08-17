use crate::db;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct UnidadObligacion {
    vin: String,
    marca: Option<String>,
    version: Option<String>,
    oc_mexrac: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Obligacion {
    obligacion_id: i64,
    entity: String,
    entity_id: i64,
    acreedor: String,
    id_finto: Option<i64>,
    unit_id: Option<i64>,
    folio_financiamiento: Option<String>,
    vin: Option<String>,
    marca: Option<String>,
    version: Option<String>,
    oc_mexrac: Option<String>,
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
    comentarios: Option<String>,
    unidades: Vec<UnidadObligacion>,
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
                    GROUP_CONCAT(DISTINCT U.VIN) AS VIN,
                    GROUP_CONCAT(DISTINCT U.MARCA) AS MARCA,
                    GROUP_CONCAT(DISTINCT U.VERSION_) AS VERSION_,
                    GROUP_CONCAT(DISTINCT U.OC_MEXRAC) AS OC_MEXRAC
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

                D.ID_FINTO,
                D.UNIT_ID,
                FT.FOLIO,
                COALESCE(U.VIN, UF.VIN),
                COALESCE(U.MARCA, UF.MARCA),
                COALESCE(U.VERSION_, UF.VERSION_),
                COALESCE(U.OC_MEXRAC, UF.OC_MEXRAC),
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

                D.PAGADO,
                D.COMENTARIOS

            FROM tblDoctosXPagar AS D

            LEFT JOIN tblConcesionarios AS C
                ON D.ENTITY = 'CON'
               AND C.ID_CON = D.ENTITY_ID

            LEFT JOIN tblFinancieras AS F
                ON D.ENTITY = 'FIN'
               AND F.ID_FIN = D.ENTITY_ID

            LEFT JOIN FINANCIADO AS FIN
                ON FIN.ID_DPP = D.OBLIGACION_ID

            LEFT JOIN tblFinanciamientos AS FT
                ON FT.ID_FINTO = D.ID_FINTO AND FT.ACTIVO = 1

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
            let pagado: i64 = fila.get(16)?;

            Ok(Obligacion {
                obligacion_id: fila.get(0)?,
                entity: fila.get(1)?,
                entity_id: fila.get(2)?,
                acreedor: fila.get(3)?,
                id_finto: fila.get(4)?,
                unit_id: fila.get(5)?,
                folio_financiamiento: fila.get(6)?,
                vin: fila.get(7)?,
                marca: fila.get(8)?,
                version: fila.get(9)?,
                oc_mexrac: fila.get(10)?,
                vencimiento: fila.get(11)?,
                monto_original: fila.get(12)?,
                financiado: fila.get(13)?,
                abonado: fila.get(14)?,
                saldo: fila.get(15)?,
                pagado: pagado == 1,
                comentarios: fila.get(17)?,
                unidades: Vec::new(),
            })
        })
        .map_err(|error| format!("No fue posible consultar las obligaciones: {error}"))?;

    let mut obligaciones = filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer las obligaciones: {error}"))?;

    let mut unidades_por_financiamiento: HashMap<i64, Vec<UnidadObligacion>> = HashMap::new();

    {
        let mut consulta_unidades = conexion
            .prepare(
                "
                SELECT DISTINCT
                    FU.ID_FINTO,
                    U.VIN,
                    U.MARCA,
                    U.VERSION_,
                    U.OC_MEXRAC
                FROM tblFinanciamientoUnidades AS FU
                INNER JOIN tblUnits AS U
                    ON U.UNITID = FU.UNIT_ID
                WHERE
                    FU.ACTIVO = 1
                    AND U.ACTIVO = 1
                ORDER BY
                    FU.ID_FINTO,
                    U.VIN
                ",
            )
            .map_err(|error| {
                format!("No fue posible preparar las unidades de financiamientos: {error}")
            })?;

        let filas_unidades = consulta_unidades
            .query_map([], |fila| {
                Ok((
                    fila.get::<_, i64>(0)?,
                    UnidadObligacion {
                        vin: fila.get(1)?,
                        marca: fila.get(2)?,
                        version: fila.get(3)?,
                        oc_mexrac: fila.get(4)?,
                    },
                ))
            })
            .map_err(|error| {
                format!("No fue posible consultar las unidades de financiamientos: {error}")
            })?;

        for fila in filas_unidades {
            let (id_finto, unidad) = fila.map_err(|error| {
                format!("No fue posible leer una unidad de financiamiento: {error}")
            })?;

            unidades_por_financiamiento
                .entry(id_finto)
                .or_default()
                .push(unidad);
        }
    }

    for obligacion in &mut obligaciones {
        if obligacion.entity == "FIN" {
            if let Some(id_finto) = obligacion.id_finto {
                obligacion.unidades = unidades_por_financiamiento
                    .get(&id_finto)
                    .cloned()
                    .unwrap_or_default();
            }
        } else if let Some(vin) = obligacion.vin.clone() {
            obligacion.unidades.push(UnidadObligacion {
                vin,
                marca: obligacion.marca.clone(),
                version: obligacion.version.clone(),
                oc_mexrac: obligacion.oc_mexrac.clone(),
            });
        }
    }

    Ok(obligaciones)
}
