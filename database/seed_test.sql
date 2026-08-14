PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;


/* =========================================================
   CONCESIONARIOS
   ========================================================= */

INSERT INTO tblConcesionarios (
    ID_CON,
    NAME_,
    CLUSTER,
    RFC,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        'AUTOMOTRIZ DEL OCCIDENTE DEMO',
        'DEMO OCCIDENTE',
        'AOD010101AA1',
        1,
        'REGISTRO DE PRUEBA'
    ),
    (
        2,
        'AUTOMOTRIZ DEL BAJIO DEMO',
        'DEMO BAJIO',
        'ABB010101BB2',
        1,
        'REGISTRO DE PRUEBA'
    );


/* =========================================================
   FINANCIERAS
   ========================================================= */

INSERT INTO tblFinancieras (
    ID_FIN,
    RAZON_SOCIAL,
    RFC,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        'CAPITAL MOTOR DEMO',
        'CMD010101CC3',
        1,
        'FINANCIERA DE PRUEBA A'
    ),
    (
        2,
        'CREDITO VEHICULAR DEMO',
        'CVD010101DD4',
        1,
        'FINANCIERA DE PRUEBA B'
    );


/* =========================================================
   UNIDADES
   ========================================================= */

INSERT INTO tblUnits (
    UNITID,
    ID_CON,
    VIN,
    NO_MOTOR,
    MODELO_ANIO,
    MARCA,
    VERSION_,
    OC_MEXRAC,
    FOLIO_FACTURA,
    SUBTOTAL,
    IVA,
    TOTAL,
    ENTREGA_PATIO,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        1,
        '3SAMDEMO000000001',
        'MOTOR-DEMO-001',
        2026,
        'VOLKSWAGEN',
        'VIRTUS DEMO',
        'OC-DEMO-001',
        'FACT-DEMO-001',
        258620.69,
        41379.31,
        300000.00,
        '2026-01-01',
        1,
        'UNIDAD DE PRUEBA'
    ),
    (
        2,
        1,
        '3SAMDEMO000000002',
        NULL,
        2026,
        'NISSAN',
        'VERSA DEMO',
        'OC-DEMO-001',
        'FACT-DEMO-001',
        344827.59,
        55172.41,
        400000.00,
        '2026-01-01',
        1,
        'UNIDAD DE PRUEBA SIN NUMERO DE MOTOR'
    ),
    (
        3,
        2,
        '3SAMDEMO000000003',
        'MOTOR-DEMO-003',
        2026,
        'CHEVROLET',
        'TRACKER DEMO',
        'OC-DEMO-001',
        'FACT-DEMO-001',
        431034.48,
        68965.52,
        500000.00,
        '2026-01-01',
        1,
        'UNIDAD DE PRUEBA'
    );


/* =========================================================
   OBLIGACIONES INICIALES CON CONCESIONARIOS

   Son puentes lógicos:
   ENTITY = CON
   ENTITY_ID = ID_CON
   UNIT_ID = UNITID
   ========================================================= */

INSERT INTO tblDoctosXPagar (
    OBLIGACION_ID,
    ENTITY,
    ENTITY_ID,
    ID_FINTO,
    UNIT_ID,
    VENCIMIENTO,
    MONTO,
    PAGADO,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        'CON',
        1,
        NULL,
        1,
        '2026-01-31',
        300000.00,
        0,
        1,
        'ADQUISICION VEHICULO DEMO 1'
    ),
    (
        2,
        'CON',
        1,
        NULL,
        2,
        '2026-01-31',
        400000.00,
        0,
        1,
        'ADQUISICION VEHICULO DEMO 2'
    ),
    (
        3,
        'CON',
        2,
        NULL,
        3,
        '2026-01-31',
        500000.00,
        0,
        1,
        'ADQUISICION VEHICULO DEMO 3'
    );


/* =========================================================
   FINANCIAMIENTO MULTILOTE DE PRUEBA

   Cubre:
   - $300,000 de la obligación 1
   - $200,000 de la obligación 2

   Total financiado:
   - $400,000 en cupones ordinarios
   - $100,000 en balloon
   ========================================================= */

INSERT INTO tblFinanciamientos (
    ID_FINTO,
    ID_FIN,
    FOLIO,
    EMISION,
    MONTO_CUPONES,
    CUPONES,
    MONTO_BALLOON,
    ACTIVO,
    COMENTARIOS
)
VALUES (
    1,
    1,
    'FIN-DEMO-001',
    '2026-01-15',
    400000.00,
    4,
    100000.00,
    1,
    'FINANCIAMIENTO MULTILOTE DE PRUEBA'
);


/* Aplicación atómica contra obligaciones de origen */

INSERT INTO tblFinAplicaciones (
    ID_FINAP,
    ID_FINTO,
    ID_DPP,
    MONTO_AMPARADO,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        1,
        1,
        300000.00,
        1,
        'COBERTURA TOTAL DE OBLIGACION 1'
    ),
    (
        2,
        1,
        2,
        200000.00,
        1,
        'COBERTURA PARCIAL DE OBLIGACION 2'
    );


/* Calendario contractual */

