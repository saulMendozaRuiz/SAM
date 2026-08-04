from backend.db import conectar_lectura
from backend.financiamientos import (
    cancelar_financiamiento,
    confirmar_financiamiento,
)
from tests.reset_db import reconstruir_bd_prueba


RUTA_BD = reconstruir_bd_prueba()


id_finto = confirmar_financiamiento(
    ruta_bd=RUTA_BD,
    id_fin=2,
    folio="FIN-CANCELABLE-001",
    emision="2026-01-20",
    monto_cupones=400000,
    monto_balloon=100000,
    aplicaciones=[
        {
            "obligacion_id": 3,
            "monto": 500000,
        }
    ],
    calendario=[
        {
            "serie_pago": 1,
            "vencimiento": "2026-02-28",
            "monto": 200000,
            "is_balloon": 0,
        },
        {
            "serie_pago": 2,
            "vencimiento": "2026-03-31",
            "monto": 200000,
            "is_balloon": 0,
        },
        {
            "serie_pago": 2,
            "vencimiento": "2026-03-31",
            "monto": 100000,
            "is_balloon": 1,
        },
    ],
    comentarios="FINANCIAMIENTO QUE SERA CANCELADO",
)

cancelar_financiamiento(
    ruta_bd=RUTA_BD,
    id_finto=id_finto,
    motivo="CALENDARIO CAPTURADO INCORRECTAMENTE",
)


conexion = conectar_lectura(RUTA_BD)

try:
    activo_financiamiento = conexion.execute(
        """
        SELECT ACTIVO
        FROM tblFinanciamientos
        WHERE ID_FINTO = ?
        """,
        (id_finto,),
    ).fetchone()["ACTIVO"]

    aplicaciones_activas = conexion.execute(
        """
        SELECT COUNT(*)
        FROM tblFinAplicaciones
        WHERE ID_FINTO = ?
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

    calendario_activo = conexion.execute(
        """
        SELECT COUNT(*)
        FROM tblFinCalendario
        WHERE ID_FINTO = ?
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

    documentos_activos = conexion.execute(
        """
        SELECT COUNT(*)
        FROM tblDoctosXPagar
        WHERE ID_FINTO = ?
          AND ENTITY = 'FIN'
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

    obligacion_origen = conexion.execute(
        """
        SELECT PAGADO
        FROM tblDoctosXPagar
        WHERE OBLIGACION_ID = 3
        """
    ).fetchone()["PAGADO"]

finally:
    conexion.close()


assert activo_financiamiento == 0
assert aplicaciones_activas == 0
assert calendario_activo == 0
assert documentos_activos == 0
assert obligacion_origen == 0

print("Financiamiento activo:", activo_financiamiento)
print("Aplicaciones activas:", aplicaciones_activas)
print("Calendario activo:", calendario_activo)
print("Documentos activos:", documentos_activos)
print("Obligación de origen pagada:", obligacion_origen)
print("CANCELAR FINANCIAMIENTO: CORRECTO")