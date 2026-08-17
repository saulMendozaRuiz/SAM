use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use std::{
    env,
    path::{Path, PathBuf},
    time::Duration,
};

const VERSION_ESQUEMA: i64 = 5;

fn ruta_directorio_proyecto() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("database")
}

pub fn ruta_bd() -> PathBuf {
    if cfg!(debug_assertions) {
        return ruta_directorio_proyecto().join("sam_test.db");
    }

    env::current_exe()
        .ok()
        .and_then(|ruta| ruta.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("database")
        .join("sam.db")
}

fn comprobar_existencia(ruta: &Path) -> Result<(), String> {
    if ruta.exists() {
        return Ok(());
    }

    Err(format!(
        "No se encontró la base de datos: {}",
        ruta.display(),
    ))
}

fn configurar_conexion(conexion: &Connection) -> Result<(), String> {
    conexion
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("No fue posible activar foreign_keys: {error}"))?;

    conexion
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("No fue posible configurar busy_timeout: {error}"))?;

    Ok(())
}

fn tiene_columna(conexion: &Connection, tabla: &str, columna: &str) -> Result<bool, String> {
    let mut consulta = conexion
        .prepare(&format!("PRAGMA table_info({tabla})"))
        .map_err(|error| format!("No fue posible inspeccionar {tabla}: {error}"))?;
    let nombres = consulta
        .query_map([], |fila| fila.get::<_, String>(1))
        .map_err(|error| format!("No fue posible leer las columnas de {tabla}: {error}"))?;

    for nombre in nombres {
        if nombre.map_err(|error| format!("No fue posible leer una columna: {error}"))? == columna {
            return Ok(true);
        }
    }

    Ok(false)
}

fn validar_esquema(conexion: &Connection) -> Result<(), String> {
    if !tiene_columna(conexion, "tblUnits", "FINANCIADO")? {
        return Err("El esquema no contiene tblUnits.FINANCIADO".to_string());
    }

    if !tiene_columna(conexion, "tblDoctosXPagar", "ID_CUPON")? {
        return Err("El esquema no contiene tblDoctosXPagar.ID_CUPON".to_string());
    }

    let indice_valido: i64 = conexion
        .query_row(
            "
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'index'
              AND name = 'idx_dpp_cupon'
              AND UPPER(sql) LIKE 'CREATE UNIQUE INDEX%'
            ",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible validar idx_dpp_cupon: {error}"))?;

    if indice_valido != 1 {
        return Err("El indice unico idx_dpp_cupon no tiene la definicion esperada".to_string());
    }

    let fk_valida: i64 = conexion
        .query_row(
            "
            SELECT COUNT(*)
            FROM pragma_foreign_key_list('tblDoctosXPagar')
            WHERE \"from\" = 'ID_CUPON'
              AND \"table\" = 'tblFinCalendario'
              AND \"to\" = 'ID_CUPON'
            ",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible validar la FK de ID_CUPON: {error}"))?;

    if fk_valida != 1 {
        return Err(
            "La FK de tblDoctosXPagar.ID_CUPON no tiene la definicion esperada".to_string(),
        );
    }

    let historial_valido: i64 = conexion
        .query_row(
            "
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'tblCambiosVencimiento'
            ",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible validar el historial de vencimientos: {error}"))?;

    if historial_valido != 1 {
        return Err("El esquema no contiene tblCambiosVencimiento".to_string());
    }

    let bloqueo_valido: i64 = conexion
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'index' AND name = 'uq_fin_unidad_activa'
               AND UPPER(sql) LIKE '%UNIQUE INDEX%'
               AND UPPER(sql) LIKE '%WHERE ACTIVO = 1%'",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible validar el bloqueo de unidades: {error}"))?;

    if bloqueo_valido != 1 {
        return Err("El esquema no contiene el bloqueo unico de unidades financiadas".to_string());
    }

    Ok(())
}

