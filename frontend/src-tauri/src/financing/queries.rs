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
            ),
            UNIDADES AS (
                SELECT ID_FINTO, COUNT(DISTINCT UNIT_ID) AS CANTIDAD
                FROM tblFinanciamientoUnidades
                WHERE ACTIVO = 1
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
                COALESCE(U.CANTIDAD, 0),
                F.COMENTARIOS
            FROM tblFinanciamientos AS F
            INNER JOIN tblFinancieras AS FI ON FI.ID_FIN = F.ID_FIN
            LEFT JOIN APLICACIONES AS A ON A.ID_FINTO = F.ID_FINTO
            LEFT JOIN CALENDARIO AS C ON C.ID_FINTO = F.ID_FINTO
            LEFT JOIN MATERIALIZADO AS M ON M.ID_FINTO = F.ID_FINTO
            LEFT JOIN UNIDADES AS U ON U.ID_FINTO = F.ID_FINTO
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
                unidades_financiadas: fila.get(11)?,
                comentarios: fila.get(12)?,
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
            SELECT
                D.OBLIGACION_ID,
                D.ENTITY,
                D.ENTITY_ID,
                CASE
                    WHEN D.ENTITY = 'CON' THEN C.NAME_
                    ELSE FI.RAZON_SOCIAL
                END AS ACREEDOR,
                D.UNIT_ID,
                U.VIN,
                D.VENCIMIENTO,
                D.MONTO,
                D.SALDO
            FROM tblDoctosXPagar AS D
            LEFT JOIN tblConcesionarios AS C
              ON D.ENTITY = 'CON' AND C.ID_CON = D.ENTITY_ID
            LEFT JOIN tblFinancieras AS FI
              ON D.ENTITY = 'FIN' AND FI.ID_FIN = D.ENTITY_ID
            LEFT JOIN tblUnits AS U ON U.UNITID = D.UNIT_ID
            WHERE D.ACTIVO = 1
              AND D.PAGADO = 0
              AND D.SALDO > 0
              AND (
                  D.UNIT_ID IS NULL
                  OR (U.ACTIVO = 1 AND U.FINANCIADO = 0)
              )
            ORDER BY D.VENCIMIENTO, D.OBLIGACION_ID
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
