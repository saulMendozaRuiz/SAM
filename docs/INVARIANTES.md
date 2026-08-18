# Invariantes del núcleo de SAM

SAM modela hechos operativos y transiciones, no solamente relaciones estáticas.

- Una adquisición materializa una obligación `CON` por unidad.
- Un financiamiento materializa obligaciones `FIN`; así una deuda financiera puede ser origen de otro financiamiento.
- `tblFinAplicaciones.ID_DPP` es un puente lógico deliberado. Permite aplicar un financiamiento a una obligación `CON` o `FIN` sin crear ciclos de llaves.
- `PAGADO` es el guardián autoritativo de una obligación. Solo las funciones de transición del núcleo pueden cambiarlo, siempre junto con `SALDO` y dentro de la transacción de alto nivel.
- `tblUnits.FINANCIADO` es el guardián autoritativo que autoriza o bloquea un nuevo financiamiento. Solo las funciones de transición del núcleo pueden cambiarlo, dentro de la misma transacción que crea o cancela la trazabilidad activa.
- `tblFinanciamientoUnidades` explica el guardián: contrato, importe y modalidad de pago. El diagnóstico exige equivalencia entre esta evidencia y `FINANCIADO`.
- Una operación solo usa una obligación cuando `PAGADO = 0`, está activa y su `SALDO` materializado es positivo.
- Toda mutación que afecte saldo, aplicaciones o guardianes debe ser atómica.
- Las llaves foráneas se reservan para relaciones de existencia acíclicas. Las relaciones polimórficas o de transición se validan mediante funciones y diagnósticos de integridad.
- Una unidad puede tener como máximo un bloqueo financiero activo, independientemente de si hubo pago directo al concesionario.
- Cancelar revierte aplicaciones y recalcula guardianes; nunca borra la historia.
- Las operaciones normales confían en los guardianes materializados. La reconciliación contra la evidencia histórica pertenece a diagnósticos explícitos, no al camino de cada alta, abono o consulta.

Estas reglas deben tener pruebas de integración antes de modificar esquema o flujos contables.