pub fn preparar_bd() -> Result<(), String> {
    let ruta = ruta_bd();
    comprobar_existencia(&ruta)?;

    let mut conexion = Connection::open_with_flags(&ruta, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|error| format!("No fue posible abrir {}: {}", ruta.display(), error))?;
    configurar_conexion(&conexion)?;

    let version: i64 = conexion
        .query_row("PRAGMA user_version", [], |fila| fila.get(0))
        .map_err(|error| format!("No fue posible consultar la version del esquema: {error}"))?;

    if version > VERSION_ESQUEMA {
        return Err(format!(
            "La base usa el esquema {version}, pero esta version de SAM solo admite hasta {VERSION_ESQUEMA}"
        ));
    }

    if version == VERSION_ESQUEMA {
        return validar_esquema(&conexion);
    }

    let requiere_columna = !tiene_columna(&conexion, "tblDoctosXPagar", "ID_CUPON")?;

    let transaccion = conexion
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("No fue posible iniciar la migracion de calendario: {error}"))?;

    if requiere_columna {
        transaccion
            .execute_batch(
                "
            ALTER TABLE tblDoctosXPagar
                ADD COLUMN ID_CUPON INTEGER
                REFERENCES tblFinCalendario (ID_CUPON)
                ON UPDATE RESTRICT
                ON DELETE RESTRICT;
                ",
            )
            .map_err(|error| format!("No fue posible agregar ID_CUPON: {error}"))?;
    }

    transaccion
        .execute_batch(
            "
            CREATE UNIQUE INDEX IF NOT EXISTS idx_dpp_cupon
                ON tblDoctosXPagar (ID_CUPON)
                WHERE ID_CUPON IS NOT NULL;

            UPDATE tblDoctosXPagar AS D
            SET ID_CUPON = (
                SELECT MIN(C.ID_CUPON)
                FROM tblFinCalendario AS C
                WHERE C.ID_FINTO = D.ID_FINTO
                  AND C.VENCIMIENTO = D.VENCIMIENTO
                  AND C.MONTO = D.MONTO
                  AND C.COMENTARIOS = D.COMENTARIOS
                  AND C.ACTIVO = D.ACTIVO
                HAVING COUNT(*) = 1
            )
            WHERE D.ENTITY = 'FIN'
              AND D.ID_CUPON IS NULL
              AND (
                  SELECT COUNT(*)
                  FROM tblFinCalendario AS C
                  WHERE C.ID_FINTO = D.ID_FINTO
                    AND C.VENCIMIENTO = D.VENCIMIENTO
                    AND C.MONTO = D.MONTO
                    AND C.COMENTARIOS = D.COMENTARIOS
                    AND C.ACTIVO = D.ACTIVO
              ) = 1
              AND (
                  SELECT COUNT(*)
                  FROM tblDoctosXPagar AS D2
                  WHERE D2.ENTITY = 'FIN'
                    AND D2.ID_FINTO = D.ID_FINTO
                    AND D2.VENCIMIENTO = D.VENCIMIENTO
                    AND D2.MONTO = D.MONTO
                    AND D2.COMENTARIOS = D.COMENTARIOS
                    AND D2.ACTIVO = D.ACTIVO
              ) = 1;
            ",
        )
        .map_err(|error| format!("No fue posible migrar el enlace de calendario: {error}"))?;

    if version < 2 {
        let importes_invalidos: i64 = transaccion
            .query_row(
                "
                WITH importes(valor) AS (
                    SELECT SUBTOTAL FROM tblUnits UNION ALL
                    SELECT IVA FROM tblUnits UNION ALL
                    SELECT TOTAL FROM tblUnits UNION ALL
                    SELECT MONTO_CUPONES FROM tblFinanciamientos UNION ALL
                    SELECT MONTO_BALLOON FROM tblFinanciamientos UNION ALL
                    SELECT MONTO FROM tblFinCalendario UNION ALL
                    SELECT MONTO_AMPARADO FROM tblFinAplicaciones UNION ALL
                    SELECT MONTO FROM tblDoctosXPagar UNION ALL
                    SELECT MONTO FROM tblAbonos UNION ALL
                    SELECT MONTO FROM tblAplicacionesAbonos
                )
                SELECT COUNT(*)
                FROM importes
                WHERE ABS(valor) > 92233720368547758.07
                   OR ABS(valor * 100 - ROUND(valor * 100)) > 0.000001
                ",
                [],
                |fila| fila.get(0),
            )
            .map_err(|error| format!("No fue posible validar los importes existentes: {error}"))?;

        if importes_invalidos != 0 {
            return Err(format!(
                "La migracion a centavos encontro {importes_invalidos} importes con mas de dos decimales o fuera de rango"
            ));
        }

        transaccion
            .execute_batch(
                "
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
                ",
            )
            .map_err(|error| format!("No fue posible migrar los importes a centavos: {error}"))?;
    }

    if version < 3 {
        transaccion
            .execute_batch(
                "
                CREATE TABLE tblCambiosVencimiento (
                    ID_CAMBIO              INTEGER PRIMARY KEY,
                    OBLIGACION_ID          INTEGER NOT NULL,
                    ID_CUPON               INTEGER,
                    VENCIMIENTO_ANTERIOR   TEXT NOT NULL,
                    VENCIMIENTO_NUEVO      TEXT NOT NULL,
                    MOTIVO                 TEXT NOT NULL
                                           CHECK (LENGTH(TRIM(MOTIVO)) > 0),
                    CREATED_AT             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CHECK (VENCIMIENTO_ANTERIOR <> VENCIMIENTO_NUEVO)
                );

                CREATE INDEX idx_cambios_vencimiento_obligacion
                    ON tblCambiosVencimiento (OBLIGACION_ID, CREATED_AT);
                ",
            )
            .map_err(|error| {
                format!("No fue posible crear el historial de vencimientos: {error}")
            })?;
    }

    if version < 4 {
        transaccion
            .execute_batch(
                "
                CREATE TABLE tblFinanciamientoUnidades (
                    ID_FIN_UNIDAD INTEGER PRIMARY KEY,
                    ID_FINTO INTEGER NOT NULL,
                    UNIT_ID INTEGER NOT NULL,
                    MONTO_ASIGNADO INTEGER NOT NULL CHECK (MONTO_ASIGNADO > 0),
                    PAGO_DIRECTO_CON INTEGER NOT NULL CHECK (PAGO_DIRECTO_CON IN (0, 1)),
                    ACTIVO INTEGER NOT NULL DEFAULT 1 CHECK (ACTIVO IN (0, 1)),
                    ERASED_AT TEXT,
                    COMENTARIOS TEXT,
                    CREATED_AT TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UPDATED_AT TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ID_FINTO) REFERENCES tblFinanciamientos (ID_FINTO)
                        ON UPDATE RESTRICT ON DELETE RESTRICT,
                    FOREIGN KEY (UNIT_ID) REFERENCES tblUnits (UNITID)
                        ON UPDATE RESTRICT ON DELETE RESTRICT
                );
                CREATE INDEX idx_fin_unidades_finto
                    ON tblFinanciamientoUnidades (ID_FINTO);
                CREATE UNIQUE INDEX uq_fin_unidad_activa
                    ON tblFinanciamientoUnidades (UNIT_ID)
                    WHERE ACTIVO = 1;

                INSERT INTO tblFinanciamientoUnidades (
                    ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON, ACTIVO, COMENTARIOS
                )
                SELECT FA.ID_FINTO, D.UNIT_ID, SUM(FA.MONTO_AMPARADO), 1, 1,
                       'MIGRADO DESDE APLICACIONES'
                FROM tblFinAplicaciones AS FA
                JOIN tblDoctosXPagar AS D ON D.OBLIGACION_ID = FA.ID_DPP
                JOIN tblFinanciamientos AS F ON F.ID_FINTO = FA.ID_FINTO
                WHERE FA.ACTIVO = 1 AND D.UNIT_ID IS NOT NULL AND F.ACTIVO = 1
                GROUP BY FA.ID_FINTO, D.UNIT_ID;
                ",
            )
            .map_err(|error| format!("No fue posible crear el bloqueo de unidades: {error}"))?;
    }

    if version < 5 {
        transaccion
            .execute_batch(
                "
                ALTER TABLE tblUnits
                    ADD COLUMN FINANCIADO INTEGER NOT NULL DEFAULT 0
                    CHECK (FINANCIADO IN (0, 1));

                UPDATE tblUnits
                SET FINANCIADO = 1
                WHERE EXISTS (
                    SELECT 1
                    FROM tblFinanciamientoUnidades AS FU
                    WHERE FU.UNIT_ID = tblUnits.UNITID
                      AND FU.ACTIVO = 1
                );
                ",
            )
            .map_err(|error| format!("No fue posible materializar FINANCIADO: {error}"))?;
    }

    transaccion
        .pragma_update(None, "user_version", VERSION_ESQUEMA)
        .map_err(|error| format!("No fue posible registrar la version del esquema: {error}"))?;

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar la migracion de calendario: {error}"))?;

    validar_esquema(&conexion)
}

