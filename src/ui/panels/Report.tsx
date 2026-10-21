import type { Report } from '../../cases/evaluate';
import type { ClinicalCase } from '../../cases/types';

const range = (a?: number, b?: number) => (a !== undefined && b !== undefined ? `${a}–${b}` : a !== undefined ? `≥ ${a}` : b !== undefined ? `≤ ${b}` : '—');

export function ReportView({ r, c, onClose }: { r: Report; c: ClinicalCase; onClose: () => void }) {
  const fmt = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Retroalimentación del caso" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Retroalimentación · {r.title}</h2>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <div className="note">{r.verdict}</div>
        <p className="small muted">Tiempo simulado: {(r.duration / 60).toFixed(1)} min. Las variables marcadas «modelo» no se obtienen en la clínica sin presión esofágica u otra monitorización avanzada.</p>

        <div className="sec">
          <h3>Parámetros iniciales y finales</h3>
          {r.settingsChanges.length === 0 ? (
            <p className="small">No modificó la configuración inicial.</p>
          ) : (
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Parámetro</th><th>Inicial</th><th>Final</th></tr></thead>
                <tbody>{r.settingsChanges.map((x) => <tr key={x.label}><td>{x.label}</td><td className="num">{x.from}</td><td className="num">{x.to}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sec">
          <h3>Objetivos del caso</h3>
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>Objetivo</th><th>Valor final</th><th>Rango aceptable</th><th>Resultado</th><th>Fundamento</th></tr></thead>
              <tbody>
                {r.rules.map((x) => (
                  <tr key={x.rule.id}>
                    <td>{x.rule.label}{x.rule.modelOnly && <span className="badge b-model" style={{ marginLeft: 4 }}>modelo</span>}</td>
                    <td className="num">{fmt(x.value, x.rule.metric === 'ph' ? 2 : 1)}</td>
                    <td className="num">{range(x.rule.min, x.rule.max)}{(x.rule.optMin !== undefined || x.rule.optMax !== undefined) && <span className="muted"> (óptimo {range(x.rule.optMin, x.rule.optMax)})</span>}</td>
                    <td className={'st-' + (x.status === 'n/d' ? 'nd' : x.status)}>{x.status}{x.status === 'fuera' && <span className="muted small"> ({x.rule.severity})</span>}</td>
                    <td className="small">{x.rule.why}{x.status === 'fuera' && <><br /><b>Ajuste sugerido:</b> {x.rule.fix}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {r.process.length > 0 && (
          <div className="sec">
            <h3>Proceso de evaluación</h3>
            {r.process.map((x) => (
              <div className="check" key={x.rule.id}>
                <span className={'dot ' + (x.done ? 'ok' : 'bad')} />
                <span>{x.rule.label}: <b>{x.done ? 'sí' : 'no'}</b> — <span className="small muted">{x.rule.why}</span></span>
              </div>
            ))}
          </div>
        )}

        <div className="sec">
          <h3>Cambios fisiológicos</h3>
          <ul className="tight small num">{r.physiology.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>

        <div className="sec">
          <h3>Riesgos potenciales en la configuración final</h3>
          {r.risks.length ? <ul className="tight small">{r.risks.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="small">No se identifican riesgos relevantes en el modelo.</p>}
        </div>

        {r.answers.length > 0 && (
          <div className="sec">
            <h3>Preguntas</h3>
            {r.answers.map((a) => (
              <div className="item" key={a.q}>
                <span className="small" style={{ fontWeight: 600 }}>{a.q}</span>
                <span className="small">Su respuesta: {a.chosen === null ? 'sin responder' : a.options[a.chosen]} {a.chosen === a.correct ? <b className="st-óptimo">✓</b> : <b className="st-fuera">✗</b>}</span>
                {a.chosen !== a.correct && <span className="small">Respuesta esperada: {a.options[a.correct]}</span>}
                <span className="small muted">{a.explanation}</span>
              </div>
            ))}
          </div>
        )}
        {r.justification.trim() && (
          <div className="sec">
            <h3>Su justificación</h3>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.justification}</p>
            <p className="small muted">Compárela con los puntos docentes y las alternativas: el simulador no califica texto libre.</p>
          </div>
        )}

        <div className="sec">
          <h3>Alternativas válidas</h3>
          <ul className="tight small">{c.alternatives.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="sec">
          <h3>Puntos docentes</h3>
          <ul className="tight small">{c.teaching.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="sec">
          <h3>Bibliografía</h3>
          <ul className="tight small muted">{c.refs.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <p className="disclaimer">Herramienta educativa sin validación clínica formal. No utilizar para decisiones en pacientes reales.</p>
      </div>
    </div>
  );
}
