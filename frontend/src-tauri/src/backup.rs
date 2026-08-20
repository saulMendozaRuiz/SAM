use std::path::{Path, PathBuf};

use rusqlite::{Connection, MAIN_DB};

use crate::db;

fn ruta_disponible(directorio: &Path, marca: &str) -> PathBuf {
    let primera = directorio.join(format!("sam_{marca}.db"));
    if !primera.exists() {
        return primera;
    }

    for numero in 2.. {
        let candidata = directorio.join(format!("sam_{marca}_{numero}.db"));
        if !candidata.exists() {
            return candidata;
        }
    }

    unreachable!()
}

fn respaldar(conexion: &Connection, directorio: &Path, marca: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(directorio).map_err(|error| {
        format!(
            "No fue posible crear la carpeta de respaldos {}: {error}",
            directorio.display()
        )
    })?;

    let destino = ruta_disponible(directorio, marca);
    conexion
        .backup(MAIN_DB, &destino, None)
        .map_err(|error| format!("No fue posible crear el respaldo: {error}"))?;

    let copia = Connection::open(&destino)
        .map_err(|error| format!("No fue posible verificar el respaldo: {error}"))?;
    let integridad: String = copia
        .query_row("PRAGMA integrity_check", [], |fila| fila.get(0))
        .map_err(|error| format!("No fue posible verificar el respaldo: {error}"))?;

    if integridad != "ok" {
        drop(copia);
        let _ = std::fs::remove_file(&destino);
        return Err(format!("SQLite rechazó el respaldo: {integridad}"));
    }

    Ok(destino)
}

#[tauri::command]
pub fn crear_respaldo() -> Result<String, String> {
    let conexion = db::abrir_bd_lectura()?;
    let marca: String = conexion
        .query_row(
            "SELECT strftime('%Y%m%d_%H%M', 'now', 'localtime')",
            [],
            |fila| fila.get(0),
        )
        .map_err(|error| format!("No fue posible obtener la fecha del respaldo: {error}"))?;
    let raiz = db::ruta_bd()
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| "No fue posible determinar la carpeta de SAM".to_string())?
        .to_path_buf();
    let destino = respaldar(&conexion, &raiz.join("backups"), &marca)?;
    Ok(destino.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crea_y_verifica_una_copia_sqlite() {
        let origen = Connection::open_in_memory().unwrap();
        origen
            .execute_batch("CREATE TABLE dato (valor INTEGER); INSERT INTO dato VALUES (42);")
            .unwrap();
        let directorio =
            std::env::temp_dir().join(format!("sam-respaldo-prueba-{}", std::process::id()));

        let destino = respaldar(&origen, &directorio, "20260820_2137").unwrap();
        let copia = Connection::open(&destino).unwrap();
        let valor: i64 = copia
            .query_row("SELECT valor FROM dato", [], |fila| fila.get(0))
            .unwrap();

        assert_eq!(valor, 42);
        drop(copia);
        std::fs::remove_file(destino).unwrap();
        std::fs::remove_dir(directorio).unwrap();
    }
}
