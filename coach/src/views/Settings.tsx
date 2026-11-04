/** Perfil, plan semanal, recordatorios, preferencias y datos. */
import { useState } from 'react';
import { upsertRoutine } from '../actions';
import { Field, Sheet, Stepper, Toggle } from '../components/ui';
import { DOW_SHORT, WEEK_ORDER, todayISO } from '../dates';
import { AppState, EQUIPMENT, Level, defaultState, ensurePlanSessions, migrate, sampleRoutine, syncLibrary } from '../model';
import { isIOS, isStandalone, notifPermission, notifSupported, requestNotif } from '../notify';
import { buildICS, download } from '../progress';
import { withSeeds } from '../seed';

type Upd = (fn: (s: AppState) => AppState) => void;

export function Settings({ state, update, replace }: { state: AppState; update: Upd; replace: (s: AppState) => void }) {
  const p = state.profile;
  const r = state.reminders;
  const st = state.settings;
  const setP = (x: Partial<typeof p>) => update((s) => ({ ...s, profile: { ...s.profile, ...x } }));
  const setR = (x: Partial<typeof r>) => update((s) => ensurePlanSessions({ ...s, reminders: { ...s.reminders, ...x } }));
  const setS = (x: Partial<typeof st>) => update((s) => ({ ...s, settings: { ...s.settings, ...x } }));
  const [perm, setPerm] = useState(notifPermission());
  const [ask, setAsk] = useState(false);
  const [reset, setReset] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const enableNotif = async () => {
    const res = await requestNotif();
    setPerm(res);
    setAsk(false);
    if (res === 'granted') setR({ trainEnabled: true });
  };

  const importJSON = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = syncLibrary(withSeeds(migrate(JSON.parse(String(reader.result)))));
        replace(data);
        setMsg('Copia restaurada correctamente.');
      } catch {
        setMsg('El archivo no es una copia válida de Mi Coach.');
      }
    };
    reader.readAsText(f);
  };

  return (
    <div className="page">
      <h1 className="page-title">Ajustes</h1>
      {msg && (
        <p className="notice ok" role="status">
          {msg}
        </p>
      )}

      <section className="card">
        <h2>Tu perfil</h2>
        <p className="muted tiny">Esta información es para ti y tu entrenador. La app no cambia la rutina automáticamente con estos datos.</p>
        <Field label="Nombre (opcional)">
          <input value={p.name} onChange={(e) => setP({ name: e.target.value })} />
        </Field>
        <Field label="Nivel de experiencia">
          <div className="seg">
            {(['principiante', 'intermedio', 'avanzado'] as Level[]).map((l) => (
              <button key={l} className={p.level === l ? 'on' : ''} aria-pressed={p.level === l} onClick={() => setP({ level: p.level === l ? '' : l })}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </Field>
        <span className="field-label">Equipo disponible</span>
        <div className="checks">
          {EQUIPMENT.map((e) => (
            <label key={e} className={`chip-check ${p.equipment.includes(e) ? 'on' : ''}`}>
              <input type="checkbox" checked={p.equipment.includes(e)} onChange={(ev) => setP({ equipment: ev.target.checked ? [...p.equipment, e] : p.equipment.filter((x) => x !== e) })} />
              {e}
            </label>
          ))}
        </div>
        <Field label="Objetivo">
          <input value={p.goal} onChange={(e) => setP({ goal: e.target.value })} placeholder="Por ejemplo: constancia, resistencia, movilidad" />
        </Field>
        <Field label="Restricciones o datos que quieras comunicar" hint="Se mostrarán como recordatorio antes de entrenar. No se usan para diagnosticar ni para modificar la rutina por su cuenta.">
          <textarea rows={3} value={p.restrictions} onChange={(e) => setP({ restrictions: e.target.value })} placeholder="Por ejemplo: evitar saltos, molestia en rodilla izquierda" />
        </Field>
      </section>

      <section className="card">
        <h2>Plan semanal</h2>
        <span className="field-label">Días de entrenamiento</span>
        <div className="dow-pick">
          {WEEK_ORDER.map((d) => (
            <button key={d} className={r.days.includes(d) ? 'on' : ''} aria-pressed={r.days.includes(d)} onClick={() => setR({ days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d] })}>
              {DOW_SHORT[d]}
            </button>
          ))}
        </div>
        <div className="grid2">
          <Field label="Hora">
            <input type="time" value={r.time} onChange={(e) => setR({ time: e.target.value })} />
          </Field>
          <Field label="Rutina del plan">
            <select value={r.routineId} onChange={(e) => setR({ routineId: e.target.value })}>
              <option value="">— Ninguna —</option>
              {state.routines.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toggle checked={r.autoSchedule} onChange={(v) => setR({ autoSchedule: v })} label="Programar automáticamente" hint="Añade la rutina al calendario en esos días (semana actual y dos siguientes)." />
        <Field label="Meta semanal (sesiones)">
          <Stepper label="Meta semanal" value={st.weeklyGoal} min={1} max={14} onChange={(n) => setS({ weeklyGoal: n })} />
        </Field>
      </section>

      <section className="card">
        <h2>Recordatorios</h2>
        <Toggle
          checked={r.trainEnabled}
          onChange={(v) => (v && perm !== 'granted' && perm !== 'unsupported' ? setAsk(true) : setR({ trainEnabled: v }))}
          label="Recordar la hora de entrenar"
          hint={`En los días del plan, a las ${r.time}.`}
        />
        <Toggle
          checked={r.logEnabled}
          onChange={(v) => (v && perm !== 'granted' && perm !== 'unsupported' ? setAsk(true) : setR({ logEnabled: v }))}
          label="Recordar registrar el entrenamiento"
          hint="Si ese día la sesión sigue pendiente."
        />
        {r.logEnabled && (
          <Field label="Hora del recordatorio de registro">
            <input type="time" value={r.logTime} onChange={(e) => setR({ logTime: e.target.value })} />
          </Field>
        )}
        <p className="tiny">
          Notificaciones del sistema:{' '}
          <b>{perm === 'granted' ? 'permitidas' : perm === 'denied' ? 'bloqueadas en el navegador' : perm === 'unsupported' ? 'no disponibles en este navegador' : 'sin permiso'}</b>
        </p>
        {perm === 'default' && (
          <button className="btn sm" onClick={() => setAsk(true)}>
            Permitir notificaciones
          </button>
        )}
        <div className="notice">
          <b>Limitación importante:</b> Mi Coach es una aplicación web y solo puede avisarte mientras está abierta (en pantalla o en segundo plano reciente). Con la app cerrada no puede
          sonar una alarma. Para avisos con la app cerrada, añade tus sesiones al calendario del teléfono: el calendario te avisará 10 minutos antes.
          {isIOS() && !isStandalone() && ' En iPhone, las notificaciones solo funcionan si añades la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio).'}
        </div>
        <button className="btn" onClick={() => download('mi-coach-sesiones.ics', buildICS(state, todayISO()), 'text/calendar')}>
          📅 Añadir sesiones al calendario (.ics)
        </button>
      </section>

      <section className="card">
        <h2>Durante el entrenamiento</h2>
        <Toggle checked={st.sound} onChange={(v) => setS({ sound: v })} label="Avisos sonoros" hint="Cuenta regresiva de 3 segundos y cambio de ejercicio." />
        <Toggle checked={st.vibrate} onChange={(v) => setS({ vibrate: v })} label="Vibración" hint="Si el dispositivo lo permite." />
        <Toggle checked={st.autoAdvance} onChange={(v) => setS({ autoAdvance: v })} label="Avanzar automáticamente" hint="Tras el descanso empieza el siguiente ejercicio del mismo bloque." />
      </section>

      <section className="card">
        <h2>Apariencia</h2>
        <div className="seg">
          {(
            [
              ['sistema', 'Sistema'],
              ['claro', '☀️ Claro'],
              ['oscuro', '🌙 Oscuro'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={st.theme === k ? 'on' : ''} aria-pressed={st.theme === k} onClick={() => setS({ theme: k })}>
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Datos</h2>
        <p className="muted tiny">Las rutinas y el progreso se guardan en este dispositivo. Haz una copia para pasarlos a otro.</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => download(`mi-coach-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json')}>
            ⬇ Exportar copia
          </button>
          <label className="btn sm">
            ⬆ Restaurar copia
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
          </label>
          <button
            className="btn sm"
            onClick={() => {
              update((s) => upsertRoutine(s, sampleRoutine()));
              setMsg('Se añadió de nuevo la rutina de ejemplo.');
            }}
          >
            Añadir rutina de ejemplo
          </button>
          <button className="btn sm ghost danger" onClick={() => setReset(true)}>
            Borrar todo
          </button>
        </div>
      </section>

      <p className="tiny muted center disclaimer">
        Mi Coach organiza y guía tus rutinas. No ofrece diagnósticos ni promete resultados físicos. Consulta con tu entrenador o un profesional de la salud ante cualquier duda.
      </p>

      {ask && (
        <Sheet title="Permitir notificaciones" onClose={() => setAsk(false)}>
          <p>Para avisarte a la hora de entrenar y para recordarte registrar la sesión, el navegador te pedirá permiso para mostrar notificaciones.</p>
          <p className="muted tiny">Solo se usan para los recordatorios que configures. Puedes desactivarlas en cualquier momento.</p>
          {notifSupported() ? (
            <button className="btn big primary" onClick={enableNotif}>
              Continuar
            </button>
          ) : (
            <p className="notice">Este navegador no admite notificaciones. Los recordatorios aparecerán dentro de la app cuando esté abierta.</p>
          )}
          <button
            className="btn ghost"
            onClick={() => {
              setAsk(false);
              setR({ trainEnabled: true });
            }}
          >
            Solo avisos dentro de la app
          </button>
        </Sheet>
      )}
      {reset && (
        <Sheet title="Borrar todos los datos" onClose={() => setReset(false)}>
          <p>Se eliminarán rutinas, calendario e historial de este dispositivo y se cargarán de nuevo las rutinas iniciales. Esta acción no se puede deshacer.</p>
          <div className="row2">
            <button
              className="btn danger"
              onClick={() => {
                replace(syncLibrary(withSeeds({ ...defaultState(), onboarded: true })));
                setReset(false);
                setMsg('Datos borrados.');
              }}
            >
              Borrar todo
            </button>
            <button className="btn ghost" onClick={() => setReset(false)}>
              Cancelar
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
