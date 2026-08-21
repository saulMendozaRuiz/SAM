use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

const MEMORY_COST_KIB: u32 = 5 * 1024;
const TIME_COST: u32 = 1;
const PARALLELISM: u32 = 1;

fn configured_argon2() -> Result<Argon2<'static>, String> {
    let params = Params::new(MEMORY_COST_KIB, TIME_COST, PARALLELISM, None)
        .map_err(|error| format!("No fue posible configurar Argon2: {error}"))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);

    configured_argon2()?
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| format!("No fue posible proteger la contraseña: {error}"))
}

pub fn verify_password(password: &str, encoded_hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(encoded_hash) else {
        return false;
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

pub fn needs_rehash(encoded_hash: &str) -> bool {
    let Ok(hash) = PasswordHash::new(encoded_hash) else {
        return true;
    };
    hash.algorithm.as_str() != "argon2id"
        || hash.version.map(u32::from) != Some(Version::V0x13.into())
        || hash.params.get_decimal("m").map(u32::from) != Some(MEMORY_COST_KIB)
        || hash.params.get_decimal("t").map(u32::from) != Some(TIME_COST)
        || hash.params.get_decimal("p").map(u32::from) != Some(PARALLELISM)
}

#[cfg(test)]
mod tests {
    use super::{hash_password, needs_rehash, verify_password};
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };

    #[test]
    fn genera_el_perfil_ligero_de_cinco_mib() {
        let hash = hash_password("secreto").unwrap();
        assert!(hash.contains("m=5120,t=1,p=1"));
        assert!(verify_password("secreto", &hash));
        assert!(!needs_rehash(&hash));
    }

    #[test]
    fn reconoce_un_hash_anterior_para_migrarlo() {
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(b"secreto", &salt)
            .unwrap()
            .to_string();
        assert!(verify_password("secreto", &hash));
        assert!(needs_rehash(&hash));
    }
}
