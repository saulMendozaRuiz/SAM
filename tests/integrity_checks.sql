WITH
FIN_APLICADO AS (
    SELECT
        ID_DPP,
        SUM(MONTO_AMPARADO) AS MONTO
    FROM tblFinAplicaciones
    WHERE ACTIVO = 1
    GROUP BY ID_DPP
),

ABONO_APLICADO AS (
    SELECT
        OBLIGACION_ID,
        SUM(MONTO) AS MONTO
    FROM tblAplicacionesAbonos
    WHERE ACTIVO = 1
    GROUP BY OBLIGACION_ID
),

SALDOS AS (
    SELECT
        D.OBLIGACION_ID,
        D.ENTITY,
        D.MONTO,
        D.PAGADO,
        D.MONTO
            - COALESCE(F.MONTO, 0)
            - COALESCE(A.MONTO, 0) AS SALDO
    FROM tblDoctosXPagar AS D
    LEFT JOIN FIN_APLICADO AS F
        ON F.ID_DPP = D.OBLIGACION_ID
    LEFT JOIN ABONO_APLICADO AS A
        ON A.OBLIGACION_ID = D.OBLIGACION_ID
    WHERE D.ACTIVO = 1
)

SELECT
    (
        SELECT COUNT(*)
        FROM (
            SELECT VIN
            FROM tblUnits
            GROUP BY VIN
            HAVING COUNT(*) > 1
        )
    ) AS VIN_DUPLICADOS,

    (
        SELECT COUNT(*)
        FROM tblUnits AS U
        LEFT JOIN tblConcesionarios AS C
            ON C.ID_CON = U.ID_CON
        WHERE C.ID_CON IS NULL
    ) AS UNIDADES_SIN_CONCESIONARIO,

    (
        SELECT COUNT(*)
        FROM tblFinAplicaciones AS FA
        LEFT JOIN tblDoctosXPagar AS D
            ON D.OBLIGACION_ID = FA.ID_DPP
        WHERE FA.ACTIVO = 1
          AND D.OBLIGACION_ID IS NULL
    ) AS FIN_APLICACIONES_HUERFANAS,

    (
        SELECT COUNT(*)
        FROM tblAplicacionesAbonos AS AA
        LEFT JOIN tblDoctosXPagar AS D
            ON D.OBLIGACION_ID = AA.OBLIGACION_ID
        WHERE AA.ACTIVO = 1
          AND D.OBLIGACION_ID IS NULL
    ) AS ABONO_APLICACIONES_HUERFANAS,

    (
        SELECT COUNT(*)
        FROM SALDOS
        WHERE SALDO < -0.005
    ) AS OBLIGACIONES_SOBREAPLICADAS,

    (
        SELECT COUNT(*)
        FROM SALDOS
        WHERE
            (PAGADO = 1 AND ABS(SALDO) > 0.005)
            OR
            (PAGADO = 0 AND ABS(SALDO) <= 0.005)
    ) AS ESTATUS_PAGADO_INCONSISTENTE,

    (
        SELECT COUNT(*)
        FROM tblAbonos AS A
        LEFT JOIN (
            SELECT
                ABONO_ID,
                SUM(MONTO) AS APLICADO
            FROM tblAplicacionesAbonos
            WHERE ACTIVO = 1
            GROUP BY ABONO_ID
        ) AS X
            ON X.ABONO_ID = A.ID_ABONO
        WHERE A.ACTIVO = 1
          AND ABS(A.MONTO - COALESCE(X.APLICADO, 0)) > 0.005
    ) AS ABONOS_DESCUADRADOS,

    (
        SELECT COUNT(*)
        FROM tblFinanciamientos AS F
        LEFT JOIN (
            SELECT
                ID_FINTO,
                SUM(MONTO_AMPARADO) AS APLICADO
            FROM tblFinAplicaciones
            WHERE ACTIVO = 1
            GROUP BY ID_FINTO
        ) AS A
            ON A.ID_FINTO = F.ID_FINTO
        LEFT JOIN (
            SELECT
                ID_FINTO,
                SUM(MONTO) AS CALENDARIO
            FROM tblFinCalendario
            WHERE ACTIVO = 1
            GROUP BY ID_FINTO
        ) AS C
            ON C.ID_FINTO = F.ID_FINTO
        WHERE F.ACTIVO = 1
          AND (
              ABS(
                  F.MONTO_CUPONES
                  + F.MONTO_BALLOON
                  - COALESCE(A.APLICADO, 0)
              ) > 0.005
              OR
              ABS(
                  F.MONTO_CUPONES
                  + F.MONTO_BALLOON
                  - COALESCE(C.CALENDARIO, 0)
              ) > 0.005
          )
    ) AS FINANCIAMIENTOS_DESCUADRADOS,

    (
        SELECT COALESCE(SUM(SALDO), 0)
        FROM SALDOS
        WHERE ENTITY = 'CON'
    ) AS SALDO_CONCESIONARIOS,

    (
        SELECT COALESCE(SUM(SALDO), 0)
        FROM SALDOS
        WHERE ENTITY = 'FIN'
    ) AS SALDO_FINANCIERAS;