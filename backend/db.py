import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def transaccion(ruta_bd: str | Path) -> Iterator[sqlite3.Connection]:
    """
    Abre una transacción de escritura.

    Si todo termina correctamente:
        COMMIT

    Si ocurre cualquier excepción:
        ROLLBACK

    La conexión siempre se cierra.
    """

    conexion = sqlite3.connect(ruta_bd)
    conexion.row_factory = sqlite3.Row
    conexion.execute("PRAGMA foreign_keys = ON")

    try:
        conexion.execute("BEGIN IMMEDIATE")
        yield conexion
        conexion.commit()

    except Exception:
        conexion.rollback()
        raise

    finally:
        conexion.close()


def conectar_lectura(ruta_bd: str | Path) -> sqlite3.Connection:
    """
    Abre una conexión para consultas.
    El llamador debe cerrarla.
    """

    conexion = sqlite3.connect(ruta_bd)
    conexion.row_factory = sqlite3.Row
    conexion.execute("PRAGMA foreign_keys = ON")

    return conexion