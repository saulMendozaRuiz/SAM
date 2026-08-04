from pathlib import Path

from backend.db import conectar_lectura


SQL_SALDOS = """
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
        D.MONTO
            - COALESCE(F.TOTAL, 0)
            - COALESCE(A.TOTAL, 0) AS SALDO
    FROM tblDoctosXPagar AS D
    LEFT JOIN financiado AS F
        ON F.OBLIGACION_ID = D.OBLIGACION_ID
    LEFT JOIN abonado AS A
        ON A.OBLIGACION_ID = D.OBLIGACION_ID
    WHERE D.ACTIVO = 1
)
"""


def resumen_deuda(ruta_bd: str | Path) -> list[dict]:
    sql = SQL_SALDOS + """
    SELECT
        S.ENTITY,
        S.ENTITY_ID,
        CASE
            WHEN S.ENTITY = 'CON' THEN C.NAME_
            WHEN S.ENTITY = 'FIN' THEN FI.RAZON_SOCIAL
        END AS ACREEDOR,
        ROUND(SUM(S.SALDO), 2) AS SALDO
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
    """

    with conectar_lectura(ruta_bd) as con:
        return [dict(fila) for fila in con.execute(sql).fetchall()]


def unidades_sin_cobertura_total(
    ruta_bd: str | Path,
) -> list[dict]:
    sql = SQL_SALDOS + """
    SELECT
        U.UNITID,
        U.VIN,
        U.MARCA,
        U.VERSION_,
        C.NAME_ AS CONCESIONARIO,
        ROUND(S.MONTO, 2) AS DEUDA_ORIGINAL,
        ROUND(S.FINANCIADO, 2) AS FINANCIADO,
        ROUND(S.ABONADO, 2) AS ABONADO,
        ROUND(S.SALDO, 2) AS SALDO
    FROM saldos AS S
    JOIN tblUnits AS U
        ON U.UNITID = S.UNIT_ID
    JOIN tblConcesionarios AS C
        ON C.ID_CON = U.ID_CON
    WHERE S.ENTITY = 'CON'
      AND S.SALDO > 0
    ORDER BY S.SALDO DESC, U.UNITID;
    """

    with conectar_lectura(ruta_bd) as con:
        return [dict(fila) for fila in con.execute(sql).fetchall()]


def vencimientos(
    ruta_bd: str | Path,
    fecha_corte: str,
    fecha_hasta: str,
) -> list[dict]:
    sql = SQL_SALDOS + """
    SELECT
        S.OBLIGACION_ID,
        S.ENTITY,
        S.ENTITY_ID,
        CASE
            WHEN S.ENTITY = 'CON' THEN C.NAME_
            WHEN S.ENTITY = 'FIN' THEN FI.RAZON_SOCIAL
        END AS ACREEDOR,
        S.VENCIMIENTO,
        ROUND(S.SALDO, 2) AS SALDO,
        CASE
            WHEN DATE(S.VENCIMIENTO) < DATE(?) THEN 'VENCIDO'
            WHEN DATE(S.VENCIMIENTO) <= DATE(?, '+365 days')
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
    AND DATE(S.VENCIMIENTO) <= DATE(?)
    ORDER BY DATE(S.VENCIMIENTO), S.OBLIGACION_ID;
    """

    parametros = (
        fecha_corte,
        fecha_corte,
        fecha_hasta,
    )

    with conectar_lectura(ruta_bd) as con:
        return [
            dict(fila)
            for fila in con.execute(sql, parametros).fetchall()
        ]