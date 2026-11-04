/** Estado persistente en localStorage. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, defaultState, migrate } from './model';
import { withSeeds } from './seed';

const KEY = 'mi-coach-v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return withSeeds(migrate(JSON.parse(raw)));
  } catch {
    /* almacenamiento no disponible o dañado: se parte de los datos de ejemplo */
  }
  return withSeeds(defaultState());
}

export function useAppState() {
  const [state, setRaw] = useState<AppState>(load);
  const [saveError, setSaveError] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      try {
        navigator.storage?.persist?.();
      } catch {
        /* sin soporte */
      }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setRaw((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }));
  }, []);
  const replace = useCallback((s: AppState) => setRaw(s), []);
  return { state, update, replace, saveError };
}
