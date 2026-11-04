import { useMemo, useState } from 'react';
import { fmtShort, ISODate } from '../dates';
import { AppState, ReviewItem, uid } from '../model';
import { Sheet } from '../ui';

type Update = (fn: (s: AppState) => AppState) => void;

export default function ReviewView({ s, update, today }: { s: AppState; update: Update; today: ISODate }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<'all' | 'incorrect' | 'doubt'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [editing, setEditing] = useState<ReviewItem | null>(null);

  const topics = useMemo(() => [...new Set(s.review.map((r) => r.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [s.review]);
  const list = s.review
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .filter((r) => !topic || r.topic.toLowerCase().includes(topic.toLowerCase()))
    .filter((r) => kind === 'all' || r.kind === kind)
    .filter((r) => showResolved || !r.resolved)
    .sort((a, b) => b.date.localeCompare(a.date));
  const pending = s.review.filter((r) => !r.resolved);
  const byTopic = topics
    .map((t) => [t, pending.filter((r) => r.topic === t).length] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const save = (r: ReviewItem) => {
    update((st) => ({ ...st, review: st.review.some((x) => x.id === r.id) ? st.review.map((x) => (x.id === r.id ? r : x)) : [...st.review, r] }));
    setEditing(null);
  };

  return (
    <>
      <button className="big-complete" onClick={() => setEditing({ id: uid('r'), date: today, topic: '', kind: 'incorrect', ref: '', note: '', resolved: false })}>
        + Registrar incorrecta o dudosa
      </button>

      <div className="card">
        <h2>Pendientes de repaso</h2>
        <div className="stats">
          <div className="stat"><b>{pending.length}</b><span>pendientes</span></div>
          <div className="stat"><b style={{ color: 'var(--bad)' }}>{pending.filter((r) => r.kind === 'incorrect').length}</b><span>incorrectas</span></div>
          <div className="stat"><b style={{ color: 'var(--warn)' }}>{pending.filter((r) => r.kind === 'doubt').length}</b><span>acertadas con duda</span></div>
        </div>
        {byTopic.length > 0 && (
          <>
            <h3>Temas débiles (más pendientes)</h3>
            <div className="row wrap">
              {byTopic.slice(0, 10).map(([t, n]) => (
                <button key={t} className="btn sm" onClick={() => setTopic(t)}>{t} · {n}</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Filtros</h2>
        <div className="grid2">
          <label className="field"><span>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="field">
            <span>Tema</span>
            <input type="text" list="topics" value={topic} placeholder="Todos" onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="all">Todas</option>
              <option value="incorrect">Incorrectas</option>
              <option value="doubt">Con duda</option>
            </select>
          </label>
        </div>
        <datalist id="topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="row between" style={{ marginTop: 8 }}>
          <label className="row small"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Mostrar repasadas</label>
          <button className="btn sm" onClick={() => { setFrom(''); setTo(''); setTopic(''); setKind('all'); }}>Limpiar</button>
        </div>
      </div>

      <div className="card">
        <h2>{list.length} pregunta{list.length === 1 ? '' : 's'}</h2>
        {list.length === 0 && <p className="small muted">No hay preguntas con estos filtros. Registra aquí las incorrectas y las acertadas con duda para repasarlas del 15 al 20 de febrero.</p>}
        {list.map((r) => (
          <div key={r.id} className={`rv ${r.resolved ? 'resolved' : ''}`}>
            <input
              type="checkbox"
              checked={r.resolved}
              aria-label="Repasada"
              onChange={(e) => update((st) => ({ ...st, review: st.review.map((x) => (x.id === r.id ? { ...x, resolved: e.target.checked } : x)) }))}
            />
            <div className="grow" onClick={() => setEditing(r)} style={{ cursor: 'pointer' }}>
              <div className="row wrap" style={{ gap: 6 }}>
                <b>{r.topic || 'Sin tema'}</b>
                <span className={`chip kind-${r.kind}`}>{r.kind === 'incorrect' ? 'Incorrecta' : 'Con duda'}</span>
              </div>
              <div className="tiny muted">{fmtShort(r.date)}{r.ref && ` · #${r.ref}`}</div>
              {r.note && <div className="small" style={{ marginTop: 2 }}>{r.note}</div>}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ReviewSheet
          item={editing}
          topics={topics}
          onSave={save}
          onDelete={() => { update((st) => ({ ...st, review: st.review.filter((x) => x.id !== editing.id) })); setEditing(null); }}
          onClose={() => setEditing(null)}
          isNew={!s.review.some((x) => x.id === editing.id)}
        />
      )}
    </>
  );
}

function ReviewSheet({ item, topics, onSave, onDelete, onClose, isNew }: { item: ReviewItem; topics: string[]; onSave: (r: ReviewItem) => void; onDelete: () => void; onClose: () => void; isNew: boolean }) {
  const [r, setR] = useState(item);
  const set = (p: Partial<ReviewItem>) => setR((x) => ({ ...x, ...p }));
  return (
    <Sheet title={isNew ? 'Nueva pregunta para repasar' : 'Editar pregunta'} onClose={onClose}>
      <div className="seg">
        <button className={r.kind === 'incorrect' ? 'on' : ''} onClick={() => set({ kind: 'incorrect' })}>Incorrecta</button>
        <button className={r.kind === 'doubt' ? 'on' : ''} onClick={() => set({ kind: 'doubt' })}>Acertada con duda</button>
      </div>
      <div className="grid2">
        <label className="field"><span>Fecha</span><input type="date" value={r.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span>Nº / ID Kaplan</span><input type="text" value={r.ref} onChange={(e) => set({ ref: e.target.value })} /></label>
      </div>
      <label className="field">
        <span>Tema</span>
        <input type="text" list="topics-sheet" value={r.topic} placeholder="p. ej. Cardiología" onChange={(e) => set({ topic: e.target.value })} />
        <datalist id="topics-sheet">{topics.map((t) => <option key={t} value={t} />)}</datalist>
      </label>
      <label className="field"><span>Nota / concepto clave</span><textarea value={r.note} onChange={(e) => set({ note: e.target.value })} /></label>
      <label className="row small"><input type="checkbox" checked={r.resolved} onChange={(e) => set({ resolved: e.target.checked })} /> Ya repasada</label>
      <button className="btn primary" onClick={() => onSave({ ...r, topic: r.topic.trim() })}>Guardar</button>
      {!isNew && <button className="btn danger" onClick={onDelete}>Eliminar</button>}
    </Sheet>
  );
}
