use crate::db;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Concesionario {
    id_con: i64,
    name: String,
    cluster: Option<String>,
    rfc: String,
    comentarios: Option<String>,
}

#[tauri::command]
pub fn listar_concesionarios() -> Result<Vec<Concesionario>, String> {
    let conexion = db::abrir_bd_pruebas()?;

    let mut consulta = conexion
        .prepare(
            "
            SELECT
                ID_CON,
                NAME_,
                CLUSTER,
                RFC,
                COMENTARIOS
            FROM tblConcesionarios
            WHERE ACTIVO = 1
            ORDER BY NAME_
            ",
        )
        .map_err(|error| {
            format!("No fue posible preparar la consulta de concesionarios: {error}")
        })?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(Concesionario {
                id_con: fila.get(0)?,
                name: fila.get(1)?,
                cluster: fila.get(2)?,
                rfc: fila.get(3)?,
                comentarios: fila.get(4)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar los concesionarios: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer los concesionarios: {error}"))
}
