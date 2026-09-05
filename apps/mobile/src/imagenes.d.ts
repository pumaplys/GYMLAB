/**
 * Los PNG se importan, no se piden con `require`.
 *
 * Metro resuelve un `import` de imagen a un identificador numerico de asset,
 * que es lo que espera la prop `source` de `Image`. Sin esta declaracion,
 * TypeScript no sabe que un `.png` se puede importar, y la alternativa
 * —`require()`— la prohibe la regla `no-require-imports` del monorepo.
 *
 * El tipo es `number` porque eso es exactamente lo que devuelve Metro para un
 * asset local; `ImageSourcePropType` lo acepta.
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}
