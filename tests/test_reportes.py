from backend.reportes import (
    resumen_deuda,
    unidades_sin_cobertura_total,
    vencimientos,
)
from tests.reset_db import reconstruir_bd_prueba


DB = "database/sam_test.db"

reconstruir_bd_prueba()

resumen = resumen_deuda(DB)
unidades = unidades_sin_cobertura_total(DB)
proximos = vencimientos(
    ruta_bd=DB,
    fecha_corte="2026-04-01",
    fecha_hasta="2026-12-31",
)

print("\nRESUMEN DE DEUDA")
for fila in resumen:
    print(fila)

print("\nUNIDADES SIN COBERTURA TOTAL")
for fila in unidades:
    print(fila)

print("\nVENCIMIENTOS")
for fila in proximos:
    print(fila)

saldo_concesionarios = sum(
    fila["SALDO"]
    for fila in resumen
    if fila["ENTITY"] == "CON"
)

saldo_financieras = sum(
    fila["SALDO"]
    for fila in resumen
    if fila["ENTITY"] == "FIN"
)

assert saldo_concesionarios == 700000
assert saldo_financieras == 325000
assert len(unidades) == 2
assert len(proximos) > 0

vencidos = [
    fila
    for fila in proximos
    if fila["CLASIFICACION"] == "VENCIDO"
]

corto_plazo = [
    fila
    for fila in proximos
    if fila["CLASIFICACION"] == "CORTO PLAZO"
]

assert len(vencidos) > 0
assert len(corto_plazo) > 0

print("\nDocumentos vencidos:", len(vencidos))
print("Documentos de corto plazo:", len(corto_plazo))

print("\nREPORTES: CORRECTO")