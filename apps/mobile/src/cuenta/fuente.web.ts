import type { ErasurePreview, ErasureResult } from '@gymlab/contracts';

/**
 * La vista previa web NO borra nada, y eso no es pereza.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES LA UNICA PANTALLA DONDE FINGIR SERIA PELIGROSO.                      │
 * │                                                                          │
 * │ La vista previa existe para revisar diseño sin telefono. En el resto de  │
 * │ pantallas devuelve datos de muestra; aqui devolver «hecho» enseñaria un  │
 * │ adios que no ha ocurrido, e invitaria a probar el flujo entero creyendo  │
 * │ que se esta probando el de verdad.                                       │
 * │                                                                          │
 * │ Asi que se enseña el estado que MAS informacion da sin tocar nada: el    │
 * │ bloqueo, que es el unico con texto, nombre de gimnasio y salida.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const BLOQUEO_DE_MUESTRA = [
  { gymId: '00000000-0000-0000-0000-000000000000', nombre: 'Gimnasio de muestra' },
];

export async function consultarBorrado(): Promise<ErasurePreview> {
  return { puedeBorrarse: false, bloqueos: BLOQUEO_DE_MUESTRA };
}

export async function borrarCuenta(_contrasena: string): Promise<ErasureResult> {
  return { ok: false, bloqueos: BLOQUEO_DE_MUESTRA };
}
