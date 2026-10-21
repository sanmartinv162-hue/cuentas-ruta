# Cuentas de Ruta

Aplicación web local para administrar finanzas personales y el negocio de domicilios. La persistencia se implementa con Dexie sobre IndexedDB; la capa de dominio en curso está separada por modelos Zod, repositorios y servicios.

## Requisitos

- Node.js 24 o compatible con Vite 7.
- npm 11.

## Comandos

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

## Publicar en GitHub Pages

El flujo de GitHub Actions de [deploy.yml](.github/workflows/deploy.yml) compila y publica la app cuando se actualiza `main` o `master`. Para habilitarlo:

1. Sube este proyecto a un repositorio de GitHub.
2. En el repositorio, abre **Settings > Pages** y selecciona **GitHub Actions** como origen de publicación.
3. Sube los cambios a `main` o `master` (o ejecuta manualmente el flujo **Deploy to GitHub Pages** desde **Actions**).
4. Abre la URL que aparece en **Settings > Pages** desde el celular; funcionará también con datos móviles.

La interfaz publicada es accesible públicamente. La aplicación no tiene inicio de sesión ni sincronización: cada dispositivo guarda sus datos localmente en su propio navegador. Para desarrollo en la red local, ejecuta `npm.cmd run dev` y abre en el celular la dirección de red que muestra Vite; ambos dispositivos deben estar en el mismo Wi-Fi.

`npm.cmd test -- src/tests/database.test.ts` ejecuta las pruebas del esquema, y `npm.cmd test -- src/tests/services.test.ts` las pruebas de integración de dominio. La suite incluye una prueba de carga con 10.000 registros en IndexedDB simulado.

## Datos

La base local se llama `FinanceAssistantDB`. Los datos no salen del navegador. No borres el almacenamiento del sitio sin exportar antes el respaldo desde la aplicación. La sincronización remota todavía no está implementada; los campos de versión/dispositivo preparan los movimientos para una fase futura.

Consulta [docs/architecture.md](docs/architecture.md) para el esquema, las migraciones, índices, invariantes y límites de esta arquitectura.
