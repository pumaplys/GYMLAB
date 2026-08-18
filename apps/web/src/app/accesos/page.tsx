'use client';

import { useState } from 'react';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Escaner } from './escaner';
import { Historial } from './historial';

/**
 * La puerta del gimnasio: escanear un carne y ver quien ha entrado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CIERRA EL UNICO FLUJO DE V1 QUE ESTABA INALCANZABLE.                    │
 * │                                                                          │
 * │ El socio podia generar su QR desde #69 y el backend sabia verificarlo    │
 * │ desde el modulo de acceso, pero no habia pantalla: en #76 hubo que       │
 * │ validarlo con `curl` contra produccion. Un carne que nadie puede leer no │
 * │ es un carne.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Duena y recepcion. El entrenador no: quien controla la puerta es el
 * mostrador. Y el socio menos, evidentemente — validar tu propio codigo seria
 * abrirte la puerta tu mismo. El servidor lo impone igual (`@Roles`); aqui solo
 * se evita pintar una pantalla que la API va a rechazar entera.
 */
export default function AccesosPage() {
  return (
    <RutaPrivada roles={['owner', 'receptionist']}>
      <Marco>
        <Accesos />
      </Marco>
    </RutaPrivada>
  );
}

function Accesos() {
  /*
   * Un contador y no un booleano: cada verificacion tiene que provocar UNA
   * recarga del historial. Con un booleano, dos escaneos seguidos dejarian el
   * valor igual y el segundo no refrescaria nada.
   */
  const [verificaciones, setVerificaciones] = useState(0);

  return (
    <>
      <EncabezadoDePagina titulo="Accesos" entradilla="Escanear carnes y ver las entradas" />
      <Escaner alVerificar={() => setVerificaciones((n) => n + 1)} />
      <Historial refresco={verificaciones} />
    </>
  );
}
