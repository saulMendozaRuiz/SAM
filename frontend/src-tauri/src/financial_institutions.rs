use crate::db;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct NuevaFinanciera {
    razon_social: String,
    rfc: String,
    comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Financiera {
    id_fin: i64,
    razon_social: String,
    rfc: String,
    comentarios: Option<String>,
}

#[tauri::command]
pub fn listar_financieras() -> Result<Vec<Financiera>, String> {
    let conexion = db::abrir_bd_lectura()?;

    let mut consulta = conexion
        .prepare(
            "
            SELECT
                ID_FIN,
                RAZON_SOCIAL,
                RFC,
                COMENTARIOS
            FROM tblFinancieras
            WHERE ACTIVO = 1
            ORDER BY RAZON_SOCIAL
            ",
        )
        .map_err(|error| format!("No fue posible preparar la consulta de financieras: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(Financiera {
                id_fin: fila.get(0)?,
                razon_social: fila.get(1)?,
                rfc: fila.get(2)?,
                comentarios: fila.get(3)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar las financieras: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer las financieras: {error}"))
}

#[tauri::command]
pub fn crear_financiera(entrada: NuevaFinanciera) -> Result<i64, String> {
    let razon_social = requerido(&entrada.razon_social, "La razón social")?;
    let rfc = requerido(&entrada.rfc, "El RFC")?.to_uppercase();
    let conexion = db::abrir_bd_escritura()?;
    conexion
        .execute(
            "INSERT INTO tblFinancieras (RAZON_SOCIAL, RFC, COMENTARIOS) VALUES (?1, ?2, ?3)",
            (&razon_social, &rfc, opcional(entrada.comentarios)),
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                return "Ya existe una financiera con ese RFC".to_string();
            }
            format!("No fue posible crear la financiera: {error}")
        })?;
    Ok(conexion.last_insert_rowid())
}

fn requerido(valor: &str, campo: &str) -> Result<String, String> {
    let valor = valor.trim();
    if valor.is_empty() {
        return Err(format!("{campo} es obligatorio"));
    }
    Ok(valor.to_string())
}

fn opcional(valor: Option<String>) -> Option<String> {
    valor
        .map(|texto| texto.trim().to_string())
        .filter(|texto| !texto.is_empty())
}
