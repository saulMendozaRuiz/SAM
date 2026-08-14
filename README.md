# SAM

Sistema local de control de unidades, obligaciones, financiamientos y abonos de MexRAC.

## Estado

SAM se encuentra en estabilización. La base productiva no debe sustituirse, migrarse ni copiarse mientras la aplicación esté abierta. El login actual es solamente una barrera visual y no constituye autenticación de seguridad.

## Estructura

- `frontend/src`: interfaz Vite/TypeScript.
- `frontend/src-tauri/src`: lógica ejecutada por la aplicación Tauri en Rust.
- `database/schema.sql`: esquema para crear bases nuevas.
- `database/seed_test.sql`: datos exclusivamente de prueba.
- `backend`: implementación Python histórica; no es el backend que distribuye Tauri.
- `tests`: pruebas históricas de la implementación Python.

## Desarrollo

Requisitos: Node.js, Rust estable y dependencias de desarrollo de Tauri 2 para Windows.

```powershell
cd frontend
npm.cmd ci
npm.cmd run build
npm.cmd run tauri dev
```

En modo debug Rust utiliza `database/sam_test.db`. En release utiliza `database/sam.db` según la implementación actual. Esta ruta de release está pendiente de migrarse al directorio de datos de la aplicación antes de distribuir SAM a otros equipos.

## Verificación

```powershell
cd frontend
npm.cmd run build

cd src-tauri
cargo fmt --check
cargo check
```

Las pruebas Python deben ejecutarse como módulos independientes porque comparten una base desechable:

```powershell
cd SAM
python -m tests.test_confirmar_adquisicion
python -m tests.test_confirmar_financiamiento
python -m tests.test_registrar_abono
```

Estas pruebas no sustituyen pruebas Rust. La cobertura del backend distribuido sigue pendiente.

## Datos

- Nunca incluir una base productiva en Git, ZIP de código o artefactos de CI.
- Crear un respaldo antes de cualquier migración.
- No asumir que `schema.sql` actualiza bases existentes: todavía no existe un sistema de migraciones versionadas.
- No usar `sam_test.db` para información real.

## Limitaciones conocidas prioritarias

1. Autenticación local incrustada en el frontend.
2. Ruta de base dependiente del directorio de compilación.
3. Ausencia de migraciones versionadas.
4. Ausencia de pruebas del dominio Rust y pruebas E2E.
5. TypeScript configurado temporalmente con `noCheck`; la deuda de tipado no debe ocultarse con `any` masivo.
