import sqlite3

from backend.financiamientos import cancelar_financiamiento
from tests.reset_db import reconstruir_bd_prueba


DB = "database/sam_test.db"

reconstruir_bd_prueba()

with sqlite3.connect(DB) as con:
    estado_antes = con.execute(
        """
        SELECT ACTIVO
        FROM tblFinanciamientos
        WHERE ID_FINTO = 1
        """
    ).fetchone()[0]

    documentos_antes = con.execute(
        """
        SELECT COUNT(*)
        FROM tblDoctosXPagar
        WHERE ID_FINTO = 1
          AND ACTIVO = 1
        """
    ).fetchone()[0]

print("Financiamiento activo antes:", estado_antes)
print("Documentos activos antes:", documentos_antes)

try:
    cancelar_financiamiento(
    ruta_bd=DB,
    id_finto=1,
    motivo="PRUEBA: NO DEBE CANCELARSE PORQUE TIENE ABONOS",
    )
except ValueError as error:
    print("Cancelación rechazada:", error)
else:
    raise AssertionError(
        "ERROR: se permitió cancelar un financiamiento que tiene abonos"
    )

with sqlite3.connect(DB) as con:
    estado_despues = con.execute(
        """
        SELECT ACTIVO
        FROM tblFinanciamientos
        WHERE ID_FINTO = 1
        """
    ).fetchone()[0]

    documentos_despues = con.execute(
        """
        SELECT COUNT(*)
        FROM tblDoctosXPagar
        WHERE ID_FINTO = 1
          AND ACTIVO = 1
        """
    ).fetchone()[0]

    aplicaciones_abonos = con.execute(
        """
        SELECT COUNT(*)
        FROM tblAplicacionesAbonos AS AA
        JOIN tblDoctosXPagar AS D
          ON D.OBLIGACION_ID = AA.OBLIGACION_ID
        WHERE D.ID_FINTO = 1
          AND AA.ACTIVO = 1
        """
    ).fetchone()[0]

print("Financiamiento activo después:", estado_despues)
print("Documentos activos después:", documentos_despues)
print("Aplicaciones de abonos conservadas:", aplicaciones_abonos)

assert estado_despues == estado_antes == 1
assert documentos_despues == documentos_antes
assert aplicaciones_abonos > 0

print("CANCELACIÓN CON ABONOS: RECHAZADA CORRECTAMENTE")
print("NO SE ALTERARON LOS REGISTROS")