pub fn contar_violaciones_logicas(conexion: &Connection) -> Result<i64, String> {
    conexion
        .query_row(
            "
            WITH
            financiado AS (
                SELECT ID_DPP, SUM(MONTO_AMPARADO) AS MONTO
                FROM tblFinAplicaciones WHERE ACTIVO = 1 GROUP BY ID_DPP
            ),
            abonado AS (
                SELECT OBLIGACION_ID, SUM(MONTO) AS MONTO
                FROM tblAplicacionesAbonos WHERE ACTIVO = 1 GROUP BY OBLIGACION_ID
            ),
            saldos AS (
                SELECT D.OBLIGACION_ID, D.PAGADO,
                       D.MONTO - COALESCE(F.MONTO, 0) - COALESCE(A.MONTO, 0) AS SALDO
                FROM tblDoctosXPagar AS D
                LEFT JOIN financiado AS F ON F.ID_DPP = D.OBLIGACION_ID
                LEFT JOIN abonado AS A ON A.OBLIGACION_ID = D.OBLIGACION_ID
                WHERE D.ACTIVO = 1
            ),
            violaciones AS (
                SELECT A.ID_FINAP AS ID
                FROM tblFinAplicaciones AS A
                LEFT JOIN tblDoctosXPagar AS D ON D.OBLIGACION_ID = A.ID_DPP
                WHERE D.OBLIGACION_ID IS NULL
                UNION ALL
                SELECT D.OBLIGACION_ID
                FROM tblDoctosXPagar AS D
                LEFT JOIN tblConcesionarios AS C
                  ON D.ENTITY = 'CON' AND C.ID_CON = D.ENTITY_ID
                LEFT JOIN tblFinancieras AS F
                  ON D.ENTITY = 'FIN' AND F.ID_FIN = D.ENTITY_ID
                WHERE (D.ENTITY = 'CON' AND C.ID_CON IS NULL)
                   OR (D.ENTITY = 'FIN' AND F.ID_FIN IS NULL)
                UNION ALL
                SELECT D.OBLIGACION_ID
                FROM tblDoctosXPagar AS D
                WHERE (D.ENTITY = 'CON' AND (D.UNIT_ID IS NULL OR D.ID_FINTO IS NOT NULL OR D.ID_CUPON IS NOT NULL))
                   OR (D.ENTITY = 'FIN' AND (D.ID_FINTO IS NULL OR D.UNIT_ID IS NOT NULL))
                UNION ALL
                SELECT A.ID_FINAP
                FROM tblFinAplicaciones AS A
                INNER JOIN tblDoctosXPagar AS D ON D.OBLIGACION_ID = A.ID_DPP
                INNER JOIN tblFinanciamientos AS F ON F.ID_FINTO = A.ID_FINTO
                WHERE A.ACTIVO = 1 AND (D.ACTIVO = 0 OR F.ACTIVO = 0)
                UNION ALL
                SELECT FU.ID_FIN_UNIDAD
                FROM tblFinanciamientoUnidades AS FU
                INNER JOIN tblUnits AS U ON U.UNITID = FU.UNIT_ID
                INNER JOIN tblFinanciamientos AS F ON F.ID_FINTO = FU.ID_FINTO
                WHERE FU.ACTIVO = 1 AND (U.ACTIVO = 0 OR F.ACTIVO = 0)
                UNION ALL
                SELECT D.OBLIGACION_ID
                FROM tblDoctosXPagar AS D
                INNER JOIN tblFinCalendario AS C ON C.ID_CUPON = D.ID_CUPON
                WHERE D.ID_FINTO <> C.ID_FINTO
                UNION ALL
                SELECT S.OBLIGACION_ID
                FROM saldos AS S
                WHERE S.SALDO < 0
                   OR S.PAGADO <> CASE WHEN S.SALDO = 0 THEN 1 ELSE 0 END
                UNION ALL
                SELECT U.UNITID
                FROM tblUnits AS U
                WHERE U.FINANCIADO <> CASE WHEN EXISTS (
                    SELECT 1
                    FROM tblFinanciamientoUnidades AS FU
                    WHERE FU.UNIT_ID = U.UNITID
                      AND FU.ACTIVO = 1
                ) THEN 1 ELSE 0 END
            )
            SELECT COUNT(*) FROM violaciones
            ",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible validar los puentes logicos: {error}"))
}

