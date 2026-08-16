/**
 * Que se mide y en que unidad. Los nombres son los del contrato.
 *
 * Esta en `lib` y no dentro de un area porque lo miran DOS: el entrenador
 * cuando registra, y el socio cuando consulta. Con una copia en cada sitio, la
 * primera correccion —una unidad, una etiqueta— se aplicaria solo en una, y el
 * socio leeria sus propios datos con otro nombre del que le puso quien los
 * tomo.
 */
export const MEDIDAS = [
  { campo: 'weightKg', etiqueta: 'Peso', unidad: 'kg' },
  { campo: 'bodyFatPercent', etiqueta: 'Grasa corporal', unidad: '%' },
  { campo: 'chestCm', etiqueta: 'Pecho', unidad: 'cm' },
  { campo: 'waistCm', etiqueta: 'Cintura', unidad: 'cm' },
  { campo: 'hipCm', etiqueta: 'Cadera', unidad: 'cm' },
  { campo: 'armCm', etiqueta: 'Brazo', unidad: 'cm' },
  { campo: 'thighCm', etiqueta: 'Muslo', unidad: 'cm' },
] as const;

export type CampoDeMedida = (typeof MEDIDAS)[number]['campo'];
