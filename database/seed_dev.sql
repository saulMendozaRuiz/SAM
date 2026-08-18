-- Datos ficticios mínimos para ejecutar y probar SAM en desarrollo.
-- Este archivo sólo se carga en compilaciones debug y es idempotente por RFC.

INSERT OR IGNORE INTO tblConcesionarios (NAME_, CLUSTER, RFC, COMENTARIOS)
VALUES
    ('CONCESIONARIO DEMO CENTRO', 'DEMO', 'DCO010101AAA', 'Dato ficticio de desarrollo'),
    ('CONCESIONARIO DEMO NORTE',  'DEMO', 'DNO010101AAA', 'Dato ficticio de desarrollo');

INSERT OR IGNORE INTO tblFinancieras (RAZON_SOCIAL, RFC, COMENTARIOS)
VALUES
    ('FINANCIERA DEMO UNO', 'FDU010101AAA', 'Dato ficticio de desarrollo'),
    ('FINANCIERA DEMO DOS', 'FDD010101AAA', 'Dato ficticio de desarrollo');
