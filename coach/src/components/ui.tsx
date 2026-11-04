/** Componentes reutilizables de interfaz. */
import { ReactNode, useEffect } from 'react';
import { SessionStatus, STATUS_LABEL } from '../model';

export function Sheet({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('noscroll');
    };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sheet ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function StatusChip({ status, partial }: { status: SessionStatus; partial?: boolean }) {
  return (
    <span className={`chip st-${status}`}>
      <i />
      {STATUS_LABEL[status]}
      {partial ? ' (parcial)' : ''}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Entrada numérica con botones grandes de − y +. */
export function Stepper({ value, onChange, step = 1, min = 0, max = 99999, suffix, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; label: string }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n))));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - step)} aria-label={`Restar ${step}`}>
        −
      </button>
      <input inputMode="numeric" value={Number.isFinite(value) ? value : 0} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-label={label} />
      {suffix && <span className="suffix">{suffix}</span>}
      <button type="button" onClick={() => set(value + step)} aria-label={`Sumar ${step}`}>
        +
      </button>
    </div>
  );
}

/** Duración en minutos y segundos. */
export function DurationInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const m = Math.floor(value / 60);
  const s = value % 60;
  return (
    <div className="dur" role="group" aria-label={label}>
      <input inputMode="numeric" value={m} onChange={(e) => onChange((Number(e.target.value.replace(/\D/g, '')) || 0) * 60 + s)} aria-label={`${label}: minutos`} />
      <span>min</span>
      <input inputMode="numeric" value={s} onChange={(e) => onChange(m * 60 + Math.min(59, Number(e.target.value.replace(/\D/g, '')) || 0))} aria-label={`${label}: segundos`} />
      <span>s</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="toggle">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Lista de textos editable (instrucciones, puntos clave…). */
export function ListEditor({ items, onChange, placeholder, numbered }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; numbered?: boolean }) {
  return (
    <div className="list-editor">
      {items.map((it, i) => (
        <div className="row" key={i}>
          {numbered && <span className="num-badge">{i + 1}</span>}
          <textarea rows={2} value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${placeholder} ${i + 1}`} />
          <button type="button" className="iconbtn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...items, ''])}>
        + {placeholder}
      </button>
    </div>
  );
}
