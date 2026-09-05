# Ensayo físico en el iPhone — primera development build

Este documento se rellena **con el teléfono en la mano**. Nada de lo que hay
aquí está comprobado todavía: hasta ahora la app solo se ha visto en un
navegador, y eso no valida ni la zona segura, ni la tipografía del sistema, ni
los gestos, ni el escáner de la puerta.

## Antes de empezar

| | |
|---|---|
| PC y iPhone | en la **misma** Wi-Fi |
| IP del PC (Wi-Fi) | `192.168.1.130` |
| API de desarrollo | `http://192.168.1.130:3001/v1` |
| Metro | `http://192.168.1.130:8081` |
| Base de datos | **desarrollo**. Nunca producción |

Arrancar, en dos terminales:

```bash
pnpm --filter @gymlab/api dev
```

```bash
pnpm --filter @gymlab/mobile exec expo start --dev-client
```

## 1. Recorrido completo

Marcar cada punto con lo que pasa de verdad, no con lo que debería pasar.

| # | Paso | Resultado |
|---|---|---|
| 1 | Abrir la app | |
| 2 | Entrar con la cuenta de socia | |
| 3 | Selector de gimnasio, si aparece | |
| 4 | Inicio: saludo, cuota, rutinas, última medición | |
| 5 | Tirar hacia abajo para refrescar | |
| 6 | Rutina | |
| 7 | Cambiar de rutina en el selector | |
| 8 | Volver | |
| 9 | Carné | |
| 10 | **Tiempo** desde tocar Carné hasta ver el QR | |
| 11 | Esperar 60 s: el QR desaparece y lo dice | |
| 12 | Generar un código nuevo | |
| 13 | Salir de la app y volver: pide otro código | |
| 14 | Progreso | |
| 15 | Cambiar de métrica | |
| 16 | Perfil | |
| 17 | Pagos | |
| 18 | Accesos | |
| 19 | Privacidad | |
| 20 | Volver desde las tres subpantallas | |
| 21 | Cerrar sesión | |
| 22 | Volver a entrar | |

## 2. El escaneo, que es lo único que no se puede simular

| # | Paso | Resultado |
|---|---|---|
| 23 | **Escanear el QR contra el lector real del gimnasio** | |
| | ¿Lo lee a la primera? ¿A qué distancia? | |
| | ¿Con el brillo automático, o hay que subirlo? | |
| | ¿Queda registrado el acceso en Accesos? | |
| | Escanear el MISMO código dos veces: debe fallar la segunda | |
| | Escanear uno caducado | |

**El carné no se da por bueno hasta que el punto 23 esté hecho.** Todo lo
anterior solo demuestra que la app dibuja un QR, no que abra una puerta.

## 3. Qué mirar mientras tanto

Anotar cualquier cosa que chirríe, aunque no esté en la lista.

- **Zona segura arriba**: ¿el contenido se mete bajo la isla dinámica o la muesca?
- **Indicador de inicio abajo**: ¿tapa la barra de pestañas o algún botón?
- **Tipografía**: San Francisco de verdad, no una sustituta.
- **Tamaño de letra del sistema**: subirlo en Ajustes → Pantalla y brillo, y
  repetir Inicio, Carné, Progreso y Privacidad. En el navegador no se rompía
  nada hasta el 160 %, pero eso era una simulación.
- **Objetivos táctiles**: ¿se acierta a la primera con una mano?
- **Teclado**: en el login, ¿tapa el botón de entrar? ¿Se puede desplazar?
- **Mostrar/ocultar contraseña**.
- **Desplazamiento y rebote**: ¿se siente nativo?
- **Tirar para refrescar**: ¿aparece el indicador donde toca?
- **Transiciones** entre pestañas y al abrir una subpantalla de Perfil.
- **Gesto de volver** deslizando desde el borde izquierdo.
- **Cuenta atrás del código**: ¿va al segundo?
- **Segundo plano**: salir, esperar dos minutos, volver.
- **Errores de red**: apagar la API a propósito y mirar qué dice la app.
- **Modo avión**.
- **Fluidez** al desplazar listas largas.
- **Cierres inesperados** y cualquier error en la consola del dev client.

## 4. Después

Lo que falle se anota **aquí**, con captura o vídeo si se puede. No se corrige
nada a ciegas: primero se reproduce, después se decide.
