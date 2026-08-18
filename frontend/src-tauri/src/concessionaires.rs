use crate::db;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct NuevoConcesionario {
    name: String,
    cluster: Option<String>,
    rfc: String,
    comentarios: Option<String>,
}

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
    let conexion = db::abrir_bd_lectura()?;

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

#[tauri::command]
pub fn crear_concesionario(entrada: NuevoConcesionario) -> Result<i64, String> {
    let name = requerido(&entrada.name, "La razón social")?;
    let rfc = requerido(&entrada.rfc, "El RFC")?.to_uppercase();
    let conexion = db::abrir_bd_escritura()?;
    conexion
        .execute(
            "INSERT INTO tblConcesionarios (NAME_, CLUSTER, RFC, COMENTARIOS) VALUES (?1, ?2, ?3, ?4)",
            (&name, opcional(entrada.cluster), &rfc, opcional(entrada.comentarios)),
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                return "Ya existe un concesionario con ese RFC".to_string();
            }
            format!("No fue posible crear el concesionario: {error}")
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
