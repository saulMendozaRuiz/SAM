from backend.financiamientos import confirmar_financiamiento
from backend.db import conectar_lectura

from tests.reset_db import reconstruir_bd_prueba
RUTA_BD = reconstruir_bd_prueba()


id_finto = confirmar_financiamiento(
    ruta_bd=RUTA_BD,
    id_fin=2,
    folio="FIN-DEMO-002",
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
    comentarios="FINANCIAMIENTO DE PRUEBA B",
)

print("ID_FINTO creado:", id_finto)


conexion = conectar_lectura(RUTA_BD)

try:
    obligacion_origen = conexion.execute(
        """
        SELECT PAGADO
        FROM tblDoctosXPagar
        WHERE OBLIGACION_ID = 3
        """
    ).fetchone()

    aplicaciones = conexion.execute(
        """
        SELECT SUM(MONTO_AMPARADO)
        FROM tblFinAplicaciones
        WHERE ID_FINTO = ?
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

    calendario = conexion.execute(
        """
        SELECT SUM(MONTO)
        FROM tblFinCalendario
        WHERE ID_FINTO = ?
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

    documentos = conexion.execute(
        """
        SELECT SUM(MONTO)
        FROM tblDoctosXPagar
        WHERE ID_FINTO = ?
          AND ENTITY = 'FIN'
          AND ACTIVO = 1
        """,
        (id_finto,),
    ).fetchone()[0]

finally:
    conexion.close()


assert id_finto == 2
assert obligacion_origen["PAGADO"] == 1
assert aplicaciones == 500000
assert calendario == 500000
assert documentos == 500000

print("Aplicaciones:", aplicaciones)
print("Calendario:", calendario)
print("Documentos materializados:", documentos)
print("Obligación de origen pagada:", obligacion_origen["PAGADO"])
print("CONFIRMAR FINANCIAMIENTO: CORRECTO")