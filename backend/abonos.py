from datetime import date
from decimal import Decimal
from pathlib import Path

from backend.db import transaccion


CENTAVO = Decimal("0.01")


def dinero(valor: int | float | str | Decimal) -> Decimal:
    return Decimal(str(valor)).quantize(CENTAVO)


def registrar_abono(
    ruta_bd: str | Path,
    fecha: str,
    monto: int | float | str | Decimal,
    referencia: str,
    aplicaciones: list[dict],
    comentarios: str | None = None,
) -> int:
    """
    Registra un abono y sus aplicaciones dentro de una sola
    transacción SQL.

    aplicaciones:
    [
        {"obligacion_id": 4, "monto": 100000},
        {"obligacion_id": 5, "monto": 50000},
    ]

    Devuelve ID_ABONO.
    """

    try:
        date.fromisoformat(fecha)
    except ValueError as error:
        raise ValueError(
            "FECHA debe utilizar el formato YYYY-MM-DD"
        ) from error

    monto_abono = dinero(monto)

    if monto_abono <= 0:
        raise ValueError("El monto del abono debe ser positivo")

    if not aplicaciones:
        raise ValueError("El abono debe contener aplicaciones")

    aplicaciones_normalizadas: list[dict] = []
    total_por_obligacion: dict[int, Decimal] = {}

    for aplicacion in aplicaciones:
        obligacion_id = int(aplicacion["obligacion_id"])
        monto_aplicado = dinero(aplicacion["monto"])

        if monto_aplicado <= 0:
            raise ValueError(
                "Todos los montos aplicados deben ser positivos"
            )

        aplicaciones_normalizadas.append(
            {
                "obligacion_id": obligacion_id,
                "monto": monto_aplicado,
            }
        )

        total_por_obligacion[obligacion_id] = (
            total_por_obligacion.get(obligacion_id, Decimal("0.00"))
            + monto_aplicado
        )

    total_aplicado = sum(
        (
            aplicacion["monto"]
            for aplicacion in aplicaciones_normalizadas
        ),
        Decimal("0.00"),
    )

    if total_aplicado != monto_abono:
        raise ValueError(
            f"El abono es {monto_abono}, "
            f"pero sus aplicaciones suman {total_aplicado}"
        )

    with transaccion(ruta_bd) as conexion:

        saldos_actuales: dict[int, Decimal] = {}

        for obligacion_id, nueva_aplicacion in total_por_obligacion.items():

            fila = conexion.execute(
                """
                SELECT
                    D.MONTO
                    - COALESCE((
                        SELECT SUM(FA.MONTO_AMPARADO)
                        FROM tblFinAplicaciones AS FA
                        WHERE FA.ID_DPP = D.OBLIGACION_ID
                          AND FA.ACTIVO = 1
                    ), 0)
                    - COALESCE((
                        SELECT SUM(AA.MONTO)
                        FROM tblAplicacionesAbonos AS AA
                        WHERE AA.OBLIGACION_ID = D.OBLIGACION_ID
                          AND AA.ACTIVO = 1
                    ), 0) AS SALDO
                FROM tblDoctosXPagar AS D
                WHERE D.OBLIGACION_ID = ?
                  AND D.ACTIVO = 1
                """,
                (obligacion_id,),
            ).fetchone()

            if fila is None:
                raise ValueError(
                    f"La obligación {obligacion_id} no existe o no está activa"
                )

            saldo = dinero(fila["SALDO"])

            if nueva_aplicacion > saldo:
                raise ValueError(
                    f"La obligación {obligacion_id} tiene saldo {saldo}, "
                    f"pero se intentan aplicar {nueva_aplicacion}"
                )

            saldos_actuales[obligacion_id] = saldo

        cursor = conexion.execute(
            """
            INSERT INTO tblAbonos (
                FECHA,
                MONTO,
                REFERENCIA,
                ACTIVO,
                COMENTARIOS
            )
            VALUES (?, ?, ?, 1, ?)
            """,
            (
                fecha,
                float(monto_abono),
                referencia,
                comentarios,
            ),
        )

        id_abono = cursor.lastrowid

        for aplicacion in aplicaciones_normalizadas:
            conexion.execute(
                """
                INSERT INTO tblAplicacionesAbonos (
                    ABONO_ID,
                    OBLIGACION_ID,
                    MONTO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES (?, ?, ?, 1, ?)
                """,
                (
                    id_abono,
                    aplicacion["obligacion_id"],
                    float(aplicacion["monto"]),
                    comentarios,
                ),
            )

        for obligacion_id, monto_nuevo in total_por_obligacion.items():
            saldo_final = saldos_actuales[obligacion_id] - monto_nuevo

            conexion.execute(
                """
                UPDATE tblDoctosXPagar
                SET PAGADO = ?
                WHERE OBLIGACION_ID = ?
                """,
                (
                    1 if saldo_final == Decimal("0.00") else 0,
                    obligacion_id,
                ),
            )

    return id_abono