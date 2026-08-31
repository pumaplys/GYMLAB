/**
 * Metro, sin configuracion propia.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI HABIA TRES HACKS DE MONOREPO Y YA NO HACEN FALTA.                   │
 * │                                                                          │
 * │ La version anterior fijaba a mano `watchFolders`, `nodeModulesPaths` y   │
 * │ `disableHierarchicalLookup: true`, este ultimo para evitar que Metro     │
 * │ resolviera una segunda copia de React subiendo por el arbol. Era un      │
 * │ miedo razonable —el monorepo TIENE dos: react@19.2.3 en movil y          │
 * │ react@19.2.8 en la web— pero Expo SDK 57 ya resuelve el caso solo, y     │
 * │ mejor:                                                                   │
 * │                                                                          │
 * │   watchFolders      la raiz Y los siete paquetes del workspace           │
 * │                     (el hack solo vigilaba la raiz)                      │
 * │   nodeModulesPaths  apps/mobile/node_modules y la raiz — identico        │
 * │                                                                          │
 * │ COMPROBADO, no supuesto: con esta configuracion se exporto el bundle de  │
 * │ Android con mapas de origen y se leyeron las rutas de todos sus modulos. │
 * │ React aparece 4 veces y las cuatro son `react@19.2.3`; React Native, una │
 * │ sola version. Cero duplicados.                                          │
 * │                                                                          │
 * │ `disableHierarchicalLookup: true` era ademas lo que hacia fallar a       │
 * │ `expo-doctor`, que lo desaconseja expresamente.                          │
 * │                                                                          │
 * │ Si algun dia vuelve a aparecer React duplicado, la prueba esta escrita   │
 * │ arriba: exportar con `--source-maps --no-bytecode` y mirar las rutas.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
