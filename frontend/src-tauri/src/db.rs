use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use std::{
    env,
    path::{Path, PathBuf},
    time::Duration,
};

const VERSION_ESQUEMA: i64 = 2;

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
                SELECT D.OBLIGACION_ID
                FROM tblDoctosXPagar AS D
                INNER JOIN tblFinCalendario AS C ON C.ID_CUPON = D.ID_CUPON
                WHERE D.ID_FINTO <> C.ID_FINTO
                UNION ALL
                SELECT S.OBLIGACION_ID
                FROM saldos AS S
                WHERE S.SALDO < 0
                   OR S.PAGADO <> CASE WHEN S.SALDO = 0 THEN 1 ELSE 0 END
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

/*
 * Alias temporal para los módulos que todavía
 * llaman abrir_bd_pruebas().
 *
 * Puedes eliminarlo cuando todos utilicen
 * abrir_bd_lectura().
 */
pub fn abrir_bd_pruebas() -> Result<Connection, String> {
    abrir_bd_lectura()
}

/*
 * Alias temporal para lib.rs, si todavía utiliza
 * ruta_bd_pruebas().
 */
pub fn ruta_bd_pruebas() -> PathBuf {
    ruta_bd()
}
