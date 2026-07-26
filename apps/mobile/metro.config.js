// Configuracion de Metro para monorepo.
// Sin esto, Metro no encuentra los paquetes de packages/* ni vigila sus cambios.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Vigilar todo el monorepo, para recargar al tocar packages/contracts.
config.watchFolders = [workspaceRoot];

// 2. Resolver modulos desde la app y desde la raiz del workspace.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Sin busqueda jerarquica: solo las rutas de arriba. Evita resolver
//    accidentalmente una copia duplicada de React.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
