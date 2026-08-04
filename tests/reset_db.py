import sqlite3
from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]

RUTA_SCHEMA = RAIZ / "database" / "schema.sql"
RUTA_SEED = RAIZ / "database" / "seed_test.sql"
RUTA_BD_PRUEBA = RAIZ / "database" / "sam_test.db"


def reconstruir_bd_prueba() -> Path:
    """
    Elimina y reconstruye sam_test.db usando:
    - schema.sql
    - seed_test.sql
    """

    if RUTA_BD_PRUEBA.exists():
        RUTA_BD_PRUEBA.unlink()

    conexion = sqlite3.connect(RUTA_BD_PRUEBA)

    try:
        conexion.execute("PRAGMA foreign_keys = ON")

        conexion.executescript(
            RUTA_SCHEMA.read_text(encoding="utf-8")
        )

        conexion.executescript(
            RUTA_SEED.read_text(encoding="utf-8")
        )

    finally:
        conexion.close()

    return RUTA_BD_PRUEBA


if __name__ == "__main__":
    ruta = reconstruir_bd_prueba()
    print("Base reconstruida:", ruta)