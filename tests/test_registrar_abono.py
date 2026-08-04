

from backend.abonos import registrar_abono
from backend.db import conectar_lectura

from tests.reset_db import reconstruir_bd_prueba
RUTA_BD = reconstruir_bd_prueba()


id_abono = registrar_abono(
    ruta_bd=RUTA_BD,
    fecha="2026-03-20",
    monto=25000,
    referencia="TRANSFERENCIA-DEMO-003",
    aplicaciones=[
        {
            "obligacion_id": 5,
            "monto": 25000,
        }
    ],
    comentarios="LIQUIDACION DEL SALDO DEL CUPON 2",
)

print("ID_ABONO creado:", id_abono)


conexion = conectar_lectura(RUTA_BD)

try:
    documento = conexion.execute(
        """
        SELECT PAGADO
        FROM tblDoctosXPagar
        WHERE OBLIGACION_ID = 5
        """
    ).fetchone()

    total_aplicado = conexion.execute(
        """
        SELECT SUM(MONTO)
        FROM tblAplicacionesAbonos
        WHERE OBLIGACION_ID = 5
          AND ACTIVO = 1
        """
    ).fetchone()[0]

finally:
    conexion.close()


assert id_abono == 3
assert documento["PAGADO"] == 1
assert total_aplicado == 100000

print("Total aplicado a obligación 5:", total_aplicado)
print("PAGADO:", documento["PAGADO"])
print("REGISTRAR ABONO: CORRECTO")