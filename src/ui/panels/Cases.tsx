import { useRef, useState } from 'react';
import { CASES } from '../../cases/cases';
import type { ClinicalCase } from '../../cases/types';
import { evalRule, type Snapshot } from '../../cases/evaluate';

interface Props {
  active: ClinicalCase | null;
  level: 1 | 2 | 3;
  snap: Snapshot | null;
  elapsed: number;
  answers: Record<string, number | null>;
  setAnswer: (id: string, v: number) => void;
  justification: string;
  setJustification: (s: string) => void;
  onLoad: (c: ClinicalCase) => void;
  onFinish: () => void;
  onExit: () => void;
  customCases: ClinicalCase[];
  addCustom: (c: ClinicalCase) => void;
}

export function CasesPanel(p: Props) {
  const [hintsShown, setHintsShown] = useState(0);
  const [jsonMsg, setJsonMsg] = useState('');
  const [jsonOut, setJsonOut] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const c = p.active;
  const all = [...CASES, ...p.customCases];

  if (!c)
    return (
      <>
        <div className="sec">
          <h3>Casos clínicos</h3>
          <p className="small muted">El paciente responde a sus decisiones a través del motor fisiológico. Al finalizar recibirá una retroalimentación con los parámetros iniciales y finales, riesgos y alternativas válidas.</p>
        </div>
        <div className="list">
          {all.map((x) => (
            <div className="item" key={x.id}>
              <span className="ttl">{x.title}</span>
              <span className="small muted">{x.subtitle}</span>
              <div className="row">
                <button className="primary" onClick={() => { setHintsShown(0); p.onLoad(x); }}>Iniciar caso</button>
                <button onClick={() => setJsonOut(JSON.stringify(x, null, 2))}>Ver JSON</button>
              </div>
            </div>
          ))}
        </div>
        <div className="sec">
          <h4>Casos serializables (JSON)</h4>
          <div className="row">
            <button onClick={() => fileRef.current?.click()}>Importar caso desde archivo…</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const obj = JSON.parse(await f.text()) as Partial<ClinicalCase> & Pick<ClinicalCase, 'id' | 'patient' | 'initialSettings' | 'rules'>;
                  if (!obj.id || !obj.patient || !obj.initialSettings || !Array.isArray(obj.rules)) throw new Error('faltan campos (id, patient, initialSettings, rules)');
                  p.addCustom({ objectives: [], hints: [], process: [], alternatives: [], teaching: [], questions: [], refs: [], story: '', subtitle: '', title: obj.id, ...obj } as ClinicalCase);
                  setJsonMsg(`Caso «${obj.title ?? obj.id}» importado.`);
                } catch (err) {
                  setJsonMsg(`No se pudo importar: ${(err as Error).message}.`);
                }
                e.target.value = '';
              }}
            />
          </div>
          {jsonMsg && <p className="small">{jsonMsg}</p>}
          {jsonOut && (
            <>
              <textarea aria-label="JSON del caso" readOnly value={jsonOut} style={{ minHeight: 180, fontFamily: 'var(--f-num)', fontSize: 12 }} />
              <div className="row">
                <button onClick={() => navigator.clipboard?.writeText(jsonOut).then(() => setJsonMsg('JSON copiado.'), () => setJsonMsg('Seleccione el texto y cópielo manualmente.'))}>Copiar JSON</button>
                <button onClick={() => setJsonOut('')}>Cerrar</button>
              </div>
            </>
          )}
        </div>
      </>
    );

  const live = p.snap ? c.rules.map((r) => evalRule(r, p.snap!.metrics, p.snap!.settings.mode)) : [];
  return (
    <>
      <div className="sec">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{c.title}</h3>
          <button onClick={p.onExit}>Salir del caso</button>
        </div>
        <p className="small muted">{c.subtitle} · {Math.floor(p.elapsed / 60)}:{String(Math.floor(p.elapsed % 60)).padStart(2, '0')} min simulados</p>
        <p>{c.story}</p>
      </div>
      <div className="sec">
        <h4>Objetivos</h4>
        <ul className="tight small">{c.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
      </div>
      {p.level < 3 && (
        <div className="sec">
          <h4>Estado frente a los objetivos {p.level === 2 && <span className="muted small">(tras ≥ 60 s en la configuración)</span>}</h4>
          {live.map((r) => (
            <div className="check" key={r.rule.id}>
              <span className={'dot ' + (r.status === 'óptimo' ? 'ok' : r.status === 'aceptable' ? 'acc' : r.status === 'fuera' ? 'bad' : '')} />
              <span>
                {r.rule.label}: <b className="num">{r.value === null ? '—' : r.value.toFixed(r.rule.metric === 'ph' ? 2 : 1)}</b>{' '}
                <span className={'st-' + (r.status === 'n/d' ? 'nd' : r.status)}>{r.status}</span>
                {r.rule.modelOnly && <span className="badge b-model" style={{ marginLeft: 4 }}>modelo</span>}
                {p.level === 1 && r.status === 'fuera' && <span className="small muted"> — {r.rule.fix}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {p.level < 3 && c.hints.length > 0 && (
        <div className="sec">
          <h4>Pistas</h4>
          {(p.level === 1 ? c.hints : c.hints.slice(0, hintsShown)).map((h) => <div className="note" key={h}>{h}</div>)}
          {p.level === 2 && hintsShown < c.hints.length && <button onClick={() => setHintsShown((n) => n + 1)}>Mostrar una pista</button>}
        </div>
      )}
      {(p.level >= 2 || c.questions.length > 0) && (
        <div className="sec">
          <h4>{p.level === 3 ? 'Desafío experto: preguntas' : 'Preguntas de razonamiento'}</h4>
          {c.questions.map((q) => (
            <fieldset key={q.id} className="item" style={{ margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600 }}>{q.q}</legend>
              {q.options.map((o, k) => (
                <label key={o} className="small row" style={{ alignItems: 'flex-start' }}>
                  <input type="radio" name={`${c.id}-${q.id}`} checked={p.answers[q.id] === k} onChange={() => p.setAnswer(q.id, k)} /> {o}
                </label>
              ))}
            </fieldset>
          ))}
          <label className="small" htmlFor="justif">Justifique su configuración (mecanismo fisiopatológico, objetivos y riesgos):</label>
          <textarea id="justif" value={p.justification} onChange={(e) => p.setJustification(e.target.value)} />
        </div>
      )}
      <button className="primary" onClick={p.onFinish}>Finalizar y evaluar</button>
      {c.refs.length > 0 && p.level === 1 && (
        <div className="sec">
          <h4>Bibliografía del caso</h4>
          <ul className="tight small muted">{c.refs.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </>
  );
}
