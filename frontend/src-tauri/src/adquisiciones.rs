use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

use crate::db::abrir_bd_escritura;

#[derive(Debug, Deserialize)]
pub struct UnidadAdquisicion {
    pub id_con: i64,
    pub vin: String,
    pub no_motor: Option<String>,
    pub modelo_anio: i64,
    pub marca: String,
    pub version: String,
    pub oc_mexrac: Option<String>,
    pub folio_factura: Option<String>,
    pub subtotal: String,
    pub iva: String,
    pub total: String,
    pub entrega_patio: Option<String>,
    pub vencimiento: String,
    pub comentarios: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdquisicionConfirmada {
    pub unitids: Vec<i64>,
    pub unidades_guardadas: usize,
    pub obligaciones_guardadas: usize,
    pub monto_obligaciones: String,
}

fn texto_requerido(valor: &str, campo: &str) -> Result<String, String> {
    let limpio = valor.trim();

    if limpio.is_empty() {
        return Err(format!("El campo {campo} es obligatorio",));
    }

    Ok(limpio.to_uppercase())
}

fn texto_opcional(valor: Option<String>) -> Option<String> {
    valor.and_then(|texto| {
        let limpio = texto.trim();

        if limpio.is_empty() {
            None
        } else {
            Some(limpio.to_string())
        }
    })
}

fn dinero_a_centavos(valor: &str, campo: &str) -> Result<i64, String> {
    let limpio = valor.trim().replace(',', "");

    if limpio.is_empty() {
        return Err(format!("El campo {campo} es obligatorio",));
    }

    let negativo = limpio.starts_with('-');

    if negativo {
        return Err(format!("El campo {campo} no puede ser negativo",));
    }

    let partes: Vec<&str> = limpio.split('.').collect();

    if partes.len() > 2 {
        return Err(format!("El importe de {campo} no es válido",));
    }

    let enteros = partes[0];

    if enteros.is_empty() || !enteros.chars().all(|caracter| caracter.is_ascii_digit()) {
        return Err(format!("El importe de {campo} no es válido",));
    }

    let decimales = if partes.len() == 2 { partes[1] } else { "" };

    if decimales.len() > 2 || !decimales.chars().all(|caracter| caracter.is_ascii_digit()) {
        return Err(format!(
            "El importe de {campo} debe tener máximo dos decimales",
        ));
    }

    let pesos: i64 = enteros
        .parse()
        .map_err(|_| format!("El importe de {campo} es demasiado grande"))?;

    let centavos = match decimales.len() {
        0 => 0,
        1 => {
            decimales
                .parse::<i64>()
                .map_err(|_| format!("El importe de {campo} no es válido"))?
                * 10
        }
        2 => decimales
            .parse::<i64>()
            .map_err(|_| format!("El importe de {campo} no es válido"))?,
        _ => unreachable!(),
    };

    pesos
        .checked_mul(100)
        .and_then(|resultado| resultado.checked_add(centavos))
        .ok_or_else(|| format!("El importe de {campo} es demasiado grande"))
}

fn centavos_a_decimal(centavos: i64) -> String {
    format!("{}.{:02}", centavos / 100, centavos % 100,)
}

fn validar_concesionario(transaccion: &Transaction<'_>, id_con: i64) -> Result<(), String> {
    let encontrado: Option<i64> = transaccion
        .query_row(
            "
                SELECT ID_CON
                FROM tblConcesionarios
                WHERE ID_CON = ?1
                  AND ACTIVO = 1
                ",
            [id_con],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible validar el concesionario: {error}"))?;

    if encontrado.is_none() {
        return Err(format!(
            "El concesionario {id_con} no existe o está inactivo",
        ));
    }

    Ok(())
}

fn validar_vin_disponible(transaccion: &Transaction<'_>, vin: &str) -> Result<(), String> {
    let existente: Option<i64> = transaccion
        .query_row(
            "
                SELECT UNITID
                FROM tblUnits
                WHERE VIN = ?1
                ",
            [vin],
            |fila| fila.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible validar el VIN {vin}: {error}"))?;

    if existente.is_some() {
        return Err(format!("El VIN {vin} ya existe en la base de datos",));
    }

    Ok(())
}

#[tauri::command]
pub fn confirmar_adquisicion(
    unidades: Vec<UnidadAdquisicion>,
) -> Result<AdquisicionConfirmada, String> {
    if unidades.is_empty() {
        return Err("La adquisición debe contener al menos una unidad".to_string());
    }

    let mut conexion = abrir_bd_escritura()?;

    let transaccion = conexion
        .transaction()
        .map_err(|error| format!("No fue posible iniciar la transacción: {error}"))?;

    let mut vins_capturados = std::collections::HashSet::new();

    let mut unitids = Vec::new();
    let mut monto_total_centavos = 0_i64;

    for (indice, unidad) in unidades.iter().enumerate() {
        let numero = indice + 1;

        let vin = texto_requerido(&unidad.vin, &format!("VIN de la unidad {numero}"))?;

        if !vins_capturados.insert(vin.clone()) {
            return Err(format!(
                "El VIN {vin} está repetido dentro de la adquisición",
            ));
        }

        validar_concesionario(&transaccion, unidad.id_con)?;

        validar_vin_disponible(&transaccion, &vin)?;

        if unidad.modelo_anio <= 0 {
            return Err(format!("El modelo del VIN {vin} no es válido",));
        }

        let marca = texto_requerido(&unidad.marca, &format!("marca del VIN {vin}"))?;

        let version = texto_requerido(&unidad.version, &format!("versión del VIN {vin}"))?;

        let vencimiento = unidad.vencimiento.trim().to_string();

        if vencimiento.is_empty() {
            return Err(format!("El VIN {vin} no tiene vencimiento",));
        }

        let subtotal_centavos = dinero_a_centavos(&unidad.subtotal, "subtotal")?;

        let iva_centavos = dinero_a_centavos(&unidad.iva, "IVA")?;

        let total_centavos = dinero_a_centavos(&unidad.total, "total")?;

        if total_centavos <= 0 {
            return Err(format!("El total del VIN {vin} debe ser mayor que cero",));
        }

        if subtotal_centavos + iva_centavos != total_centavos {
            return Err(format!(
                "El subtotal más IVA del VIN {vin} no coincide con el total",
            ));
        }

        monto_total_centavos = monto_total_centavos
            .checked_add(total_centavos)
            .ok_or_else(|| "El monto total de la adquisición es demasiado grande".to_string())?;

        let subtotal = centavos_a_decimal(subtotal_centavos);

        let iva = centavos_a_decimal(iva_centavos);

        let total = centavos_a_decimal(total_centavos);

        let no_motor = texto_opcional(unidad.no_motor.clone()).map(|texto| texto.to_uppercase());

        let oc_mexrac = texto_opcional(unidad.oc_mexrac.clone());

        let folio_factura = texto_opcional(unidad.folio_factura.clone());

        let entrega_patio = texto_opcional(unidad.entrega_patio.clone());

        let comentarios = texto_opcional(unidad.comentarios.clone());

        transaccion
            .execute(
                "
                INSERT INTO tblUnits (
                    ID_CON,
                    VIN,
                    NO_MOTOR,
                    MODELO_ANIO,
                    MARCA,
                    VERSION_,
                    OC_MEXRAC,
                    FOLIO_FACTURA,
                    SUBTOTAL,
                    IVA,
                    TOTAL,
                    ENTREGA_PATIO,
                    COMENTARIOS
                )
                VALUES (
                    ?1, ?2, ?3, ?4, ?5,
                    ?6, ?7, ?8, ?9, ?10,
                    ?11, ?12, ?13
                )
                ",
                params![
                    unidad.id_con,
                    vin,
                    no_motor,
                    unidad.modelo_anio,
                    marca,
                    version,
                    oc_mexrac,
                    folio_factura,
                    subtotal,
                    iva,
                    total,
                    entrega_patio,
                    comentarios,
                ],
            )
            .map_err(|error| format!("No fue posible guardar el VIN {}: {}", unidad.vin, error,))?;

        let unitid = transaccion.last_insert_rowid();

        unitids.push(unitid);

        transaccion
            .execute(
                "
                INSERT INTO tblDoctosXPagar (
                    ENTITY,
                    ENTITY_ID,
                    UNIT_ID,
                    VENCIMIENTO,
                    MONTO,
                    PAGADO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES (
                    'CON',
                    ?1,
                    ?2,
                    ?3,
                    ?4,
                    0,
                    1,
                    ?5
                )
                ",
                params![
                    unidad.id_con,
                    unitid,
                    vencimiento,
                    total,
                    "ADQUISICION VEHICULO",
                ],
            )
            .map_err(|error| {
                format!(
                    "No fue posible crear la obligación del VIN {}: {}",
                    unidad.vin, error,
                )
            })?;
    }

    transaccion
        .commit()
        .map_err(|error| format!("No fue posible confirmar la adquisición: {error}"))?;

    let cantidad = unitids.len();

    Ok(AdquisicionConfirmada {
        unitids,
        unidades_guardadas: cantidad,
        obligaciones_guardadas: cantidad,
        monto_obligaciones: centavos_a_decimal(monto_total_centavos),
    })
}
