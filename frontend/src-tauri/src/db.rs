use rusqlite::{Connection, OpenFlags};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

fn ruta_directorio_proyecto() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("database")
}

pub fn ruta_bd() -> PathBuf {
    let directorio = ruta_directorio_proyecto();

    if cfg!(debug_assertions) {
        directorio.join("sam_test.db")
    } else {
        directorio.join("sam.db")
    }
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
