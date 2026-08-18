use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::{db, security};

const CREDENCIALES_INVALIDAS: &str = "Usuario o contraseña incorrectos.";

#[derive(Debug, PartialEq, Serialize)]
pub struct UsuarioAutenticado {
    id_usuario: i64,
    usuario: String,
}

fn asegurar_usuario_inicial(conexion: &Connection) -> Result<(), String> {
    let usuarios: i64 = conexion
        .query_row("SELECT COUNT(*) FROM tblUsuarios", [], |fila| fila.get(0))
        .map_err(|error| format!("No fue posible consultar los usuarios: {error}"))?;
    if usuarios > 0 {
        return Ok(());
    }
    let hash = security::hash_password("admin123")?;
    conexion
        .execute(
            "INSERT INTO tblUsuarios (USUARIO, PASSWORD_HASH) VALUES ('user123', ?1)",
            [hash],
        )
        .map_err(|error| format!("No fue posible crear el usuario inicial: {error}"))?;
    Ok(())
}

fn autenticar_en_conexion(
    conexion: &Connection,
    usuario: &str,
    contrasena: &str,
) -> Result<UsuarioAutenticado, String> {
    let usuario = usuario.trim();
    if usuario.is_empty() || usuario.len() > 80 || contrasena.is_empty() || contrasena.len() > 256 {
        return Err(CREDENCIALES_INVALIDAS.to_string());
    }

    let registro = conexion
        .query_row(
            "SELECT ID_USUARIO, USUARIO, PASSWORD_HASH
             FROM tblUsuarios
             WHERE USUARIO = ?1 AND ACTIVO = 1",
            [usuario],
            |fila| {
                Ok((
                    fila.get::<_, i64>(0)?,
                    fila.get::<_, String>(1)?,
                    fila.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("No fue posible consultar el usuario: {error}"))?;

    let Some((id_usuario, usuario, password_hash)) = registro else {
        return Err(CREDENCIALES_INVALIDAS.to_string());
    };

    if !security::verify_password(contrasena, &password_hash) {
        return Err(CREDENCIALES_INVALIDAS.to_string());
    }

    Ok(UsuarioAutenticado {
        id_usuario,
        usuario,
    })
}

#[tauri::command]
pub fn autenticar_usuario(
    usuario: String,
    contrasena: String,
) -> Result<UsuarioAutenticado, String> {
    let conexion = db::abrir_bd_escritura()?;
    asegurar_usuario_inicial(&conexion)?;
    autenticar_en_conexion(&conexion, &usuario, &contrasena)
}
