from backend.abonos import registrar_abono
from backend.db import conectar_lectura

from tests.reset_db import reconstruir_bd_prueba
RUTA_BD = reconstruir_bd_prueba()


def contar_registros() -> tuple[int, int]:
    conexion = conectar_lectura(RUTA_BD)

    try:
        abonos = conexion.execute(
            "SELECT COUNT(*) FROM tblAbonos"
        ).fetchone()[0]

        aplicaciones = conexion.execute(
            "SELECT COUNT(*) FROM tblAplicacionesAbonos"
        ).fetchone()[0]

        return abonos, aplicaciones

    finally:
        conexion.close()


abonos_antes, aplicaciones_antes = contar_registros()

print("Abonos antes:", abonos_antes)
print("Aplicaciones antes:", aplicaciones_antes)


# ---------------------------------------------------------
# PRUEBA 1:
# Intentar pagar $100,001 sobre una obligación con saldo
# de solamente $100,000.
# ---------------------------------------------------------

try:
    registrar_abono(
        ruta_bd=RUTA_BD,
        fecha="2026-04-15",
        monto=100001,
        referencia="ABONO-INVALIDO-001",
        aplicaciones=[
            {
                "obligacion_id": 6,
                "monto": 100001,
            }
        ],
        comentarios="ESTE ABONO NO DEBE GUARDARSE",
    )

    raise AssertionError("El sobrepago fue aceptado incorrectamente")

except ValueError as error:
    print("Sobrepago rechazado:", error)


abonos_despues_sobrepago, aplicaciones_despues_sobrepago = (
    contar_registros()
)

assert abonos_despues_sobrepago == abonos_antes
assert aplicaciones_despues_sobrepago == aplicaciones_antes

print("ROLLBACK DEL SOBREPAGO: CORRECTO")


# ---------------------------------------------------------
# PRUEBA 2:
# El encabezado declara $100,000, pero las aplicaciones
# solamente suman $90,000.
# ---------------------------------------------------------

try:
    registrar_abono(
        ruta_bd=RUTA_BD,
        fecha="2026-04-15",
        monto=100000,
        referencia="ABONO-INVALIDO-002",
        aplicaciones=[
            {
                "obligacion_id": 6,
                "monto": 90000,
            }
        ],
        comentarios="ABONO DESCUADRADO",
    )

    raise AssertionError("El abono descuadrado fue aceptado")

except ValueError as error:
    print("Descuadre rechazado:", error)


abonos_finales, aplicaciones_finales = contar_registros()

assert abonos_finales == abonos_antes
assert aplicaciones_finales == aplicaciones_antes

print("ABONO DESCUADRADO: RECHAZADO CORRECTAMENTE")
print("NO SE GUARDARON REGISTROS PARCIALES")