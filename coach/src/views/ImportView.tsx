/** Pegar o importar instrucciones en texto y revisar la rutina resultante. */
import { useMemo, useState } from 'react';
import { BLOCK_ICON, Routine, SAMPLE_TEXT } from '../model';
import { importText } from '../importer';
import { fmtDur } from '../dates';
import { estimateSeconds, paramText } from '../sequence';

export function ImportView({ onCancel, onCreate }: { onCancel: () => void; onCreate: (r: Routine, edit: boolean) => void }) {
  const [text, setText] = useState('');
  const res = useMemo(() => (text.trim() ? importText(text) : null), [text]);

  const loadFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn ghost sm" onClick={onCancel}>
          ← Atrás
        </button>
        <b>Importar rutina</b>
        <span />
      </div>
      <section className="card">
        <p className="muted">
          Pega las instrucciones de tu entrenador. Se organizan en bloques (calentamiento, circuito, cardio, enfriamiento) y se detectan rondas, tiempos, descansos y parámetros. Lo que no se entienda quedará marcado para que lo confirmes.
        </p>
        <textarea className="mono" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. Calentamiento\n- 3 rondas.\n- Círculos de brazos: 30 segundos.\n…'} aria-label="Texto de la rutina" />
        <div className="row wrap">
          <label className="btn sm">
            📄 Abrir archivo .txt
            <input type="file" accept=".txt,text/plain" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
          <button className="btn sm ghost" onClick={() => setText(SAMPLE_TEXT)}>
            Usar texto de ejemplo
          </button>
          {text && (
            <button className="btn sm ghost" onClick={() => setText('')}>
              Borrar
            </button>
          )}
        </div>
      </section>

      {res && (
        <section className="card">
          <h2>Vista previa</h2>
          <p>
            <b>{res.routine.name}</b>
            {res.routine.place && ` · ${res.routine.place}`} · {fmtDur(estimateSeconds(res.routine))}
          </p>
          {res.warnings.map((w, i) => (
            <p key={i} className="notice warn">
              {w}
            </p>
          ))}
          {res.routine.blocks.map((b) => (
            <div key={b.id} className={`preview-block blk-${b.kind}`}>
              <h3>
                {BLOCK_ICON[b.kind]} {b.title}
              </h3>
              <p className="tiny muted">
                {b.rounds} ronda(s) · descanso entre ejercicios {b.restBetweenExercises} s · entre rondas {b.restBetweenRounds} s
              </p>
              <ul>
                {b.exercises.map((e) => (
                  <li key={e.id} className={e.review || e.params.some((p) => p.pending) ? 'flag' : ''}>
                    <b>{e.name}</b> — {e.mode === 'tiempo' ? (e.seconds ? fmtDur(e.seconds) : '¿duración?') : `${e.reps} reps`}
                    {e.params.map((p) => (
                      <span key={p.id} className={`chip ${p.pending ? 'warn' : ''}`}>
                        {p.label}: {paramText(p)}
                        {p.pending ? ' · por definir' : ''}
                      </span>
                    ))}
                    {e.review && <small className="warn-txt">⚠ {e.review}</small>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {res.unparsed.length > 0 && (
            <>
              <h4>Líneas no interpretadas</h4>
              <ul className="unparsed">
                {res.unparsed.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </>
          )}
          {res.routine.blocks.length > 0 && (
            <div className="row2">
              <button className="btn primary" onClick={() => onCreate(res.routine, true)}>
                Revisar y editar
              </button>
              <button className="btn" onClick={() => onCreate(res.routine, false)}>
                Guardar así
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
