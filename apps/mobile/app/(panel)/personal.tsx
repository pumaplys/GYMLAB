import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GymStaffMember, Invitation, Role } from '@gymlab/contracts';
import { createInvitationSchema } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../src/componentes/cabecera-de-vuelta';
import { Campo } from '../../src/componentes/campo';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { Tarjeta } from '../../src/componentes/tarjeta';
import { laSesionYaNoVale, motivosDeFallo } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaCivil } from '../../src/formato/fecha';
import {
  NOMBRE_DEL_ESTADO,
  NOMBRE_DEL_ROL,
  estadoDeInvitacion,
  lineaDePersonal,
  rolesQuePuedeInvitar,
  sePuedeRevocar,
  soloPersonal,
} from '../../src/personal/logica';
import { puedeRetirarAcceso } from '../../src/personal/permisos';
import {
  cargarInvitaciones,
  cargarPersonal,
  crearInvitacion,
  retirarAcceso,
  revocarInvitacion,
} from '../../src/personal/fuente';
import { tema } from '../../src/tema';

/**
 * Quien trabaja en el gimnasio, y a quien se ha invitado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO HAY SOCIOS, Y NO ES UN OLVIDO.                                  │
 * │                                                                          │
 * │ A un socio se le invita desde SU FICHA, que ademas vincula la invitacion │
 * │ con ella. Mezclarlos llenaria esta pantalla de gente que no es personal  │
 * │ — es la misma decision que tomo el panel web.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VER LA LISTA NO DA PODER SOBRE ELLA.                                    │
 * │                                                                          │
 * │ Recepcion ve quien trabaja aqui —es operativa diaria y evita reinvitar a │
 * │ quien ya esta— y NO puede retirarle el acceso a nadie: eso es del dueño. │
 * │ Y el desplegable de roles se pinta con `CAN_INVITE`, la misma matriz que │
 * │ aplica el servidor, porque es control de escalada de privilegios.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface Datos {
  personal: GymStaffMember[];
  invitaciones: Invitation[];
}

type Carga = { fase: 'cargando' } | { fase: 'ok'; datos: Datos } | { fase: 'fallo' };

export default function Personal() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [invitando, setInvitando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [rolElegido, setRolElegido] = useState<Role | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const miRol = sesion.tipo === 'autenticado' ? sesion.rol : null;
  const puedeRetirar = miRol !== null && puedeRetirarAcceso(miRol);
  const rolesPosibles = miRol ? rolesQuePuedeInvitar(miRol) : [];

  const pedir = useCallback(async () => {
    if (!gymId) return;
    const [personal, invitaciones] = await Promise.allSettled([
      cargarPersonal(gymId),
      cargarInvitaciones(gymId),
    ]);
    if (laSesionYaNoVale(motivosDeFallo([personal, invitaciones]))) {
      void revisar();
      return;
    }
    if (personal.status === 'rejected') {
      setCarga({ fase: 'fallo' });
      return;
    }
    setCarga({
      fase: 'ok',
      datos: {
        personal: personal.value,
        // Solo personal: los socios se invitan desde su ficha.
        invitaciones: invitaciones.status === 'fulfilled' ? soloPersonal(invitaciones.value) : [],
      },
    });
  }, [gymId, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function invitar() {
    if (!gymId || !rolElegido || trabajando) return;
    const revisado = createInvitationSchema.safeParse({ email: correo.trim(), role: rolElegido });
    if (!revisado.success) {
      setError('Ese correo no tiene un formato válido.');
      return;
    }
    setTrabajando(true);
    setError(null);
    setHecho(null);
    try {
      await crearInvitacion(gymId, revisado.data.email, revisado.data.role);
      setHecho(
        `Invitación enviada a ${revisado.data.email} como ${NOMBRE_DEL_ROL[
          revisado.data.role
        ].toLowerCase()}.`,
      );
      setInvitando(false);
      setCorreo('');
      setRolElegido(null);
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      // El servidor explica los duplicados mejor que un mensaje generico.
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos enviar la invitación. Inténtalo de nuevo.',
      );
    } finally {
      setTrabajando(false);
    }
  }

  async function hacer(cual: 'retirar' | 'revocar', id: string) {
    if (!gymId || trabajando) return;
    setTrabajando(true);
    setError(null);
    setHecho(null);
    try {
      if (cual === 'retirar') await retirarAcceso(gymId, id);
      else await revocarInvitacion(gymId, id);
      setRetirando(null);
      setRevocando(null);
      await pedir();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos hacerlo. Inténtalo de nuevo.',
      );
      setRetirando(null);
      setRevocando(null);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta titulo="Personal" volverA="/panel" etiquetaDeVuelta="Panel" />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {hecho ? <Aviso tono="exito">{hecho}</Aviso> : null}

      {/* Invitar: solo con los roles que este rol puede crear. */}
      {rolesPosibles.length > 0 ? (
        invitando ? (
          <Tarjeta>
            <View style={estilos.bloque}>
              <Text style={estilos.rotulo}>Invitar a alguien</Text>
              <Campo
                etiqueta="Correo electrónico"
                valor={correo}
                alCambiar={setCorreo}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                deshabilitado={trabajando}
              />
              <Text style={estilos.rotulo}>Como</Text>
              <View style={estilos.pastillas}>
                {rolesPosibles.map((rol) => {
                  const activa = rol === rolElegido;
                  return (
                    <Pressable
                      key={rol}
                      onPress={() => setRolElegido(rol)}
                      disabled={trabajando}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activa }}
                      style={({ pressed }) => [
                        estilos.pastilla,
                        activa && estilos.pastillaElegida,
                        pressed && estilos.pulsado,
                      ]}
                    >
                      <Text style={[estilos.textoPastilla, activa && estilos.textoElegido]}>
                        {NOMBRE_DEL_ROL[rol]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Boton
                variante="primario"
                onPress={() => void invitar()}
                cargando={trabajando}
                deshabilitado={trabajando || !rolElegido}
              >
                Enviar la invitación
              </Boton>
              <Boton onPress={() => setInvitando(false)} deshabilitado={trabajando}>
                Cancelar
              </Boton>
            </View>
          </Tarjeta>
        ) : (
          <Boton variante="primario" onPress={() => setInvitando(true)}>
            Invitar a alguien
          </Boton>
        )
      ) : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar el personal.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <>
          <Tarjeta>
            <View style={estilos.bloque}>
              <Text style={estilos.rotulo}>Personal activo</Text>
              {carga.datos.personal.map((persona) => (
                <View key={persona.userId} style={estilos.fila}>
                  <Text style={estilos.titulo}>{persona.name}</Text>
                  <Text style={estilos.detalle}>{lineaDePersonal(persona, fechaCivil)}</Text>
                  <Text style={estilos.detalle}>{persona.email}</Text>

                  {puedeRetirar ? (
                    retirando === persona.userId ? (
                      <View style={estilos.confirmar}>
                        <Text style={estilos.pregunta}>
                          ¿Retirar el acceso? Dejará de poder entrar en RINDA como parte de este
                          gimnasio. No se borra nada: la pertenencia se termina con su fecha y se
                          le puede volver a dar acceso más adelante.
                        </Text>
                        <Boton
                          variante="peligro"
                          onPress={() => void hacer('retirar', persona.userId)}
                          cargando={trabajando}
                          deshabilitado={trabajando}
                        >
                          Sí, retirar el acceso
                        </Boton>
                        <Boton onPress={() => setRetirando(null)} deshabilitado={trabajando}>
                          Dejarlo
                        </Boton>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setRetirando(persona.userId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirar el acceso a ${persona.name}`}
                        style={({ pressed }) => [estilos.accion, pressed && estilos.pulsado]}
                      >
                        <Text style={estilos.textoPeligro}>Retirar el acceso</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              ))}
              {carga.datos.personal.length === 0 ? (
                <Text style={estilos.detalle}>Todavía no hay nadie más en el gimnasio.</Text>
              ) : null}
            </View>
          </Tarjeta>

          <Tarjeta>
            <View style={estilos.bloque}>
              <Text style={estilos.rotulo}>Invitaciones</Text>
              {carga.datos.invitaciones.map((invitacion) => {
                const estado = estadoDeInvitacion(invitacion);
                return (
                  <View key={invitacion.id} style={estilos.fila}>
                    <View style={estilos.cabecera}>
                      <Text style={estilos.titulo}>{invitacion.email}</Text>
                      <Etiqueta tono={estado === 'pendiente' ? 'acento' : 'neutro'}>
                        {NOMBRE_DEL_ESTADO[estado]}
                      </Etiqueta>
                    </View>
                    <Text style={estilos.detalle}>
                      {NOMBRE_DEL_ROL[invitacion.role]} · caduca el{' '}
                      {fechaCivil(invitacion.expiresAt.slice(0, 10))}
                    </Text>

                    {/* Revocar solo lo que sigue vivo: el resto lo rechaza el servidor. */}
                    {sePuedeRevocar(invitacion) ? (
                      revocando === invitacion.id ? (
                        <View style={estilos.confirmar}>
                          <Text style={estilos.pregunta}>
                            ¿Revocar la invitación? El enlace que se envió dejará de servir. Se
                            puede volver a invitar a esa persona cuando haga falta.
                          </Text>
                          <Boton
                            variante="peligro"
                            onPress={() => void hacer('revocar', invitacion.id)}
                            cargando={trabajando}
                            deshabilitado={trabajando}
                          >
                            Sí, revocarla
                          </Boton>
                          <Boton onPress={() => setRevocando(null)} deshabilitado={trabajando}>
                            Dejarla
                          </Boton>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => setRevocando(invitacion.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Revocar la invitación de ${invitacion.email}`}
                          style={({ pressed }) => [estilos.accion, pressed && estilos.pulsado]}
                        >
                          <Text style={estilos.textoPeligro}>Revocar</Text>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                );
              })}
              {carga.datos.invitaciones.length === 0 ? (
                <Text style={estilos.detalle}>No hay ninguna invitación de personal.</Text>
              ) : null}
            </View>
          </Tarjeta>
        </>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  bloque: { gap: tema.espacio.md },
  fila: { gap: 2, paddingVertical: tema.espacio.xs },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  titulo: { ...tema.texto.cuerpo, color: tema.color.texto, flex: 1 },
  detalle: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
  confirmar: { gap: tema.espacio.sm, paddingTop: tema.espacio.sm },
  accion: {
    alignSelf: 'flex-start',
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
  },
  textoPeligro: { ...tema.texto.secundario, color: tema.tinte.borde('peligro') },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.sm },
  pastilla: {
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.lg,
    borderRadius: tema.radio.pastilla,
    borderWidth: 1,
    borderColor: tema.color.borde,
    backgroundColor: tema.color.superficie,
  },
  pastillaElegida: {
    borderColor: tema.tinte.borde('acento'),
    backgroundColor: tema.tinte.fondo('acento'),
  },
  textoPastilla: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  textoElegido: { color: tema.color.texto, fontWeight: '600' },
  pulsado: { opacity: 0.6 },
});
