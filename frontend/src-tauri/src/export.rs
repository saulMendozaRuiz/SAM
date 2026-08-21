use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
pub struct ArchivoExportado {
    nombre: String,
    ruta: String,
}

fn nombre_seguro(nombre: &str) -> String {
    let limpio: String = nombre
        .trim()
        .chars()
        .filter(|caracter| caracter.is_ascii_alphanumeric() || matches!(caracter, '-' | '_'))
        .collect();
    if limpio.is_empty() {
        "sam-export".to_string()
    } else {
        limpio
    }
}

fn ruta_disponible(directorio: &Path, nombre: &str) -> Result<(PathBuf, String), String> {
    for numero in 0..10_000 {
        let archivo = if numero == 0 {
            format!("{nombre}.csv")
        } else {
            format!("{nombre} ({numero}).csv")
        };
        let ruta = directorio.join(&archivo);
        if !ruta.exists() {
            return Ok((ruta, archivo));
        }
    }
    Err("No fue posible obtener un nombre disponible para la exportación".to_string())
}

#[tauri::command]
pub fn exportar_tabla(
    app: tauri::AppHandle,
    nombre: String,
    contenido: String,
) -> Result<ArchivoExportado, String> {
    let directorio = app
        .path()
        .download_dir()
        .map_err(|error| format!("No fue posible localizar la carpeta Descargas: {error}"))?;
    std::fs::create_dir_all(&directorio)
        .map_err(|error| format!("No fue posible preparar {}: {error}", directorio.display()))?;

    let (ruta, archivo) = ruta_disponible(&directorio, &nombre_seguro(&nombre))?;
    let mut salida = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&ruta)
        .map_err(|error| format!("No fue posible crear {}: {error}", ruta.display()))?;
    salida
        .write_all(contenido.as_bytes())
        .and_then(|_| salida.flush())
        .map_err(|error| format!("No fue posible escribir {}: {error}", ruta.display()))?;

    Ok(ArchivoExportado {
        nombre: archivo,
        ruta: directorio.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{nombre_seguro, ruta_disponible};

    #[test]
    fn limpia_el_nombre_y_no_reemplaza_archivos() {
        let directorio =
            std::env::temp_dir().join(format!("sam-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&directorio).unwrap();
        let base = nombre_seguro("unidades: 2026");
        assert_eq!(base, "unidades2026");
        let (primera, _) = ruta_disponible(&directorio, &base).unwrap();
        std::fs::write(&primera, b"test").unwrap();
        let (segunda, nombre) = ruta_disponible(&directorio, &base).unwrap();
        assert_ne!(primera, segunda);
        assert_eq!(nombre, "unidades2026 (1).csv");
        std::fs::remove_file(primera).ok();
        std::fs::remove_dir(directorio).ok();
    }
}