INSERT INTO tblFinCalendario (
    ID_CUPON,
    ID_FINTO,
    SERIE_PAGO,
    VENCIMIENTO,
    MONTO,
    IS_BALLOON,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        1,
        1,
        '2026-02-28',
        100000.00,
        0,
        1,
        'CUPON ORDINARIO 1'
    ),
    (
        2,
        1,
        2,
        '2026-03-31',
        100000.00,
        0,
        1,
        'CUPON ORDINARIO 2'
    ),
    (
        3,
        1,
        3,
        '2026-04-30',
        100000.00,
        0,
        1,
        'CUPON ORDINARIO 3'
    ),
    (
        4,
        1,
        4,
        '2026-05-31',
        100000.00,
        0,
        1,
        'CUPON ORDINARIO 4'
    ),
    (
        5,
        1,
        4,
        '2026-05-31',
        100000.00,
        1,
        1,
        'BALLOON SEPARADO'
    );


/* Materialización de cupones en documentos por pagar */

INSERT INTO tblDoctosXPagar (
    OBLIGACION_ID,
    ENTITY,
    ENTITY_ID,
    ID_FINTO,
    ID_CUPON,
    UNIT_ID,
    VENCIMIENTO,
    MONTO,
    PAGADO,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        4,
        'FIN',
        1,
        1,
        1,
        NULL,
        '2026-02-28',
        100000.00,
        0,
        1,
        'FIN-DEMO-001 / CUPON 1'
    ),
    (
        5,
        'FIN',
        1,
        1,
        2,
        NULL,
        '2026-03-31',
        100000.00,
        0,
        1,
        'FIN-DEMO-001 / CUPON 2'
    ),
    (
        6,
        'FIN',
        1,
        1,
        3,
        NULL,
        '2026-04-30',
        100000.00,
        0,
        1,
        'FIN-DEMO-001 / CUPON 3'
    ),
    (
        7,
        'FIN',
        1,
        1,
        4,
        NULL,
        '2026-05-31',
        100000.00,
        0,
        1,
        'FIN-DEMO-001 / CUPON 4'
    ),
    (
        8,
        'FIN',
        1,
        1,
        5,
        NULL,
        '2026-05-31',
        100000.00,
        0,
        1,
        'FIN-DEMO-001 / BALLOON'
    );


/* La obligación 1 quedó totalmente cubierta */

UPDATE tblDoctosXPagar
SET
    PAGADO = 1,
    COMENTARIOS =
        'ADQUISICION VEHICULO DEMO 1; CUBIERTA POR FIN-DEMO-001'
WHERE OBLIGACION_ID = 1;

/* =========================================================
   ABONOS DE PRUEBA
   ========================================================= */

INSERT INTO tblAbonos (
    ID_ABONO,
    FECHA,
    MONTO,
    REFERENCIA,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        '2026-02-27',
        150000.00,
        'TRANSFERENCIA-DEMO-001',
        1,
        'ABONO DIVIDIDO ENTRE DOS CUPONES'
    ),
    (
        2,
        '2026-03-15',
        25000.00,
        'TRANSFERENCIA-DEMO-002',
        1,
        'SEGUNDO ABONO PARCIAL AL CUPON 2'
    );


/* =========================================================
   APLICACIONES DE LOS ABONOS

   Abono 1:
   - $100,000 a obligación 4
   -  $50,000 a obligación 5

   Abono 2:
   -  $25,000 adicionales a obligación 5
   ========================================================= */

INSERT INTO tblAplicacionesAbonos (
    ID_AP,
    ABONO_ID,
    OBLIGACION_ID,
    MONTO,
    ACTIVO,
    COMENTARIOS
)
VALUES
    (
        1,
        1,
        4,
        100000.00,
        1,
        'LIQUIDACION TOTAL DEL CUPON 1'
    ),
    (
        2,
        1,
        5,
        50000.00,
        1,
        'APLICACION PARCIAL AL CUPON 2'
    ),
    (
        3,
        2,
        5,
        25000.00,
        1,
        'SEGUNDA APLICACION PARCIAL AL CUPON 2'
    );


/* Convierte todos los importes del seed a centavos enteros. */

UPDATE tblUnits
SET SUBTOTAL = CAST(ROUND(SUBTOTAL * 100) AS INTEGER),
    IVA = CAST(ROUND(IVA * 100) AS INTEGER),
    TOTAL = CAST(ROUND(TOTAL * 100) AS INTEGER);

UPDATE tblFinanciamientos
SET MONTO_CUPONES = CAST(ROUND(MONTO_CUPONES * 100) AS INTEGER),
    MONTO_BALLOON = CAST(ROUND(MONTO_BALLOON * 100) AS INTEGER);

UPDATE tblFinCalendario SET MONTO = CAST(ROUND(MONTO * 100) AS INTEGER);
UPDATE tblFinAplicaciones SET MONTO_AMPARADO = CAST(ROUND(MONTO_AMPARADO * 100) AS INTEGER);
UPDATE tblDoctosXPagar SET MONTO = CAST(ROUND(MONTO * 100) AS INTEGER);
UPDATE tblAbonos SET MONTO = CAST(ROUND(MONTO * 100) AS INTEGER);
UPDATE tblAplicacionesAbonos SET MONTO = CAST(ROUND(MONTO * 100) AS INTEGER);

/* La obligación 4 quedó completamente liquidada */

UPDATE tblDoctosXPagar
SET
    PAGADO = 1,
    COMENTARIOS = 'FIN-DEMO-001 / CUPON 1; LIQUIDADO'
WHERE OBLIGACION_ID = 4;


COMMIT;
