import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Member, Role } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { laSesionYaNoVale } from '../auth/politica';
import {
  ETIQUETA_BAJA_DE_SOCIO,
  ETIQUETA_ELIMINAR,
  estaDeBaja,
  porQueNoSePuedeInvitar,
  sePuedeInvitar,
} from './gestion';
import { puedeEliminarSocio, puedeExportarDatos } from './permisos';
import {
  darDeBajaSocio,
  eliminarSocio,
  exportarDatos,
  invitarSocio,
  reactivarSocio,
} from './fuente';
import { RUTAS_INTERNAS } from '../navegacion/destinos';
import { tema } from '../tema';

/**
 * Lo que se puede hacer con un socio desde su ficha.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TRES ACCIONES SON DEL DUEÑO Y NO SE PINTAN PARA RECEPCION.              │
 * │                                                                          │
 * │ Exportar y eliminar llevan `@Roles('owner')` en la API. Ofrecerlas a     │
 * │ recepcion seria enseñar dos botones que devuelven 403 — y uno de ellos   │
 * │ es el que borra a una persona para siempre.                              │
 * │                                                                          │
 * │ La confirmacion de eliminar dice lo que se pierde y lo que NO: los       │
 * │ cobros se conservan sin su nombre, porque la caja tiene que cuadrar      │
 * │ aunque la persona ya no este.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type EnCurso = 'invitacion' | 'baja' | 'alta' | 'exportar' | 'eliminar' | null;

export function AccionesDeFicha({
  socio,
  gymId,
  rol,
  alCambiar,
  alCaducarSesion,
}: {
  socio: Member;
  gymId: string | null;
  rol: Role;
  alCambiar: () => void;
  alCaducarSesion: () => void;
}) {
  const [enCurso, setEnCurso] = useState<EnCurso>(null);
  const [confirmando, setConfirmando] = useState<'baja' | 'eliminar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const deBaja = estaDeBaja(socio);
  const motivoSinInvitar = porQueNoSePuedeInvitar(socio);

  async function ejecutar(cual: Exclude<EnCurso, null>, hacer: () => Promise<unknown>) {
    if (!gymId || enCurso) return;
    setEnCurso(cual);
    setError(null);
    setHecho(null);
    try {
      await hacer();
      setConfirmando(null);
      if (cual === 'eliminar') {
        // Ya no hay ficha que refrescar: volver a la busqueda. Quedarse aqui
        // acabaria en un 404 al recargar.
        router.replace('/buscar');
        return;
      }
      if (cual === 'invitacion') setHecho('Invitación enviada.');
      if (cual === 'exportar') setHecho('Datos exportados.');
      alCambiar();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        alCaducarSesion();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos hacerlo. Inténtalo de nuevo.',
      );
      setConfirmando(null);
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <View style={estilos.bloque}>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {hecho ? <Aviso tono="exito">{hecho}</Aviso> : null}

      <Boton onPress={() => router.push(RUTAS_INTERNAS.editarSocio(socio.id))}>
        Editar los datos
      </Boton>

      {/*
        Invitar solo aparece cuando puede funcionar: el servidor rechaza a quien
        ya tiene cuenta, y a quien no tiene correo no hay a donde mandarle nada.
        Se dice el motivo en lugar de esconder el boton sin explicacion.
      */}
      {sePuedeInvitar(socio) ? (
        <Boton
          onPress={() => void ejecutar('invitacion', () => invitarSocio(gymId ?? '', socio.id))}
          cargando={enCurso === 'invitacion'}
          deshabilitado={enCurso !== null}
        >
          Invitar a la app
        </Boton>
      ) : (
        <Text style={estilos.nota}>No se puede invitar: {motivoSinInvitar}</Text>
      )}

      {deBaja ? (
        <Boton
          onPress={() => void ejecutar('alta', () => reactivarSocio(gymId ?? '', socio.id))}
          cargando={enCurso === 'alta'}
          deshabilitado={enCurso !== null}
        >
          Volver a dar de alta
        </Boton>
      ) : confirmando === 'baja' ? (
        <>
          <Text style={estilos.pregunta}>
            ¿Dar de baja al socio? Deja de poder entrar. Se conserva todo y se puede volver a dar
            de alta cuando haga falta.
          </Text>
          <Boton
            variante="peligro"
            onPress={() => void ejecutar('baja', () => darDeBajaSocio(gymId ?? '', socio.id))}
            cargando={enCurso === 'baja'}
            deshabilitado={enCurso !== null}
          >
            Sí, dar de baja
          </Boton>
          <Boton onPress={() => setConfirmando(null)} deshabilitado={enCurso !== null}>
            Dejarlo como está
          </Boton>
        </>
      ) : (
        <Boton onPress={() => setConfirmando('baja')} deshabilitado={enCurso !== null}>
          {ETIQUETA_BAJA_DE_SOCIO}
        </Boton>
      )}

      {puedeExportarDatos(rol) ? (
        <Boton
          onPress={() => void ejecutar('exportar', () => exportarDatos(gymId ?? '', socio.id))}
          cargando={enCurso === 'exportar'}
          deshabilitado={enCurso !== null}
        >
          Exportar sus datos
        </Boton>
      ) : null}

      {puedeEliminarSocio(rol) ? (
        confirmando === 'eliminar' ? (
          <>
            <Text style={estilos.pregunta}>
              ¿Eliminar para siempre? Se borran su ficha, sus notas, sus medidas y sus cuotas, y no
              se puede deshacer. Los cobros se conservan sin su nombre, para que la caja siga
              cuadrando.
            </Text>
            <Boton
              variante="peligro"
              onPress={() => void ejecutar('eliminar', () => eliminarSocio(gymId ?? '', socio.id))}
              cargando={enCurso === 'eliminar'}
              deshabilitado={enCurso !== null}
            >
              {ETIQUETA_ELIMINAR}
            </Boton>
            <Boton onPress={() => setConfirmando(null)} deshabilitado={enCurso !== null}>
              No eliminar
            </Boton>
          </>
        ) : (
          <Boton onPress={() => setConfirmando('eliminar')} deshabilitado={enCurso !== null}>
            {ETIQUETA_ELIMINAR}
          </Boton>
        )
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  nota: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
});
