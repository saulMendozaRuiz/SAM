mod abonos;
mod adquisiciones;
mod auth;
mod backup;
mod calendar;
mod concessionaires;
mod db;
mod financial_institutions;
mod financing;
mod money;
mod obligation_state;
mod obligations;
mod reportes;
mod security;
mod unit_state;
mod units;
mod validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    db::preparar_bd().expect("no fue posible preparar la base de datos de SAM");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            auth::autenticar_usuario,
            backup::crear_respaldo,
            reportes::resumen_deuda,
            reportes::unidades_sin_cobertura_total,
            reportes::vencimientos,
            units::listar_unidades,
            units::corregir_vencimiento_con,
            units::corregir_entrega_patio,
            units::verificar_eliminacion_unidad,
            units::eliminar_unidad,
            concessionaires::listar_concesionarios,
            concessionaires::crear_concesionario,
            financial_institutions::listar_financieras,
            financial_institutions::crear_financiera,
            obligations::listar_obligaciones,
            financing::queries::listar_financiamientos,
            financing::queries::listar_obligaciones_financiables,
            financing::confirm::confirmar_financiamiento,
            financing::cancel::cancelar_financiamiento,
            calendar::listar_calendario,
            abonos::registrar_abono,
            adquisiciones::confirmar_adquisicion,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar SAM");
}
