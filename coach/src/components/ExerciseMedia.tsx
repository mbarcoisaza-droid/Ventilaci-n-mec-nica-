/**
 * Guía visual de un ejercicio: video de YouTube incrustado (prioridad 1) o ilustración animada (prioridad 2),
 * con instrucciones numeradas, puntos clave y errores frecuentes.
 */
import { useEffect, useRef, useState } from 'react';
import { Exercise } from '../model';
import { paramText } from '../sequence';
import { embedUrl, parseYouTubeId, parseYouTubeStart } from '../youtube';
import { Illustration } from './Illustration';

type PlayerState = 'cargando' | 'listo' | 'reproduciendo' | 'pausado' | 'terminado';

const ERRORS: Record<number, string> = {
  2: 'El enlace del video no es válido.',
  5: 'El video no se puede reproducir en este reproductor.',
  100: 'El video no existe o es privado.',
  101: 'El propietario no permite incrustar este video.',
  150: 'El propietario no permite incrustar este video.',
  152: 'El video no se puede incrustar aquí.',
  153: 'El video no se puede incrustar aquí.',
};

/** Reproductor incrustado. Nunca reproduce solo y no abre YouTube ni otras pestañas (iframe aislado sin ventanas emergentes). */
export function YouTubePlayer({ id, start = 0, onFail, title }: { id: string; start?: number; onFail: (msg: string) => void; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayerState>('cargando');
  const [captions, setCaptions] = useState(false);
  const [nonce, setNonce] = useState(0);
  const played = useRef(false);

  const send = (func: string, args: unknown[] = []) => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  };

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data.event === 'onReady') setState((s) => (s === 'cargando' ? 'listo' : s));
      if (data.event === 'onError') onFail(ERRORS[Number(data.info)] ?? 'El video no está disponible.');
      const ps =
        data.event === 'onStateChange' ? Number(data.info) : data.event === 'infoDelivery' ? (data.info as { playerState?: number })?.playerState : undefined;
      if (ps === 1) {
        played.current = true;
        setState('reproduciendo');
      } else if (ps === 2) setState('pausado');
      else if (ps === 0) setState('terminado');
      else if (ps != null && ps >= -1) setState((s) => (s === 'cargando' ? 'listo' : s));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onFail]);

  // si el reproductor no responde (sin conexión, bloqueado o no incrustable) se pasa a la ilustración
  useEffect(() => {
    if (state !== 'cargando') return;
    const t = setTimeout(() => onFail('El video no respondió.'), 12000);
    return () => clearTimeout(t);
  }, [state, nonce, onFail]);

  // saludo del protocolo de la API del reproductor para recibir eventos
  const onLoad = () => {
    let n = 0;
    const iv = setInterval(() => {
      ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      if (++n > 12) clearInterval(iv);
    }, 400);
  };

  const toggleCaptions = () => {
    const next = !captions;
    setCaptions(next);
    if (played.current) {
      // durante la reproducción se usa el módulo de subtítulos del reproductor
      send(next ? 'loadModule' : 'unloadModule', ['captions']);
      if (next) send('setOption', ['captions', 'track', { languageCode: 'es' }]);
    } else {
      setNonce((x) => x + 1); // se recarga con los subtítulos activados desde el inicio
      setState('cargando');
    }
  };

  const origin = typeof location !== 'undefined' ? location.origin : undefined;
  const playing = state === 'reproduciendo';
  return (
    <div className="yt">
      <div className="yt-frame">
        <iframe
          key={`${id}-${nonce}`}
          ref={ref}
          src={embedUrl(id, { captions, start, origin })}
          title={`Video: ${title}`}
          onLoad={onLoad}
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          loading="lazy"
        />
      </div>
      <div className="media-ctrls">
        <button type="button" className="btn sm" onClick={() => send(playing ? 'pauseVideo' : 'playVideo')}>
          {playing ? '⏸ Pausar' : '▶ Reproducir'}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            send('seekTo', [start, true]);
            send('playVideo');
          }}
        >
          ↺ Repetir
        </button>
        <button type="button" className={`btn ghost sm ${captions ? 'on' : ''}`} onClick={toggleCaptions} aria-pressed={captions}>
          CC {captions ? 'activados' : 'Subtítulos'}
        </button>
      </div>
      <p className="tiny muted">Los subtítulos aparecen solo si el video los tiene. El video no se reproduce automáticamente.</p>
    </div>
  );
}

