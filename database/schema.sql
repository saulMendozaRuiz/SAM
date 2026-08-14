PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;


/* =========================================================
   CATÁLOGO DE FINANCIERAS
   ========================================================= */

CREATE TABLE tblFinancieras (
    ID_FIN          INTEGER PRIMARY KEY,
    RAZON_SOCIAL    TEXT NOT NULL,
    RFC             TEXT NOT NULL,
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (RFC)
);


/* =========================================================
   CATÁLOGO DE CONCESIONARIOS
   ========================================================= */

CREATE TABLE tblConcesionarios (
    ID_CON          INTEGER PRIMARY KEY,
    NAME_           TEXT NOT NULL,
    CLUSTER         TEXT,
    RFC             TEXT NOT NULL,
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (RFC)
);


/* =========================================================
   CATÁLOGO DE UNIDADES
   ========================================================= */

CREATE TABLE tblUnits (
    UNITID          INTEGER PRIMARY KEY,
    ID_CON          INTEGER NOT NULL,
    VIN             TEXT NOT NULL,
    NO_MOTOR        TEXT,
    MODELO_ANIO     INTEGER NOT NULL,
    MARCA           TEXT NOT NULL,
    VERSION_        TEXT NOT NULL,
    OC_MEXRAC       TEXT,
    FOLIO_FACTURA   TEXT,
    SUBTOTAL        INTEGER NOT NULL
                    CHECK (SUBTOTAL >= 0),
    IVA             INTEGER NOT NULL
                    CHECK (IVA >= 0),
    TOTAL           INTEGER NOT NULL
                    CHECK (TOTAL >= 0),
    ENTREGA_PATIO   TEXT,
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (VIN),

    FOREIGN KEY (ID_CON)
        REFERENCES tblConcesionarios (ID_CON)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   FINANCIAMIENTOS
   ========================================================= */

CREATE TABLE tblFinanciamientos (
    ID_FINTO        INTEGER PRIMARY KEY,
    ID_FIN          INTEGER NOT NULL,
    FOLIO           TEXT NOT NULL,
    EMISION         TEXT NOT NULL,
    MONTO_CUPONES   INTEGER NOT NULL
                    CHECK (MONTO_CUPONES >= 0),
    CUPONES         INTEGER NOT NULL
                    CHECK (CUPONES > 0),
    MONTO_BALLOON   INTEGER NOT NULL DEFAULT 0
                    CHECK (MONTO_BALLOON >= 0),
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (ID_FIN, FOLIO),

    FOREIGN KEY (ID_FIN)
        REFERENCES tblFinancieras (ID_FIN)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   CALENDARIO DE FINANCIAMIENTOS
   ========================================================= */

CREATE TABLE tblFinCalendario (
    ID_CUPON        INTEGER PRIMARY KEY,
    ID_FINTO        INTEGER NOT NULL,
    SERIE_PAGO      INTEGER NOT NULL,
    VENCIMIENTO     TEXT NOT NULL,
    MONTO           INTEGER NOT NULL
                    CHECK (MONTO > 0),
    IS_BALLOON      INTEGER NOT NULL DEFAULT 0
                    CHECK (IS_BALLOON IN (0, 1)),
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (ID_FINTO, SERIE_PAGO, IS_BALLOON),

    FOREIGN KEY (ID_FINTO)
        REFERENCES tblFinanciamientos (ID_FINTO)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   APLICACIONES DE FINANCIAMIENTOS

   ID_DPP es un puente lógico hacia tblDoctosXPagar.
   No se declara como FK.
   ========================================================= */

CREATE TABLE tblFinAplicaciones (
    ID_FINAP        INTEGER PRIMARY KEY,
    ID_FINTO        INTEGER NOT NULL,
    ID_DPP          INTEGER NOT NULL,
    MONTO_AMPARADO  INTEGER NOT NULL
                    CHECK (MONTO_AMPARADO > 0),
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ID_FINTO)
        REFERENCES tblFinanciamientos (ID_FINTO)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   DOCUMENTOS POR PAGAR

   ENTITY + ENTITY_ID es un puente lógico.

   ID_FINTO es un puente lógico hacia financiamientos.
   UNIT_ID es un puente lógico hacia unidades.

   PAGADO representa saldo completamente cubierto. Puede
   provenir de abonos, financiamiento o refinanciamiento.
   ========================================================= */

CREATE TABLE tblDoctosXPagar (
    OBLIGACION_ID   INTEGER PRIMARY KEY,
    ENTITY          TEXT NOT NULL
                    CHECK (ENTITY IN ('CON', 'FIN')),
    ENTITY_ID       INTEGER NOT NULL,
    ID_FINTO        INTEGER,
    ID_CUPON        INTEGER,
    UNIT_ID         INTEGER,
    VENCIMIENTO     TEXT NOT NULL,
    MONTO           INTEGER NOT NULL
                    CHECK (MONTO > 0),
    PAGADO          INTEGER NOT NULL DEFAULT 0
                    CHECK (PAGADO IN (0, 1)),
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        (
            ENTITY = 'CON'
            AND UNIT_ID IS NOT NULL
        )
        OR
        (
            ENTITY = 'FIN'
            AND ID_FINTO IS NOT NULL
        )
    ),

    FOREIGN KEY (ID_CUPON)
        REFERENCES tblFinCalendario (ID_CUPON)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   ABONOS
   ========================================================= */

CREATE TABLE tblAbonos (
    ID_ABONO        INTEGER PRIMARY KEY,
    FECHA           TEXT NOT NULL,
    MONTO           INTEGER NOT NULL
                    CHECK (MONTO > 0),
    REFERENCIA      TEXT,
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/* =========================================================
   APLICACIONES DE ABONOS

   Se permite:
   - Repetir OBLIGACION_ID.
   - Repetir ABONO_ID.
   - Repetir incluso la pareja ABONO_ID + OBLIGACION_ID.

   ID_AP identifica de manera única cada aplicación.
   ========================================================= */

CREATE TABLE tblAplicacionesAbonos (
    ID_AP           INTEGER PRIMARY KEY,
    ABONO_ID        INTEGER NOT NULL,
    OBLIGACION_ID   INTEGER NOT NULL,
    MONTO           INTEGER NOT NULL
                    CHECK (MONTO > 0),
    ACTIVO          INTEGER NOT NULL DEFAULT 1
                    CHECK (ACTIVO IN (0, 1)),
    ERASED_AT       TEXT,
    COMENTARIOS     TEXT,
    CREATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ABONO_ID)
        REFERENCES tblAbonos (ID_ABONO)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    FOREIGN KEY (OBLIGACION_ID)
        REFERENCES tblDoctosXPagar (OBLIGACION_ID)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
);


/* =========================================================
   ÍNDICES
   ========================================================= */

CREATE INDEX idx_units_id_con
    ON tblUnits (ID_CON);

CREATE INDEX idx_finto_id_fin
    ON tblFinanciamientos (ID_FIN);

CREATE INDEX idx_calendario_finto_vencimiento
    ON tblFinCalendario (ID_FINTO, VENCIMIENTO);

CREATE INDEX idx_finap_id_finto
    ON tblFinAplicaciones (ID_FINTO);

CREATE INDEX idx_finap_id_dpp
    ON tblFinAplicaciones (ID_DPP);

CREATE INDEX idx_dpp_entity
    ON tblDoctosXPagar (ENTITY, ENTITY_ID);

CREATE INDEX idx_dpp_vencimiento
    ON tblDoctosXPagar (VENCIMIENTO);

CREATE INDEX idx_dpp_unit
    ON tblDoctosXPagar (UNIT_ID);

CREATE INDEX idx_dpp_finto
    ON tblDoctosXPagar (ID_FINTO);

CREATE UNIQUE INDEX idx_dpp_cupon
    ON tblDoctosXPagar (ID_CUPON)
    WHERE ID_CUPON IS NOT NULL;

CREATE INDEX idx_abonos_fecha
    ON tblAbonos (FECHA);

CREATE INDEX idx_aplicaciones_abono
    ON tblAplicacionesAbonos (ABONO_ID);

CREATE INDEX idx_aplicaciones_obligacion
    ON tblAplicacionesAbonos (OBLIGACION_ID);


/* =========================================================
   TRIGGERS DE UPDATED_AT
   ========================================================= */

CREATE TRIGGER trg_financieras_updated_at
AFTER UPDATE ON tblFinancieras
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblFinancieras
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_FIN = OLD.ID_FIN;
END;


CREATE TRIGGER trg_concesionarios_updated_at
AFTER UPDATE ON tblConcesionarios
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblConcesionarios
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_CON = OLD.ID_CON;
END;


CREATE TRIGGER trg_units_updated_at
AFTER UPDATE ON tblUnits
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblUnits
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE UNITID = OLD.UNITID;
END;


CREATE TRIGGER trg_financiamientos_updated_at
AFTER UPDATE ON tblFinanciamientos
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblFinanciamientos
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_FINTO = OLD.ID_FINTO;
END;


CREATE TRIGGER trg_fin_calendario_updated_at
AFTER UPDATE ON tblFinCalendario
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblFinCalendario
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_CUPON = OLD.ID_CUPON;
END;


CREATE TRIGGER trg_fin_aplicaciones_updated_at
AFTER UPDATE ON tblFinAplicaciones
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblFinAplicaciones
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_FINAP = OLD.ID_FINAP;
END;


CREATE TRIGGER trg_dpp_updated_at
AFTER UPDATE ON tblDoctosXPagar
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblDoctosXPagar
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE OBLIGACION_ID = OLD.OBLIGACION_ID;
END;


CREATE TRIGGER trg_abonos_updated_at
AFTER UPDATE ON tblAbonos
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblAbonos
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_ABONO = OLD.ID_ABONO;
END;


CREATE TRIGGER trg_aplicaciones_abonos_updated_at
AFTER UPDATE ON tblAplicacionesAbonos
FOR EACH ROW
WHEN NEW.UPDATED_AT = OLD.UPDATED_AT
BEGIN
    UPDATE tblAplicacionesAbonos
    SET UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID_AP = OLD.ID_AP;
END;


COMMIT;

PRAGMA user_version = 2;
