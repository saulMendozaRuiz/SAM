from backend.db import conectar_lectura, transaccion


RUTA_BD = "database/sam_test.db"


def obtener_comentario() -> str:
    conexion = conectar_lectura(RUTA_BD)

    try:
        fila = conexion.execute(
            """
            SELECT COMENTARIOS
            FROM tblAbonos
            WHERE ID_ABONO = ?
            """,
            (1,),
        ).fetchone()

        return fila["COMENTARIOS"]

    finally:
        conexion.close()


print("Comentario inicial:", obtener_comentario())


# ---------------------------------------------------------
# PRUEBA DE COMMIT
# ---------------------------------------------------------

with transaccion(RUTA_BD) as conexion:
    conexion.execute(
        """
        UPDATE tblAbonos
        SET COMENTARIOS = ?
        WHERE ID_ABONO = ?
        """,
        ("PRUEBA COMMIT", 1),
    )

comentario_despues_commit = obtener_comentario()

assert comentario_despues_commit == "PRUEBA COMMIT"

print("Comentario después del commit:", comentario_despues_commit)
print("COMMIT: CORRECTO")


# ---------------------------------------------------------
# PRUEBA DE ROLLBACK
# ---------------------------------------------------------

try:
    with transaccion(RUTA_BD) as conexion:
        conexion.execute(
            """
            UPDATE tblAbonos
            SET COMENTARIOS = ?
            WHERE ID_ABONO = ?
            """,
            ("NO DEBE GUARDARSE", 1),
        )

        raise RuntimeError("ERROR INTENCIONAL")

except RuntimeError as error:
    print("Excepción capturada:", error)


comentario_despues_rollback = obtener_comentario()

assert comentario_despues_rollback == "PRUEBA COMMIT"

print("Comentario después del rollback:", comentario_despues_rollback)
print("ROLLBACK: CORRECTO")