pub fn abrir_bd_lectura() -> Result<Connection, String> {
    let ruta = ruta_bd();

    comprobar_existencia(&ruta)?;

    let conexion = Connection::open_with_flags(&ruta, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("No fue posible abrir {}: {}", ruta.display(), error,))?;

    configurar_conexion(&conexion)?;

    Ok(conexion)
}

pub fn abrir_bd_escritura() -> Result<Connection, String> {
    let ruta = ruta_bd();

    comprobar_existencia(&ruta)?;

    let conexion = Connection::open_with_flags(&ruta, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|error| format!("No fue posible abrir {}: {}", ruta.display(), error,))?;

    configurar_conexion(&conexion)?;

    Ok(conexion)
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    #[test]
    fn una_unidad_solo_admite_un_financiamiento_activo() {
        let conexion = Connection::open_in_memory().expect("base en memoria");
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .expect("esquema valido");
        conexion
            .execute(
                "INSERT INTO tblConcesionarios (ID_CON, NAME_, RFC) VALUES (1, 'CON', 'CON010101AA1')",
                [],
            )
            .unwrap();
        conexion
            .execute(
                "INSERT INTO tblFinancieras (ID_FIN, RAZON_SOCIAL, RFC) VALUES (1, 'FIN', 'FIN010101AA1')",
                [],
            )
            .unwrap();
        conexion
            .execute(
                "INSERT INTO tblUnits (UNITID, ID_CON, VIN, MODELO_ANIO, MARCA, VERSION_, SUBTOTAL, IVA, TOTAL)
                 VALUES (1, 1, 'VIN-UNICO', 2026, 'M', 'V', 100, 16, 116)",
                [],
            )
            .unwrap();
        for id in [1_i64, 2] {
            conexion
                .execute(
                    "INSERT INTO tblFinanciamientos
                     (ID_FINTO, ID_FIN, FOLIO, EMISION, MONTO_CUPONES, CUPONES, MONTO_BALLOON)
                     VALUES (?1, 1, ?2, '2026-01-01', 116, 1, 0)",
                    params![id, format!("F-{id}")],
                )
                .unwrap();
        }

        conexion
            .execute(
                "INSERT INTO tblFinanciamientoUnidades
                 (ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON)
                 VALUES (1, 1, 116, 0)",
                [],
            )
            .unwrap();
        conexion
            .execute(
                "UPDATE tblUnits SET FINANCIADO = 1 WHERE UNITID = 1 AND FINANCIADO = 0",
                [],
            )
            .unwrap();
        assert_eq!(
            conexion
                .query_row(
                    "SELECT FINANCIADO FROM tblUnits WHERE UNITID = 1",
                    [],
                    |fila| fila.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
        assert!(conexion
            .execute(
                "INSERT INTO tblFinanciamientoUnidades
                 (ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON)
                 VALUES (2, 1, 116, 1)",
                [],
            )
            .is_err());

        conexion
            .execute(
                "UPDATE tblFinanciamientoUnidades SET ACTIVO = 0 WHERE ID_FINTO = 1",
                [],
            )
            .unwrap();
        conexion
            .execute("UPDATE tblUnits SET FINANCIADO = 0 WHERE UNITID = 1", [])
            .unwrap();
        assert!(conexion
            .execute(
                "INSERT INTO tblFinanciamientoUnidades
                 (ID_FINTO, UNIT_ID, MONTO_ASIGNADO, PAGO_DIRECTO_CON)
                 VALUES (2, 1, 116, 1)",
                [],
            )
            .is_ok());
    }

    #[test]
    fn diagnostico_detecta_guardian_financiado_divergente() {
        let conexion = Connection::open_in_memory().expect("base en memoria");
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .expect("esquema valido");
        conexion.execute("INSERT INTO tblConcesionarios (ID_CON, NAME_, RFC) VALUES (1, 'CON', 'CON010101AA1')", []).unwrap();
        conexion.execute(
            "INSERT INTO tblUnits (UNITID, ID_CON, VIN, MODELO_ANIO, MARCA, VERSION_, SUBTOTAL, IVA, TOTAL, FINANCIADO)
             VALUES (1, 1, 'VIN-DIVERGENTE', 2026, 'M', 'V', 100, 16, 116, 1)",
            [],
        ).unwrap();

        assert_eq!(super::contar_violaciones_logicas(&conexion).unwrap(), 1);
    }
}
