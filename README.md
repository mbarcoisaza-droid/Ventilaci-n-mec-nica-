# Ventilab · Simulador educativo de ventilación mecánica invasiva

Aplicación web (React + TypeScript) para residentes de Medicina de Emergencias, Medicina Crítica y Anestesiología. Las curvas, los bucles y los valores numéricos se generan respiración a respiración a partir de un modelo fisiológico; no hay animaciones prediseñadas.

> Herramienta educativa sin validación clínica formal. No debe usarse para decidir el tratamiento de pacientes reales.

## Instalar como aplicación

Ventilab es una aplicación web instalable (PWA): una vez instalada se abre en su propia ventana, con icono en el escritorio o en el menú Inicio, y funciona sin conexión.

1. Abra https://mbarcoisaza-droid.github.io/ventilaci-n-mec-nica-/ en Chrome o Edge (Windows, macOS, Linux, Android).
2. Pulse el botón **⤓ Instalar app** de la cabecera, o el icono de instalación de la barra de direcciones.
3. En iPhone/iPad: Safari → Compartir → «Añadir a pantalla de inicio».

La primera publicación requiere activar GitHub Pages una sola vez: *Settings → Pages → Build and deployment → Source: GitHub Actions*. A partir de ahí cada cambio en `main` se publica solo (el flujo ejecuta antes las pruebas).

Alternativa sin instalación: `npm run build:single` genera `dist-single/index.html`, un único archivo que se abre con doble clic.

## Paciente real

El módulo «Paciente real» recibe la programación del ventilador, la mecánica medida (Ppico, Pplat, PEEP total, Vte, FR, P0.1, ΔPocc, Pes), variables clínicas y gases arteriales. `src/engine/calibrate.ts` ajusta el modelo por simulación iterativa: compliance, resistencia, auto-PEEP, esfuerzo, espacio muerto, shunt, HCO₃⁻ y PAM. Después el paciente calibrado queda cargado para probar cambios. Lo que no se mide se toma del fenotipo elegido y se declara como supuesto. Es un ejercicio educativo, no una recomendación clínica.

## Laboratorio de asincronías

Las 12 asincronías reproducen la morfología descrita por Varón-Vega et al. (*Acta Colomb Cuid Intensivo* 2024, figs. 6–8): esfuerzos inefectivos con «joroba» del flujo espiratorio, doble disparo con volumen apilado, espiga de presión en el ciclado tardío, muesca espiratoria en el ciclado prematuro, Paw cóncava en el flujo insuficiente, etc. Al activarla, la asincronía aparece en todos los ciclos; el indicador **Asincronía (% de ciclos)** del panel de valores (ciclos con asincronía en los últimos 30 s; > 10 % = grave) baja a medida que se aplican, uno a uno, los pasos de corrección propuestos en esa revisión.

## Plan Kaplan (app de estudio)

En `kaplan/` hay una segunda aplicación, independiente del simulador: **Plan Kaplan**, para organizar y verificar las 3.000 preguntas de Kaplan antes del examen de residencia (21-feb-2027). Se publica en `…/ventilaci-n-mec-nica-/kaplan/` y se instala como app (PWA) igual que Ventilab.

- Plan del 3-nov-2026 al 14-feb-2027 (preguntas nuevas) y repaso del 15 al 20 de febrero; referencia de 205 preguntas/semana.
- Noviembre precargado (turnos de 12 h, 6 h, fines de semana y días libres; meta 815). Los días «sin definir» reciben una cuota automática que reparte lo que falta para llegar a 3.000.
- Vistas Día / Semana / Mes, checklist diario, «Completar día» verificado con el número real de preguntas nuevas (los repasos se cuentan aparte), reprogramación de déficits.
- Rutinas editables con traslados, meta de sueño y aviso de superposiciones.
- Alarmas mientras la app está abierta (posponer, descartar, reprogramar) y exportación `.ics` al calendario del teléfono para avisos con la app cerrada.
- Lista de repaso de incorrectas y dudosas con filtros; datos locales con exportación/restauración JSON y CSV.

Código: `kaplan/src/` (lógica en `plan.ts`, `alarms.ts`, `io.ts`; pruebas en `plan.test.ts`). Recursos estáticos en `public/kaplan/`.

## Uso para desarrollo

```bash
npm install
npm run dev          # servidor de desarrollo
npm test             # pruebas de consistencia del motor y de los casos (vitest)
npm run build        # compilación estándar en dist/
npm run build:single # archivo HTML único en dist-single/
```

## Estructura

```
src/engine/        motor numérico independiente de la interfaz
  types.ts         unidades, convenciones de signos, tipos
  mechanics.ts     ecuación de movimiento: elastancia no lineal, reclutamiento, Rohrer,
                   viscoelasticidad (Maxwell), limitación al flujo espiratorio
  patient.ts       generador de Pmus (ritmo neural, disparo reverso, espiración activa/refleja)
  simulator.ts     ventilador (10 modos), disparo/ciclado, maniobras, alarmas, monitor, registro 100 Hz
  gas.ts           intercambio gaseoso y hemodinamia (compartimento único, dinámica acelerada)
  presets.ts       fenotipos (sano, SDRA leve/moderado/grave, EPOC, asma, obesidad, neuromuscular,
                   edema cardiogénico, alta demanda, P-SILI) y ajustes por defecto
  pvcurve.ts       curva P-V cuasiestática
  engine.test.ts   pruebas: conservación de volumen, unidades, equilibrio, integración flujo-volumen,
                   R y C, espiración pasiva (τ), PEEP, Ti, auto-PEEP, cascada, fugas, maniobras, robustez
src/education/     modos (taxonomía de Chatburn), 12 asincronías, lectura fisiológica en tiempo real
src/cases/         11 casos clínicos serializables en JSON, evaluador no punitivo por rangos
src/ui/            lienzos (curvas, bucles), monitor numérico, mandos, paneles docentes
```

## Modelo

`Paw + Pmus = Pel(V) + R·V̇ + K2·V̇|V̇| + P2`

- Presiones en cmH₂O relativas a la atmósfera; V̇ > 0 hacia el paciente; Pmus > 0 inspiratoria.
- `Pel = PL,el + Pcw`; `Pcw = Ppl0 + Ecw·V`; `Ppl = Pcw − Pmus`; `PL = Palv − Ppl`.
- `PL,el = −Ppl0 + (EL/r)·V + Kod·max(0, V − Vod·r)² + P2`, con `r` (fracción aireada) que evoluciona hacia una sigmoide de la PL (apertura rápida, cierre lento).
- Limitación espiratoria: `V̇max = (PL,el − Pcrit)² / (Rus·5)`, independiente de Paw (efecto cascada).
- Euler explícito a 500 Hz.

Los esfuerzos inefectivos, el doble disparo, el breath stacking, el autodisparo por fuga, la auto-PEEP o el retiro de soporte en PRVC no están programados como eventos: aparecen al resolver la ecuación con la lógica de disparo y ciclado del ventilador.

Simplificaciones principales: un compartimento (sin pendelluft ni heterogeneidad regional), reclutamiento global, sin compresibilidad del circuito, hemodinamia y PIC cualitativas, gasometría con dinámica acelerada. Las variables marcadas «modelo» (Pmus, Ppl, PL) equivalen a disponer de una presión esofágica ideal.
