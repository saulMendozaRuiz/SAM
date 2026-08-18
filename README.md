# SAM

Aplicación de escritorio para controlar unidades, obligaciones, financiamientos y abonos de MexRAC.

## Uso y datos

SAM es local y de un solo usuario. La aplicación conserva las operaciones financieras en SQLite y usa transacciones para evitar registros parciales.

- Desarrollo: `database/sam_test.db`.
- Aplicación instalada: `%LOCALAPPDATA%\MexRAC\SAM\database\sam.db`.
- Ruta portátil opcional: establecer `SAM_DATA_DIR` al directorio que contendrá `sam.db`.

En el primer inicio, SAM crea automáticamente la carpeta y una base vacía. Si la tabla de usuarios está vacía, el acceso inicial es `user123` / `admin123`.

Para trasladar datos a otra computadora, cierre SAM y copie `sam.db` a la ruta indicada. No copie los archivos `-wal` o `-shm` con SAM abierto.

## Mantenimiento

Solo hay tres comandos habituales, todos desde `frontend`:

```powershell
# Desarrollo
npm.cmd run tauri dev

# Verificación corta: interfaz + 6 pruebas de reglas críticas
npm.cmd run verify

# Verificar y crear el instalador
npm.cmd run release
```

El instalador queda bajo `frontend\src-tauri\target\release\bundle`.

## Alcance técnico

- `frontend/src`: interfaz TypeScript.
- `frontend/src-tauri/src`: operaciones y transacciones SQLite.
- `database/schema.sql`: estructura para bases nuevas.

Las altas de adquisiciones, financiamientos, cancelaciones y abonos deben continuar siendo transaccionales. No es necesario ejecutar diagnósticos de integridad en cada inicio cuando la base solo se modifica mediante SAM.
