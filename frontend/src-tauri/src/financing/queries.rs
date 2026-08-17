use crate::db::abrir_bd_lectura;

use super::{Financiamiento, ObligacionFinanciable};

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
                    D.SALDO
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
              AND (
                  S.UNIT_ID IS NULL OR EXISTS (
                      SELECT 1 FROM tblUnits AS GUARDIAN
                      WHERE GUARDIAN.UNITID = S.UNIT_ID
                        AND GUARDIAN.FINANCIADO = 0
                  )
              )
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
