pub fn validar_fecha_iso(valor: &str, campo: &str) -> Result<String, String> {
    let fecha = valor.trim();
    let bytes = fecha.as_bytes();

    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..].iter().all(u8::is_ascii_digit)
    {
        return Err(format!("{campo} debe utilizar el formato ISO YYYY-MM-DD"));
    }

    let anio = fecha[..4]
        .parse::<i32>()
        .map_err(|_| format!("{campo} no es una fecha ISO valida"))?;
    let mes = fecha[5..7]
        .parse::<u32>()
        .map_err(|_| format!("{campo} no es una fecha ISO valida"))?;
    let dia = fecha[8..]
        .parse::<u32>()
        .map_err(|_| format!("{campo} no es una fecha ISO valida"))?;

    let bisiesto = anio % 4 == 0 && (anio % 100 != 0 || anio % 400 == 0);
    let dias_del_mes = match mes {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if bisiesto => 29,
        2 => 28,
        _ => 0,
    };

    if anio < 1 || dia == 0 || dia > dias_del_mes {
        return Err(format!("{campo} no es una fecha ISO valida"));
    }

    Ok(fecha.to_string())
}

pub fn validar_rango_fechas(desde: &str, hasta: &str) -> Result<(String, String), String> {
    let desde = validar_fecha_iso(desde, "FECHA_DESDE")?;
    let hasta = validar_fecha_iso(hasta, "FECHA_HASTA")?;

    if desde > hasta {
        return Err("FECHA_DESDE no puede ser posterior a FECHA_HASTA".to_string());
    }

    Ok((desde, hasta))
}

pub fn dinero_a_centavos(valor: &str, campo: &str) -> Result<i64, String> {
    let limpio = valor.trim().replace(',', "");

    if limpio.is_empty() {
        return Err(format!("{campo} no puede estar vacio"));
    }

    if limpio.starts_with('-') {
        return Err(format!("{campo} no puede ser negativo"));
    }

    let partes: Vec<&str> = limpio.split('.').collect();
    if partes.len() > 2
        || partes[0].is_empty()
        || !partes[0].chars().all(|caracter| caracter.is_ascii_digit())
    {
        return Err(format!("{campo} debe ser un numero valido"));
    }

    let decimales = partes.get(1).copied().unwrap_or("");
    if decimales.len() > 2 || !decimales.chars().all(|caracter| caracter.is_ascii_digit()) {
        return Err(format!("{campo} debe tener maximo dos decimales"));
    }

    let pesos = partes[0]
        .parse::<i64>()
        .map_err(|_| format!("{campo} excede el importe permitido"))?;
    let centavos = match decimales.len() {
        0 => 0,
        1 => {
            decimales
                .parse::<i64>()
                .map_err(|_| format!("{campo} no es valido"))?
                * 10
        }
        2 => decimales
            .parse::<i64>()
            .map_err(|_| format!("{campo} no es valido"))?,
        _ => unreachable!(),
    };

    pesos
        .checked_mul(100)
        .and_then(|total| total.checked_add(centavos))
        .ok_or_else(|| format!("{campo} excede el importe permitido"))
}

#[cfg(test)]
mod tests {
    use super::{dinero_a_centavos, validar_fecha_iso, validar_rango_fechas};

    #[test]
    fn acepta_fechas_iso_validas() {
        assert_eq!(
            validar_fecha_iso("2024-02-29", "FECHA").unwrap(),
            "2024-02-29"
        );
        assert_eq!(
            validar_fecha_iso(" 2026-08-14 ", "FECHA").unwrap(),
            "2026-08-14"
        );
    }

    #[test]
    fn rechaza_fechas_imposibles_o_no_iso() {
        for fecha in [
            "2023-02-29",
            "2026-13-01",
            "2026-04-31",
            "14/08/2026",
            "2026-8-14",
        ] {
            assert!(validar_fecha_iso(fecha, "FECHA").is_err(), "{fecha}");
        }
    }

    #[test]
    fn valida_orden_del_rango() {
        assert!(validar_rango_fechas("2026-01-01", "2026-12-31").is_ok());
        assert!(validar_rango_fechas("2026-12-31", "2026-01-01").is_err());
    }

    #[test]
    fn convierte_dinero_sin_redondeo_binario() {
        assert_eq!(dinero_a_centavos("1,234.50", "MONTO").unwrap(), 123_450);
        assert_eq!(dinero_a_centavos("0.1", "MONTO").unwrap(), 10);
        assert!(dinero_a_centavos("1.999", "MONTO").is_err());
        assert!(dinero_a_centavos("1e3", "MONTO").is_err());
    }
}
