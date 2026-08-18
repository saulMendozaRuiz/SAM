# Arquitectura mínima de SAM

SAM tiene un núcleo contable pequeño. Las tablas históricas explican cada transición y los guardianes materializados deciden si una operación está permitida.

## Escrituras del dominio

Solo existen cuatro operaciones de alto nivel:

1. **Adquisición:** crea una unidad y su documento `CON`.
2. **Financiamiento:** crea el contrato y sus documentos `FIN`; opcionalmente aplica el importe a obligaciones preexistentes.
3. **Abono:** aplica dinero a obligaciones preexistentes.
4. **Cancelación:** inactiva la evidencia creada y revierte aplicaciones y guardianes.

Todas son transacciones SQLite completas. Ninguna capa de interfaz escribe tablas directamente.

## Guardianes

- `tblDoctosXPagar.PAGADO` autoriza o bloquea nuevas aplicaciones sobre una obligación.
- `tblUnits.FINANCIADO` autoriza o bloquea un financiamiento sobre una unidad.
- `tblDoctosXPagar.SALDO` es el saldo operativo materializado.

Las funciones de `obligation_state.rs` son las únicas escrituras operativas de `SALDO` y `PAGADO`. Las funciones de `unit_state.rs` son las únicas escrituras operativas de `FINANCIADO`.

## Capas de información

- `tblDoctosXPagar` contiene obligaciones `CON` y `FIN` ya materializadas.
- `tblFinAplicaciones` explica qué financiamiento consumió saldo de qué obligación.
- `tblAplicacionesAbonos` explica qué abono consumió saldo de qué obligación.
- Los reportes suman estas capas; no participan en las transacciones del dominio.

## Regla de mantenimiento

Una nueva regla contable debe vivir en una de las cuatro operaciones o en una transición de guardián. Las consultas, reportes y pantallas pueden leer esos hechos, pero no deben reconstruir guardianes ni introducir caminos alternos de escritura.

El frontend solo captura, transforma formatos y confirma acciones. Las mutaciones muestran en un único popup el error devuelto por Rust; las reglas de saldo, duplicidad, estado y consistencia se validan exclusivamente dentro de la operación transaccional.
