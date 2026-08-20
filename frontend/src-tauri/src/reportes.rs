use serde::Serialize;

use crate::db;

#[derive(Debug, Serialize)]
pub struct ResumenDeuda {
    pub entity: String,
    pub entity_id: i64,
    pub acreedor: Option<String>,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
}

#[derive(Debug, Serialize)]
pub struct UnidadSinCobertura {
    pub unitid: i64,
    pub vin: String,
    pub marca: String,
    pub version: String,
    pub concesionario: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub deuda_original: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub financiado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub abonado: i64,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
}

#[derive(Debug, Serialize)]
pub struct Vencimiento {
    pub obligacion_id: i64,
    pub entity: String,
    pub entity_id: i64,
    pub acreedor: Option<String>,
    pub vencimiento: String,
    #[serde(serialize_with = "crate::money::serializar_centavos")]
    pub saldo: i64,
    pub clasificacion: String,
}

#[tauri::command]
pub fn resumen_deuda() -> Result<Vec<ResumenDeuda>, String> {
    let conexion = db::abrir_bd_lectura()?;
    let mut consulta = conexion
        .prepare(
            "SELECT D.ENTITY, D.ENTITY_ID,
                CASE WHEN D.ENTITY = 'CON' THEN C.NAME_ ELSE F.RAZON_SOCIAL END,
                SUM(D.SALDO)
         FROM tblDoctosXPagar D
         LEFT JOIN tblConcesionarios C ON D.ENTITY = 'CON' AND C.ID_CON = D.ENTITY_ID
         LEFT JOIN tblFinancieras F ON D.ENTITY = 'FIN' AND F.ID_FIN = D.ENTITY_ID
         WHERE D.ACTIVO = 1 AND D.PAGADO = 0
         GROUP BY D.ENTITY, D.ENTITY_ID
         ORDER BY D.ENTITY, 3",
        )
        .map_err(|error| format!("No fue posible preparar el resumen: {error}"))?;
    let filas = consulta
        .query_map([], |fila| {
            Ok(ResumenDeuda {
                entity: fila.get(0)?,
                entity_id: fila.get(1)?,
                acreedor: fila.get(2)?,
                saldo: fila.get(3)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar el resumen: {error}"))?;
    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer el resumen: {error}"))
}

#[tauri::command]
pub fn unidades_sin_cobertura_total() -> Result<Vec<UnidadSinCobertura>, String> {
    let conexion = db::abrir_bd_lectura()?;
    let mut consulta = conexion
        .prepare(
            "SELECT U.UNITID, U.VIN, U.MARCA, U.VERSION_, C.NAME_, D.MONTO,
                COALESCE((SELECT SUM(A.MONTO_AMPARADO) FROM tblFinAplicaciones A
                          WHERE A.ID_DPP = D.OBLIGACION_ID AND A.ACTIVO = 1), 0),
                COALESCE((SELECT SUM(A.MONTO) FROM tblAplicacionesAbonos A
                          WHERE A.OBLIGACION_ID = D.OBLIGACION_ID AND A.ACTIVO = 1), 0),
                D.SALDO
         FROM tblDoctosXPagar D
         JOIN tblUnits U ON U.UNITID = D.UNIT_ID
         JOIN tblConcesionarios C ON C.ID_CON = U.ID_CON
         WHERE D.ENTITY = 'CON' AND D.ACTIVO = 1 AND D.PAGADO = 0
         ORDER BY D.SALDO DESC, U.UNITID",
        )
        .map_err(|error| format!("No fue posible preparar unidades sin cobertura: {error}"))?;
    let filas = consulta
        .query_map([], |fila| {
            Ok(UnidadSinCobertura {
                unitid: fila.get(0)?,
                vin: fila.get(1)?,
                marca: fila.get(2)?,
                version: fila.get(3)?,
                concesionario: fila.get(4)?,
                deuda_original: fila.get(5)?,
                financiado: fila.get(6)?,
                abonado: fila.get(7)?,
                saldo: fila.get(8)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar unidades sin cobertura: {error}"))?;
    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer unidades sin cobertura: {error}"))
}

#[tauri::command]
pub fn vencimientos() -> Result<Vec<Vencimiento>, String> {
    let conexion = db::abrir_bd_lectura()?;
    let mut consulta = conexion
        .prepare(
            "SELECT D.OBLIGACION_ID, D.ENTITY, D.ENTITY_ID,
                CASE WHEN D.ENTITY = 'CON' THEN C.NAME_ ELSE F.RAZON_SOCIAL END,
                D.VENCIMIENTO, D.SALDO,
                CASE
                    WHEN DATE(D.VENCIMIENTO) < DATE('now', 'localtime') AND D.ENTITY = 'CON'
                        THEN 'VENCIDO CONCESIONARIO'
                    WHEN DATE(D.VENCIMIENTO) < DATE('now', 'localtime') AND D.ENTITY = 'FIN'
                        THEN 'VENCIDO FINANCIERA'
                    WHEN D.ENTITY = 'CON' THEN 'POR VENCER CONCESIONARIO'
                    ELSE 'POR VENCER FINANCIERA'
                END
         FROM tblDoctosXPagar D
         LEFT JOIN tblConcesionarios C ON D.ENTITY = 'CON' AND C.ID_CON = D.ENTITY_ID
         LEFT JOIN tblFinancieras F ON D.ENTITY = 'FIN' AND F.ID_FIN = D.ENTITY_ID
         WHERE D.ACTIVO = 1 AND D.PAGADO = 0
         ORDER BY DATE(D.VENCIMIENTO), D.OBLIGACION_ID",
        )
        .map_err(|error| format!("No fue posible preparar vencimientos: {error}"))?;
    let filas = consulta
        .query_map([], |fila| {
            Ok(Vencimiento {
                obligacion_id: fila.get(0)?,
                entity: fila.get(1)?,
                entity_id: fila.get(2)?,
                acreedor: fila.get(3)?,
                vencimiento: fila.get(4)?,
                saldo: fila.get(5)?,
                clasificacion: fila.get(6)?,
            })
        })
        .map_err(|error| format!("No fue posible consultar vencimientos: {error}"))?;
    filas
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("No fue posible leer vencimientos: {error}"))
}
