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
