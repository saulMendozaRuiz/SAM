use crate::db;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Unidad {
    unitid: i64,
    id_con: i64,
    concesionario: String,
    vin: String,
    no_motor: Option<String>,
    modelo_anio: i64,
    marca: String,
    version: String,
    oc_mexrac: Option<String>,
    folio_factura: Option<String>,
    subtotal: f64,
    iva: f64,
    total: f64,
    entrega_patio: Option<String>,
    comentarios: Option<String>,
}

#[tauri::command]
pub fn listar_unidades() -> Result<Vec<Unidad>, String> {
    let conexion = db::abrir_bd_pruebas()?;

    let mut consulta = conexion
        .prepare(
            "
            SELECT
                U.UNITID,
                U.ID_CON,
                C.NAME_,
                U.VIN,
                U.NO_MOTOR,
                U.MODELO_ANIO,
                U.MARCA,
                U.VERSION_,
                U.OC_MEXRAC,
                U.FOLIO_FACTURA,
                U.SUBTOTAL,
                U.IVA,
                U.TOTAL,
                U.ENTREGA_PATIO,
                U.COMENTARIOS
            FROM tblUnits AS U
            INNER JOIN tblConcesionarios AS C
                ON C.ID_CON = U.ID_CON
            WHERE U.ACTIVO = 1
            ORDER BY U.UNITID
            ",
        )
        .map_err(|error| format!("No fue posible preparar la consulta de unidades: {error}"))?;

    let filas = consulta
        .query_map([], |fila| {
            Ok(Unidad {
                unitid: fila.get(0)?,
                id_con: fila.get(1)?,
                concesionario: fila.get(2)?,
                vin: fila.get(3)?,
                no_motor: fila.get(4)?,
                modelo_anio: fila.get(5)?,
                marca: fila.get(6)?,
                version: fila.get(7)?,
                oc_mexrac: fila.get(8)?,
                folio_factura: fila.get(9)?,
                subtotal: fila.get(10)?,
                iva: fila.get(11)?,
                total: fila.get(12)?,
                entrega_patio: fila.get(13)?,
                comentarios: fila.get(14)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar las unidades: {error}"))?;

    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer las unidades: {error}"))
}
