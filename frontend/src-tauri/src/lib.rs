mod abonos;
mod adquisiciones;
mod calendar;
mod concessionaires;
mod db;
mod financial_institutions;
mod financing;
mod ledger;
mod money;
mod obligation_state;
mod obligations;
mod reportes;
mod units;
mod validation;
mod vencimientos;

use serde::Serialize;

#[derive(Serialize)]
struct VerificacionLigeraBd {
    foreign_keys: bool,
    violaciones_llaves: bool,
    violaciones_logicas: i64,
}

#[tauri::command]
fn verificar_bd_ligera() -> Result<VerificacionLigeraBd, String> {
    let conexion = db::abrir_bd_lectura()?;

    let foreign_keys: i64 = conexion
        .query_row("PRAGMA foreign_keys", [], |fila| fila.get(0))
        .map_err(|error| format!("No se pudo consultar foreign_keys: {error}"))?;

    let mut consulta = conexion
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| format!("No se pudo validar las llaves foráneas: {error}"))?;

    let mut filas = consulta
        .query([])
        .map_err(|error| format!("Falló la validación de llaves foráneas: {error}"))?;

    let hay_violaciones = filas
        .next()
        .map_err(|error| format!("No se pudo leer foreign_key_check: {error}"))?
        .is_some();

    Ok(VerificacionLigeraBd {
        foreign_keys: foreign_keys == 1,
        violaciones_llaves: hay_violaciones,
        violaciones_logicas: db::contar_violaciones_logicas(&conexion)?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    db::preparar_bd().expect("no fue posible preparar la base de datos de SAM");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            verificar_bd_ligera,
            reportes::resumen_deuda,
            reportes::unidades_sin_cobertura_total,
            reportes::vencimientos,
            units::listar_unidades,
            concessionaires::listar_concesionarios,
            financial_institutions::listar_financieras,
            obligations::listar_obligaciones,
            financing::listar_financiamientos,
            financing::listar_obligaciones_financiables,
            financing::confirmar_financiamiento,
            financing::cancelar_financiamiento,
            calendar::listar_calendario,
            ledger::listar_ledger,
            abonos::registrar_abono,
            adquisiciones::confirmar_adquisicion,
            vencimientos::corregir_vencimiento,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar SAM");
}
