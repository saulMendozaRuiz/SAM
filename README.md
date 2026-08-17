# SAM

Aplicación local para controlar unidades, obligaciones, financiamientos y abonos de MexRAC.

## Arquitectura

- `frontend/src`: interfaz Vanilla TypeScript.
- `frontend/src-tauri/src`: reglas y transacciones en Rust.
- `database/schema.sql`: creación de bases nuevas.
- `docs/INVARIANTES.md`: guardianes e invariantes del dominio.

No existe un segundo backend. Las cargas masivas extraordinarias tampoco forman parte de la interfaz: deben realizarse mediante un ORM o DB Browser for SQLite, con respaldo previo y respetando los guardianes documentados.

## Desarrollo

Requiere Node.js, Rust estable y las dependencias de Tauri 2 para Windows.

```powershell
cd frontend
npm.cmd ci
npm.cmd run build
npm.cmd run tauri dev
```

En debug se usa `database/sam_test.db`; en release, `database/sam.db`.

## Verificación

```powershell
cd frontend
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Las migraciones versionadas se ejecutan desde Rust. `schema.sql` sólo crea bases nuevas. Nunca se debe incluir la base productiva en Git ni sustituirla mientras SAM esté abierto.
