use rusqlite::{Connection, OpenFlags};
use std::{env, path::PathBuf, time::Duration};

const VERSION_ESQUEMA: i64 = 1;

pub fn ruta_bd() -> PathBuf {
    if cfg!(debug_assertions) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("database")
            .join("sam_test.db");
    }
    if let Some(directorio) = env::var_os("SAM_DATA_DIR") {
        return PathBuf::from(directorio).join("sam.db");
    }
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join("MexRAC")
        .join("SAM")
        .join("database")
        .join("sam.db")
}

fn configurar(conexion: &Connection) -> Result<(), String> {
    conexion
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("No fue posible activar foreign_keys: {error}"))?;
    conexion
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("No fue posible configurar SQLite: {error}"))
}

fn abrir(flags: OpenFlags) -> Result<Connection, String> {
    let ruta = ruta_bd();
    if !ruta.exists() {
        return Err(format!(
            "No se encontró la base de datos: {}",
            ruta.display()
        ));
    }
    let conexion = Connection::open_with_flags(&ruta, flags)
        .map_err(|error| format!("No fue posible abrir {}: {error}", ruta.display()))?;
    configurar(&conexion)?;
    Ok(conexion)
}

pub fn preparar_bd() -> Result<(), String> {
    let ruta = ruta_bd();
    if !ruta.exists() {
        let directorio = ruta
            .parent()
            .ok_or_else(|| "La ruta de la base no tiene directorio".to_string())?;
        std::fs::create_dir_all(directorio)
            .map_err(|error| format!("No fue posible crear {}: {error}", directorio.display()))?;
        let conexion = Connection::open(&ruta)
            .map_err(|error| format!("No fue posible crear {}: {error}", ruta.display()))?;
        configurar(&conexion)?;
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .map_err(|error| format!("No fue posible crear la base de datos: {error}"))?;
    }

    let conexion = abrir(OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    let version: i64 = conexion
        .query_row("PRAGMA user_version", [], |fila| fila.get(0))
        .map_err(|error| format!("No fue posible leer la versión del esquema: {error}"))?;
    if version != VERSION_ESQUEMA {
        return Err(format!(
            "La base usa el esquema {version}; esta versión de SAM requiere {VERSION_ESQUEMA}. Elimina la base sintética y reinicia SAM."
        ));
    }
    if cfg!(debug_assertions) {
        conexion
            .execute_batch(include_str!("../../../database/seed_dev.sql"))
            .map_err(|error| format!("No fue posible cargar los datos de desarrollo: {error}"))?;
    }
    Ok(())
}

pub fn abrir_bd_lectura() -> Result<Connection, String> {
    abrir(OpenFlags::SQLITE_OPEN_READ_ONLY)
}

pub fn abrir_bd_escritura() -> Result<Connection, String> {
    abrir(OpenFlags::SQLITE_OPEN_READ_WRITE)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn el_schema_es_el_baseline_completo() {
        let conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .unwrap();
        let version: i64 = conexion
            .query_row("PRAGMA user_version", [], |fila| fila.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn el_seed_de_desarrollo_es_minimo_e_idempotente() {
        let conexion = Connection::open_in_memory().unwrap();
        conexion
            .execute_batch(include_str!("../../../database/schema.sql"))
            .unwrap();
        let seed = include_str!("../../../database/seed_dev.sql");
        conexion.execute_batch(seed).unwrap();
        conexion.execute_batch(seed).unwrap();

        let concesionarios: i64 = conexion
            .query_row("SELECT COUNT(*) FROM tblConcesionarios", [], |fila| {
                fila.get(0)
            })
            .unwrap();
        let financieras: i64 = conexion
            .query_row("SELECT COUNT(*) FROM tblFinancieras", [], |fila| {
                fila.get(0)
            })
            .unwrap();
        assert_eq!((concesionarios, financieras), (2, 2));
    }
}
