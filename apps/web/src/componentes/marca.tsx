import estilos from './marca.module.css';

/**
 * La marca RINDA en el panel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL LOCKUP COMPLETO NO SE PUEDE USAR AQUI, Y ES CUESTION DE CONTRASTE.   │
 * │                                                                          │
 * │ El logotipo esta dibujado para fondo oscuro: el simbolo es lima y la     │
 * │ palabra, blanca. Medido sobre el blanco de este panel:                   │
 * │                                                                          │
 * │   lima  #A3FF12  sobre #ffffff   ->  1,24:1   apenas se ve               │
 * │   blanco          sobre #ffffff   ->  1,00:1   no se ve                  │
 * │   lima  #A3FF12  sobre #0D0F12   ->  15,42:1  para esto se diseño        │
 * │                                                                          │
 * │ Asi que el simbolo viaja CON SU FONDO —la misma imagen del icono de la   │
 * │ app— en una pastilla pequeña, y la palabra se escribe con la tipografia  │
 * │ y la tinta del panel. No se recolorea el logotipo ni se redibuja nada:   │
 * │ es el mismo fichero, puesto donde tiene el contraste para el que existe. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Marca({ tamano = 'normal' }: { tamano?: 'normal' | 'grande' }) {
  return (
    <span className={`${estilos.marca} ${tamano === 'grande' ? estilos.grande : ''}`.trim()}>
      {/*
        `alt` vacio a proposito: el nombre lo pone la palabra que va al lado.
        Con un `alt="RINDA"` un lector de pantalla diria la marca dos veces.
      */}
      <img className={estilos.simbolo} src="/rinda-icono.png" alt="" width={128} height={128} />
      <span className={estilos.palabra}>RINDA</span>
    </span>
  );
}

/** Solo el simbolo, para donde no cabe la palabra. Ahi si lleva nombre. */
export function Simbolo() {
  return (
    <img className={estilos.simbolo} src="/rinda-icono.png" alt="RINDA" width={128} height={128} />
  );
}
