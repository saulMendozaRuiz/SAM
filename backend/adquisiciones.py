from decimal import Decimal
from pathlib import Path

from backend.db import transaccion


def _dinero(valor) -> Decimal:
    return Decimal(str(valor)).quantize(Decimal("0.01"))


def confirmar_adquisicion(
    ruta_bd: str | Path,
    unidades: list[dict],
) -> list[int]:
    """
    Registra unidades y obligaciones con concesionarios en una sola
    transacción SQL.

    Devuelve los UNITID creados.
    """

    if not unidades:
        raise ValueError("La adquisición debe contener al menos una unidad")

    vins_capturados = set()

    with transaccion(ruta_bd) as con:
        unidades_creadas = []

        for numero, unidad in enumerate(unidades, start=1):
            vin = str(unidad["vin"]).strip().upper()

            if not vin:
                raise ValueError(f"La unidad {numero} no tiene VIN")

            if vin in vins_capturados:
                raise ValueError(
                    f"El VIN {vin} está repetido dentro de la adquisición"
                )

            vins_capturados.add(vin)

            concesionario = con.execute(
                """
                SELECT ID_CON
                FROM tblConcesionarios
                WHERE ID_CON = ?
                  AND ACTIVO = 1
                """,
                (unidad["id_con"],),
            ).fetchone()

            if concesionario is None:
                raise ValueError(
                    f"El concesionario {unidad['id_con']} no existe o está inactivo"
                )

            vin_existente = con.execute(
                """
                SELECT UNITID
                FROM tblUnits
                WHERE VIN = ?
                """,
                (vin,),
            ).fetchone()

            if vin_existente is not None:
                raise ValueError(f"El VIN {vin} ya existe en la base de datos")

            subtotal = _dinero(unidad["subtotal"])
            iva = _dinero(unidad["iva"])
            total = _dinero(unidad["total"])

            if subtotal < 0 or iva < 0 or total <= 0:
                raise ValueError(
                    f"Los importes del VIN {vin} no son válidos"
                )

            if subtotal + iva != total:
                raise ValueError(
                    f"El subtotal más IVA del VIN {vin} no coincide con el total"
                )

            cursor = con.execute(
                """
                INSERT INTO tblUnits (
                    ID_CON,
                    VIN,
                    NO_MOTOR,
                    MODELO_ANIO,
                    MARCA,
                    VERSION_,
                    OC_MEXRAC,
                    FOLIO_FACTURA,
                    SUBTOTAL,
                    IVA,
                    TOTAL,
                    ENTREGA_PATIO,
                    COMENTARIOS
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    unidad["id_con"],
                    vin,
                    unidad.get("no_motor"),
                    unidad["modelo_anio"],
                    str(unidad["marca"]).strip().upper(),
                    str(unidad["version"]).strip().upper(),
                    unidad.get("oc_mexrac"),
                    unidad.get("folio_factura"),
                    float(subtotal),
                    float(iva),
                    float(total),
                    unidad.get("entrega_patio"),
                    unidad.get("comentarios"),
                ),
            )

            unitid = cursor.lastrowid
            unidades_creadas.append(unitid)

            con.execute(
                """
                INSERT INTO tblDoctosXPagar (
                    ENTITY,
                    ENTITY_ID,
                    UNIT_ID,
                    VENCIMIENTO,
                    MONTO,
                    PAGADO,
                    ACTIVO,
                    COMENTARIOS
                )
                VALUES ('CON', ?, ?, ?, ?, 0, 1, ?)
                """,
                (
                    unidad["id_con"],
                    unitid,
                    unidad["vencimiento"],
                    float(total),
                    "ADQUISICION VEHICULO",
                ),
            )

        return unidades_creadas