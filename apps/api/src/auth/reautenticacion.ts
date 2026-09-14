import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from './auth.instance';
import { AUTH } from './auth.tokens';

/**
 * Comprobar que quien pide algo irreversible es quien dice ser, AHORA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESCRIBIR «ELIMINAR» NO ES REAUTENTICARSE.                               │
 * │                                                                          │
 * │ Esa palabra confirma la INTENCION: que no ha sido un dedo torpe. No dice │
 * │ nada sobre la IDENTIDAD de quien tiene el telefono delante. Un movil     │
 * │ desbloqueado y olvidado en un vestuario, o prestado un momento, tiene la │
 * │ sesion abierta — y con ella bastaba para borrar una identidad entera sin │
 * │ vuelta atras.                                                            │
 * │                                                                          │
 * │ La contraseña actual es lo unico que hay hoy que solo sabe la persona.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE COMPARA NINGUN HASH AQUI. LO HACE LA LIBRERIA.                    │
 * │                                                                          │
 * │ `ctx.password.verify` es el mismo verificador que usa Better Auth al     │
 * │ iniciar sesion: conoce el algoritmo, el formato del hash almacenado y la │
 * │ comparacion en tiempo constante. Escribir aqui un `compare` propio       │
 * │ seria inventar criptografia, y se separaria de la libreria el dia que    │
 * │ esta cambie de algoritmo.                                                │
 * │                                                                          │
 * │ Y NO se usa `signInEmail` para «probar» la contraseña, que era la otra   │
 * │ salida evidente: abriria una sesion nueva que nadie ha pedido y gastaria │
 * │ un intento del limitador de login, hasta dejar a alguien sin poder       │
 * │ borrar su cuenta por haberlo intentado dos veces.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class Reautenticacion {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  /**
   * ¿Es esta la contraseña actual de esa cuenta?
   *
   * `false` tambien cuando la cuenta no tiene credencial de contraseña. Hoy no
   * puede pasar —el unico proveedor es `credential`— pero si algun dia se
   * añade entrar con Google, esa cuenta NO podra borrarse por esta via en vez
   * de poder borrarse SIN comprobar nada. Fallar cerrado.
   */
  async esLaContrasenaActual(userId: string, contrasena: string): Promise<boolean> {
    if (!contrasena) return false;

    const ctx = await this.auth.$context;
    const cuentas = await ctx.internalAdapter.findAccounts(userId);
    const credencial = cuentas?.find((c) => c.providerId === 'credential');
    if (!credencial?.password) return false;

    return ctx.password.verify({ hash: credencial.password, password: contrasena });
  }
}
