use crate::db;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Financiera {
    id_fin: i64,
    razon_social: String,
    rfc: String,
    comentarios: Option<String>,
}

#[tauri::command]
pub fn listar_financieras() -> Result<Vec<Financiera>, String> {
    let conexion = db::abrir_bd_pruebas()?;

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
