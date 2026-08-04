from datetime import date
from decimal import Decimal
from pathlib import Path

from backend.db import transaccion


CENTAVO = Decimal("0.01")


def dinero(valor: int | float | str | Decimal) -> Decimal:
    return Decimal(str(valor)).quantize(CENTAVO)


def confirmar_financiamiento(
    ruta_bd: str | Path,
    id_fin: int,
    folio: str,
    emision: str,
    monto_cupones: int | float | str | Decimal,
    monto_balloon: int | float | str | Decimal,
    aplicaciones: list[dict],
    calendario: list[dict],
    comentarios: str | None = None,
) -> int:
    """
    Confirma un financiamiento completo dentro de una única
    transacción SQL.

    aplicaciones:
    [
        {"obligacion_id": 1, "monto": 300000},
        {"obligacion_id": 2, "monto": 200000},
    ]

    calendario:
    [
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
    ]

    Devuelve ID_FINTO.
    """

    try:
        date.fromisoformat(emision)
    except ValueError as error:
        raise ValueError(
            "EMISION debe utilizar el formato YYYY-MM-DD"
        ) from error

    if not folio.strip():
        raise ValueError("FOLIO no puede estar vacío")

    if not aplicaciones:
        raise ValueError(
            "El financiamiento debe tener aplicaciones"
        )

    if not calendario:
        raise ValueError(
            "El financiamiento debe tener calendario"
        )

    monto_cupones = dinero(monto_cupones)
    monto_balloon = dinero(monto_balloon)

    if monto_cupones < 0:
        raise ValueError("MONTO_CUPONES no puede ser negativo")

    if monto_balloon < 0:
        raise ValueError("MONTO_BALLOON no puede ser negativo")

    monto_financiamiento = monto_cupones + monto_balloon

    if monto_financiamiento <= 0:
        raise ValueError(
            "El monto total del financiamiento debe ser positivo"
        )

    aplicaciones_normalizadas: list[dict] = []
    aplicado_por_obligacion: dict[int, Decimal] = {}

    for aplicacion in aplicaciones:
        obligacion_id = int(aplicacion["obligacion_id"])
        monto_aplicado = dinero(aplicacion["monto"])

        if monto_aplicado <= 0:
            raise ValueError(
                "Los montos amparados deben ser positivos"
            )

        aplicaciones_normalizadas.append(
            {
                "obligacion_id": obligacion_id,
                "monto": monto_aplicado,
            }
        )

        aplicado_por_obligacion[obligacion_id] = (
            aplicado_por_obligacion.get(
                obligacion_id,
                Decimal("0.00"),
            )
            + monto_aplicado
        )

    total_aplicaciones = sum(
        (
            aplicacion["monto"]
            for aplicacion in aplicaciones_normalizadas
        ),
        Decimal("0.00"),
    )

    if total_aplicaciones != monto_financiamiento:
        raise ValueError(
            f"El financiamiento es {monto_financiamiento}, "
            f"pero las aplicaciones suman {total_aplicaciones}"
        )

    calendario_normalizado: list[dict] = []

    total_ordinario = Decimal("0.00")
    total_balloon = Decimal("0.00")
    cantidad_cupones = 0
    cantidad_balloon = 0

    for renglon in calendario:
        serie_pago = int(renglon["serie_pago"])
        vencimiento = str(renglon["vencimiento"])
        monto = dinero(renglon["monto"])
        is_balloon = int(renglon["is_balloon"])

        try:
            date.fromisoformat(vencimiento)
        except ValueError as error:
            raise ValueError(
                f"Vencimiento inválido: {vencimiento}"
            ) from error

        if serie_pago <= 0:
            raise ValueError(
                "SERIE_PAGO debe ser un entero positivo"
            )

        if monto <= 0:
            raise ValueError(
                "Los montos del calendario deben ser positivos"
            )

        if is_balloon not in (0, 1):
            raise ValueError(
                "IS_BALLOON solamente admite 0 o 1"
            )

        calendario_normalizado.append(
            {
                "serie_pago": serie_pago,
                "vencimiento": vencimiento,
                "monto": monto,
                "is_balloon": is_balloon,
            }
        )

        if is_balloon == 1:
            total_balloon += monto
            cantidad_balloon += 1
        else:
            total_ordinario += monto
            cantidad_cupones += 1

    if total_ordinario != monto_cupones:
        raise ValueError(
            f"Los cupones suman {total_ordinario}, "
            f"pero MONTO_CUPONES es {monto_cupones}"
        )

    if total_balloon != monto_balloon:
        raise ValueError(
            f"El calendario balloon suma {total_balloon}, "
            f"pero MONTO_BALLOON es {monto_balloon}"
        )

    if monto_balloon > 0 and cantidad_balloon != 1:
        raise ValueError(
            "Debe existir exactamente un balloon separado"
        )

    if monto_balloon == 0 and cantidad_balloon != 0:
        raise ValueError(
            "No debe existir balloon cuando su monto es cero"
        )

    with transaccion(ruta_bd) as conexion:

        financiera = conexion.execute(
            """
            SELECT ID_FIN
            FROM tblFinancieras
            WHERE ID_FIN = ?
              AND ACTIVO = 1
            """,
            (id_fin,),
        ).fetchone()

        if financiera is None:
            raise ValueError(
                f"La financiera {id_fin} no existe o no está activa"
            )

        saldos_origen: dict[int, Decimal] = {}

        for obligacion_id, monto_aplicado in aplicado_por_obligacion.items():

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
                    f"La obligación {obligacion_id} "
                    "no existe o no está activa"
                )

            saldo = dinero(fila["SALDO"])

            if monto_aplicado > saldo:
                raise ValueError(
                    f"La obligación {obligacion_id} tiene saldo "
                    f"{saldo}, pero se intentan financiar "
                    f"{monto_aplicado}"
                )

            saldos_origen[obligacion_id] = saldo

        cursor = conexion.execute(
            """
            INSERT INTO tblFinanciamientos (
                ID_FIN,
                FOLIO,
                EMISION,
                MONTO_CUPONES,
                CUPONES,
                MONTO_BALLOON,
                ACTIVO,
                COMENTARIOS
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                id_fin,
                folio.strip(),
                emision,
                float(monto_cupones),
                cantidad_cupones,
                float(monto_balloon),
                comentarios,
            ),
        )

        id_finto = cursor.lastrowid

        for aplicacion in aplicaciones_normalizadas:
            conexion.execute(
                """
                INSERT INTO tblFinAplicaciones (
                    ID_FINTO,
                    ID_DPP,
                    MONTO_AMPARADO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES (?, ?, ?, 1, ?)
                """,
                (
                    id_finto,
                    aplicacion["obligacion_id"],
                    float(aplicacion["monto"]),
                    comentarios,
                ),
            )

        for renglon in calendario_normalizado:

            texto_documento = (
                f"{folio} / BALLOON"
                if renglon["is_balloon"] == 1
                else f"{folio} / CUPON {renglon['serie_pago']}"
            )

            conexion.execute(
                """
                INSERT INTO tblFinCalendario (
                    ID_FINTO,
                    SERIE_PAGO,
                    VENCIMIENTO,
                    MONTO,
                    IS_BALLOON,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    id_finto,
                    renglon["serie_pago"],
                    renglon["vencimiento"],
                    float(renglon["monto"]),
                    renglon["is_balloon"],
                    texto_documento,
                ),
            )

            conexion.execute(
                """
                INSERT INTO tblDoctosXPagar (
                    ENTITY,
                    ENTITY_ID,
                    ID_FINTO,
                    UNIT_ID,
                    VENCIMIENTO,
                    MONTO,
                    PAGADO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES ('FIN', ?, ?, NULL, ?, ?, 0, 1, ?)
                """,
                (
                    id_fin,
                    id_finto,
                    renglon["vencimiento"],
                    float(renglon["monto"]),
                    texto_documento,
                ),
            )

        for obligacion_id, monto_aplicado in aplicado_por_obligacion.items():
            saldo_final = saldos_origen[obligacion_id] - monto_aplicado

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
    return id_finto

def cancelar_financiamiento(
    ruta_bd: str | Path,
    id_finto: int,
    motivo: str,
) -> None:
    """
    Cancela lógicamente un financiamiento.

    Rechaza la cancelación si alguno de sus documentos
    materializados ya tiene aplicaciones de abonos.
    """

    if not motivo.strip():
        raise ValueError("Debe especificarse el motivo de cancelación")

    with transaccion(ruta_bd) as conexion:

        financiamiento = conexion.execute(
            """
            SELECT ID_FINTO
            FROM tblFinanciamientos
            WHERE ID_FINTO = ?
              AND ACTIVO = 1
            """,
            (id_finto,),
        ).fetchone()

        if financiamiento is None:
            raise ValueError(
                f"El financiamiento {id_finto} no existe "
                "o ya está cancelado"
            )

        documentos_generados = conexion.execute(
            """
            SELECT OBLIGACION_ID
            FROM tblDoctosXPagar
            WHERE ID_FINTO = ?
              AND ENTITY = 'FIN'
              AND ACTIVO = 1
            """,
            (id_finto,),
        ).fetchall()

        ids_documentos = [
            fila["OBLIGACION_ID"]
            for fila in documentos_generados
        ]

        for obligacion_id in ids_documentos:
            cantidad_abonos = conexion.execute(
                """
                SELECT COUNT(*)
                FROM tblAplicacionesAbonos
                WHERE OBLIGACION_ID = ?
                  AND ACTIVO = 1
                """,
                (obligacion_id,),
            ).fetchone()[0]

            if cantidad_abonos > 0:
                raise ValueError(
                    f"No puede cancelarse el financiamiento {id_finto}: "
                    f"la obligación generada {obligacion_id} "
                    "ya tiene abonos"
                )

        obligaciones_origen = conexion.execute(
            """
            SELECT DISTINCT ID_DPP
            FROM tblFinAplicaciones
            WHERE ID_FINTO = ?
              AND ACTIVO = 1
            """,
            (id_finto,),
        ).fetchall()

        ids_origen = [
            fila["ID_DPP"]
            for fila in obligaciones_origen
        ]

        comentario_cancelacion = (
            f"CANCELADO: {motivo.strip()}"
        )

        conexion.execute(
            """
            UPDATE tblFinanciamientos
            SET
                ACTIVO = 0,
                ERASED_AT = CURRENT_TIMESTAMP,
                COMENTARIOS =
                    COALESCE(COMENTARIOS || ' | ', '')
                    || ?
            WHERE ID_FINTO = ?
            """,
            (
                comentario_cancelacion,
                id_finto,
            ),
        )

        conexion.execute(
            """
            UPDATE tblFinAplicaciones
            SET
                ACTIVO = 0,
                ERASED_AT = CURRENT_TIMESTAMP,
                COMENTARIOS =
                    COALESCE(COMENTARIOS || ' | ', '')
                    || ?
            WHERE ID_FINTO = ?
              AND ACTIVO = 1
            """,
            (
                comentario_cancelacion,
                id_finto,
            ),
        )

        conexion.execute(
            """
            UPDATE tblFinCalendario
            SET
                ACTIVO = 0,
                ERASED_AT = CURRENT_TIMESTAMP,
                COMENTARIOS =
                    COALESCE(COMENTARIOS || ' | ', '')
                    || ?
            WHERE ID_FINTO = ?
              AND ACTIVO = 1
            """,
            (
                comentario_cancelacion,
                id_finto,
            ),
        )

        conexion.execute(
            """
            UPDATE tblDoctosXPagar
            SET
                ACTIVO = 0,
                ERASED_AT = CURRENT_TIMESTAMP,
                COMENTARIOS =
                    COALESCE(COMENTARIOS || ' | ', '')
                    || ?
            WHERE ID_FINTO = ?
              AND ENTITY = 'FIN'
              AND ACTIVO = 1
            """,
            (
                comentario_cancelacion,
                id_finto,
            ),
        )

        for obligacion_id in ids_origen:

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
                    f"No se pudo reconstruir la obligación "
                    f"{obligacion_id}"
                )

            saldo = dinero(fila["SALDO"])

            conexion.execute(
                """
                UPDATE tblDoctosXPagar
                SET PAGADO = ?
                WHERE OBLIGACION_ID = ?
                """,
                (
                    1 if saldo == Decimal("0.00") else 0,
                    obligacion_id,
                ),
            )