import { ReactNode } from 'react';
import { fmtNum } from './dates';
import { AppState, Block, BlockKind, DayStatus, DayType, TYPE_LABEL, uid } from './model';
import { Plan } from './plan';

export const STATUS_LABEL: Record<DayStatus, string> = {
  pending: 'Pendiente', completed: 'Completado', incomplete: 'Incompleto', rescheduled: 'Reprogramado',
};

export function TypeChip({ type, short }: { type: DayType; short?: string }) {
  return (
    <span className={`chip type t-${type}`}>
      <span className="dot" />
      {short ?? TYPE_LABEL[type]}
    </span>
  );
}

export function StatusChip({ status }: { status: DayStatus }) {
  return <span className={`chip status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Sheet({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sheet ${className ?? ''}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="btn ghost iconbtn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, marker, tone }: { value: number; max: number; marker?: number; tone?: 'ok' | 'warn' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <i className={tone} style={{ width: `${pct}%` }} />
      {marker != null && max > 0 && <em style={{ left: `${Math.min(100, (marker / max) * 100)}%` }} />}
    </div>
  );
}

export function ProgressCard({ s, plan }: { s: AppState; plan: Plan }) {
  const total = s.settings.totalQuestions;
  const diff = plan.totalNew - plan.expectedByToday;
  const short = total - plan.projection;
  return (
    <div className="card">
      <h2>Progreso total · preguntas nuevas</h2>
      <div className="row between" style={{ alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 26, fontWeight: 800 }} className="num">
          {fmtNum(plan.totalNew)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>/ {fmtNum(total)}</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }} className="num">
          {plan.pct.toFixed(1).replace('.', ',')} %
        </div>
      </div>
      <Bar value={plan.totalNew} max={total} marker={plan.expectedByToday} tone={diff >= 0 ? 'ok' : undefined} />
      <div className="stats" style={{ marginTop: 10 }}>
        <div className="stat"><b>{fmtNum(plan.remaining)}</b><span>restantes</span></div>
        <div className="stat"><b>{plan.daysLeftNew}</b><span>días hasta el {s.settings.newDeadline.slice(8)}/{s.settings.newDeadline.slice(5, 7)}</span></div>
        <div className="stat"><b style={{ color: diff >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{diff >= 0 ? '+' : ''}{fmtNum(diff)}</b><span>vs. plan a hoy</span></div>
      </div>
      <p className="tiny muted" style={{ margin: '8px 0 0' }}>
        Solo cuentan las preguntas nuevas ingresadas; los repasos ({fmtNum(plan.totalReview)}) se registran aparte. La marca negra es lo planeado hasta ayer.
      </p>
      {short > 0 && (
        <div className="banner bad" style={{ marginTop: 8 }}>
          ⚠️ <span>Con las cuotas actuales llegarías a <b>{fmtNum(plan.projection)}</b>: faltan <b>{fmtNum(short)}</b>. Aumenta cuotas o define más días en Ajustes.</span>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<BlockKind, string> = { kaplan: 'Kaplan', work: 'Trabajo', gym: 'Gimnasio', other: 'Otro' };

export function BlockEditor({ blocks, onChange, conflictIds }: { blocks: Block[]; onChange: (b: Block[]) => void; conflictIds?: Set<string> }) {
  const set = (i: number, patch: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const sorted = blocks;
  return (
    <div className="stack">
      {sorted.map((b, i) => (
        <div key={b.id} className="blockedit" style={conflictIds?.has(b.id) ? { borderColor: 'var(--bad)' } : undefined}>
          <label className="field">
            <span>Tipo</span>
            <select value={b.kind} onChange={(e) => set(i, { kind: e.target.value as BlockKind })}>
              {(Object.keys(KIND_LABEL) as BlockKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Meta preguntas</span>
            <input type="text" inputMode="numeric" value={b.questions ?? ''} disabled={b.kind !== 'kaplan'} placeholder="p. ej. 20–25" onChange={(e) => set(i, { questions: e.target.value })} />
          </label>
          <label className="field full">
            <span>Nombre</span>
            <input type="text" value={b.label} onChange={(e) => set(i, { label: e.target.value })} />
          </label>
          <label className="field">
            <span>Inicio</span>
            <input type="time" value={b.start} onChange={(e) => set(i, { start: e.target.value })} />
          </label>
          <label className="field">
            <span>Fin</span>
            <input type="time" value={b.end} onChange={(e) => set(i, { end: e.target.value })} />
          </label>
          {b.kind !== 'work' && (
            <label className="full row small muted" style={{ gap: 6 }}>
              <input type="checkbox" checked={!!b.duringShift} onChange={(e) => set(i, { duringShift: e.target.checked })} />
              Durante un descanso del turno (no se cuenta como superposición con el trabajo)
            </label>
          )}
          <div className="full row between">
            <span className="tiny muted">{b.kind === 'work' ? 'Se suman los traslados al trabajo automáticamente.' : b.kind === 'gym' ? 'Incluye ida y vuelta al gimnasio.' : ''}</span>
            <button className="btn sm danger" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Eliminar</button>
          </div>
        </div>
      ))}
      <button
        className="btn"
        onClick={() => onChange([...blocks, { id: uid('b'), kind: 'kaplan', label: 'Kaplan', start: '15:00', end: '16:00', questions: '' }])}
      >
        + Añadir bloque
      </button>
    </div>
  );
}

export const Icon = {
  day: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  week: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M7 14h10" /></svg>
  ),
  month: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>
  ),
};