/** Video si hay uno válido; si no, ilustración animada. */
export function ExerciseMedia({ ex, compact }: { ex: Exercise; compact?: boolean }) {
  const id = parseYouTubeId(ex.videoUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const [showIllus, setShowIllus] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    setFailed(null);
    setShowIllus(false);
  }, [ex.videoUrl]);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const canVideo = id && !failed && online;
  if (canVideo && !showIllus) {
    return (
      <div className="media">
        <YouTubePlayer id={id} start={parseYouTubeStart(ex.videoUrl)} onFail={setFailed} title={ex.name} />
        <button type="button" className="linkbtn" onClick={() => setShowIllus(true)}>
          ¿No se ve el video? Mostrar la ilustración
        </button>
      </div>
    );
  }
  const reason = ex.videoUrl && !id ? 'El enlace guardado no es un video de YouTube válido.' : failed ? failed : id && !online ? 'Sin conexión: el video no se puede cargar.' : null;
  return (
    <div className="media">
      {reason && (
        <p className="notice">
          {reason} Se muestra la ilustración.
          {failed && id && online && (
            <>
              {' '}
              <button type="button" className="linkbtn" onClick={() => setFailed(null)}>
                Intentar de nuevo el video
              </button>
            </>
          )}
        </p>
      )}
      <Illustration pose={ex.pose} compact={compact} title={ex.name} />
      {canVideo && showIllus && (
        <button type="button" className="linkbtn" onClick={() => setShowIllus(false)}>
          Volver al video
        </button>
      )}
    </div>
  );
}

/** Explicación escrita del ejercicio. */
export function ExerciseInfo({ ex, lowImpact, hideSteps }: { ex: Exercise; lowImpact?: boolean; hideSteps?: boolean }) {
  return (
    <div className="ex-info">
      {lowImpact && ex.lowImpact && (
        <p className="notice ok">
          Variante de bajo impacto: <b>{ex.lowImpact.name}</b>
          {ex.lowImpact.note ? ` · ${ex.lowImpact.note}` : ''}
        </p>
      )}
      {ex.review && <p className="notice warn">⚠ {ex.review}</p>}
      {ex.summary && <p className="summary">{ex.summary}</p>}
      {ex.params.length > 0 && (
        <ul className="params">
          {ex.params.map((p) => (
            <li key={p.id} className={p.pending ? 'pending' : ''}>
              <span>{p.label}</span>
              <b>{paramText(p) || '—'}</b>
              {p.pending && <em>{p.note || 'Pendiente de confirmar'}</em>}
            </li>
          ))}
        </ul>
      )}
      {!hideSteps && (
        <>
          <h4>Cómo se hace</h4>
          {ex.steps.length ? (
            <ol className="steps">
              {ex.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">Instrucciones pendientes: el entrenador debe describir este movimiento. Puedes añadirlas en «Editar».</p>
          )}
          {ex.keyPoints.length > 0 && (
            <>
              <h4>Puntos clave</h4>
              <ul className="bullets ok">
                {ex.keyPoints.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {ex.errors.length > 0 && (
            <>
              <h4>Errores frecuentes</h4>
              <ul className="bullets bad">
                {ex.errors.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {(ex.easier || ex.harder || ex.lowImpact) && (
        <>
          <h4>Variantes</h4>
          <ul className="variants">
            {ex.easier && (
              <li>
                <span className="tag">Más fácil</span> {ex.easier.name}
              </li>
            )}
            {ex.harder && (
              <li>
                <span className="tag">Más difícil</span> {ex.harder.name}
              </li>
            )}
            {ex.lowImpact && (
              <li>
                <span className="tag">Bajo impacto</span> {ex.lowImpact.name}
              </li>
            )}
          </ul>
          <p className="tiny muted">Las variantes son opciones para revisar con tu entrenador.</p>
        </>
      )}
      {ex.coachNotes && (
        <div className="coach-note">
          <b>Nota del entrenador</b>
          <p>{ex.coachNotes}</p>
        </div>
      )}
    </div>
  );
}
