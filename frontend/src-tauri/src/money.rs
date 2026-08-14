use serde::Serializer;

pub fn formatear_centavos(centavos: i64) -> String {
    let signo = if centavos < 0 { "-" } else { "" };
    let absoluto = centavos.unsigned_abs();
    format!("{signo}{}.{:02}", absoluto / 100, absoluto % 100)
}

pub fn serializar_centavos<S>(centavos: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&formatear_centavos(*centavos))
}

#[cfg(test)]
mod tests {
    use super::formatear_centavos;

    #[test]
    fn formatea_centavos_sin_punto_flotante() {
        assert_eq!(formatear_centavos(0), "0.00");
        assert_eq!(formatear_centavos(123_450), "1234.50");
        assert_eq!(formatear_centavos(-1), "-0.01");
        assert_eq!(formatear_centavos(i64::MIN), "-92233720368547758.08");
    }
}
