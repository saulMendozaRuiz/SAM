import "./app.css";

import {
  verifyDatabaseLight,
} from "./api.ts";

import {
  initializeAuthentication,
} from "./auth.ts";

import {
  initializeNavigation,
} from "./navigation.ts";

let lightCheckPromise: ReturnType<typeof verifyDatabaseLight> | undefined;

function startLightDatabaseCheck() {
  if (!lightCheckPromise) {
    lightCheckPromise =
      verifyDatabaseLight().catch((error) => {
        console.error(
          "SAM database verification failed:",
          error,
        );

        throw error;
      });
  }

  return lightCheckPromise;
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    /*
     * Primero se habilita la interfaz.
     * Ninguna consulta SQLite bloquea el login.
     */
    initializeAuthentication();
    initializeNavigation();

    /*
     * La verificación se lanza concurrentemente.
     * No se espera su resultado para iniciar sesión.
     */
    startLightDatabaseCheck().catch(() => {
      // El error ya fue registrado en consola.
    });
  },
);
