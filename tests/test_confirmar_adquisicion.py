import sqlite3

from backend.adquisiciones import confirmar_adquisicion
from tests.reset_db import reconstruir_bd_prueba


DB = "database/sam_test.db"

reconstruir_bd_prueba()

unidades = [
    {
        "id_con": 1,
        "vin": "3SAMNUEVO00000001",
        "no_motor": None,
        "modelo_anio": 2026,
        "marca": "Chevrolet",
        "version": "Suburban RST",
        "oc_mexrac": "OC-TEST-001",
        "folio_factura": "FACT-TEST-001",
        "subtotal": 300000,
        "iva": 48000,
        "total": 348000,
        "entrega_patio": None,
        "vencimiento": "2026-09-30",
        "comentarios": "ADQUISICION DE PRUEBA",
    },
    {
        "id_con": 2,
        "vin": "3SAMNUEVO00000002",
        "no_motor": "MOTOR-TEST-002",
        "modelo_anio": 2026,
        "marca": "Chevrolet",
        "version": "Tracker LS",
        "oc_mexrac": "OC-TEST-001",
        "folio_factura": "FACT-TEST-001",
        "subtotal": 200000,
        "iva": 32000,
        "total": 232000,
        "entrega_patio": "2026-08-03",
        "vencimiento": "2026-09-30",
        "comentarios": "ADQUISICION DE PRUEBA",
    },
]

ids = confirmar_adquisicion(
    ruta_bd=DB,
    unidades=unidades,
)

print("UNITID creados:", ids)

with sqlite3.connect(DB) as con:
    unidades_guardadas = con.execute(
        """
        SELECT COUNT(*)
        FROM tblUnits
        WHERE UNITID IN (?, ?)
        """,
        ids,
    ).fetchone()[0]

    obligaciones_guardadas = con.execute(
        """
        SELECT COUNT(*)
        FROM tblDoctosXPagar
        WHERE UNIT_ID IN (?, ?)
          AND ENTITY = 'CON'
          AND ACTIVO = 1
        """,
        ids,
    ).fetchone()[0]

    monto_obligaciones = con.execute(
        """
        SELECT SUM(MONTO)
        FROM tblDoctosXPagar
        WHERE UNIT_ID IN (?, ?)
          AND ENTITY = 'CON'
          AND ACTIVO = 1
        """,
        ids,
    ).fetchone()[0]

print("Unidades guardadas:", unidades_guardadas)
print("Obligaciones guardadas:", obligaciones_guardadas)
print("Monto de obligaciones:", monto_obligaciones)

assert unidades_guardadas == 2
assert obligaciones_guardadas == 2
assert monto_obligaciones == 580000

print("CONFIRMAR ADQUISICIÓN: CORRECTO")