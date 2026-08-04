import sqlite3

from backend.adquisiciones import confirmar_adquisicion
from tests.reset_db import reconstruir_bd_prueba


DB = "database/sam_test.db"

reconstruir_bd_prueba()


def contar_registros():
    with sqlite3.connect(DB) as con:
        unidades = con.execute(
            "SELECT COUNT(*) FROM tblUnits"
        ).fetchone()[0]

        obligaciones = con.execute(
            "SELECT COUNT(*) FROM tblDoctosXPagar"
        ).fetchone()[0]

    return unidades, obligaciones


unidades_antes, obligaciones_antes = contar_registros()

print("Unidades antes:", unidades_antes)
print("Obligaciones antes:", obligaciones_antes)

captura_invalida = [
    {
        "id_con": 1,
        "vin": "3SAMVALIDO00000001",
        "no_motor": None,
        "modelo_anio": 2026,
        "marca": "Chevrolet",
        "version": "Suburban RST",
        "oc_mexrac": "OC-ERROR-001",
        "folio_factura": "FACT-ERROR-001",
        "subtotal": 300000,
        "iva": 48000,
        "total": 348000,
        "entrega_patio": None,
        "vencimiento": "2026-09-30",
        "comentarios": "ESTA FILA NO DEBE PERSISTIR",
    },
    {
        "id_con": 1,
        "vin": "3SAMINVALIDO000002",
        "no_motor": "MOTOR-ERROR-002",
        "modelo_anio": 2026,
        "marca": "Chevrolet",
        "version": "Tracker LS",
        "oc_mexrac": "OC-ERROR-001",
        "folio_factura": "FACT-ERROR-001",
        "subtotal": 200000,
        "iva": 32000,
        "total": 250000,  # Incorrecto: debería ser 232000
        "entrega_patio": None,
        "vencimiento": "2026-09-30",
        "comentarios": "TOTAL INCORRECTO",
    },
]

try:
    confirmar_adquisicion(
        ruta_bd=DB,
        unidades=captura_invalida,
    )
except ValueError as error:
    print("Adquisición rechazada:", error)
else:
    raise AssertionError("Se aceptó una adquisición con importes incorrectos")

unidades_despues, obligaciones_despues = contar_registros()

print("Unidades después:", unidades_despues)
print("Obligaciones después:", obligaciones_despues)

assert unidades_despues == unidades_antes
assert obligaciones_despues == obligaciones_antes

print("ADQUISICIÓN INVÁLIDA: RECHAZADA CORRECTAMENTE")
print("ROLLBACK DE LA ADQUISICIÓN: CORRECTO")