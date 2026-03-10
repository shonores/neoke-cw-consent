import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { setCeBaseUrl, checkCeHealth, isCeConfigured } from '../api/consentEngineClient';

export const CE_SK = {
  CE_URL:      'neoke_ce_url',
  CE_ENABLED:  'neoke_ce_enabled',
  CE_APIKEY:   'neoke_ce_apikey',
  CE_DISMISSED:'neoke_ce_dismissed',
} as const;

export const DEFAULT_CE_URL = 'https://neoke-consent-engine.fly.dev';

interface ConsentEngineState {
  ceUrl: string | null;
  ceEnabled: boolean;
  ceApiKey: string | null;
  isConnected: boolean;
  pendingCount: number;
  lastChecked: number | null;
}

interface ConsentEngineContextValue {
  state: ConsentEngineState;
  configureCe: (ceUrl: string, apiKey: string) => Promise<void>;
  /** Silently configure CE with the default URL + given key — never throws. */
  autoConfigureCe: (apiKey: string) => Promise<void>;
  removeCe: () => void;
  toggleCe: (enabled: boolean) => void;
  refreshHealth: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const ConsentEngineContext = createContext<ConsentEngineContextValue | null>(null);

type CEAction =
  | { type: 'CONFIGURE'; ceUrl: string; apiKey: string }
  | { type: 'REMOVE' }
  | { type: 'TOGGLE'; enabled: boolean }
  | { type: 'SET_HEALTH'; isConnected: boolean; pendingCount: number }
  | { type: 'SET_PENDING_COUNT'; count: number }
  | { type: 'RESET' };

const defaultState: ConsentEngineState = {
  ceUrl: null,
  ceEnabled: false,
  ceApiKey: null,
  isConnected: false,
  pendingCount: 0,
  lastChecked: null,
};

function ceReducer(state: ConsentEngineState, action: CEAction): ConsentEngineState {
  switch (action.type) {
    case 'CONFIGURE':
      return { ...state, ceUrl: action.ceUrl, ceEnabled: true, ceApiKey: action.apiKey, isConnected: false };
    case 'REMOVE':
      return { ...defaultState };
    case 'TOGGLE':
      return { ...state, ceEnabled: action.enabled };
    case 'SET_HEALTH':
      return { ...state, isConnected: action.isConnected, pendingCount: action.pendingCount, lastChecked: Date.now() };
    case 'SET_PENDING_COUNT':
      return { ...state, pendingCount: action.count, lastChecked: Date.now() };
    case 'RESET':
      return { ...state, isConnected: false };
    default:
      return state;
  }
}

function initCeState(): ConsentEngineState {
  try {
    const ceUrl = localStorage.getItem(CE_SK.CE_URL);
    const ceEnabled = localStorage.getItem(CE_SK.CE_ENABLED) === 'true';
    const ceApiKey = localStorage.getItem(CE_SK.CE_APIKEY);
    if (ceUrl) {
      setCeBaseUrl(ceUrl);
      return { ceUrl, ceEnabled, ceApiKey, isConnected: false, pendingCount: 0, lastChecked: null };
    }
  } catch { /* */ }
  return defaultState;
}

export function ConsentEngineProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ceReducer, undefined, initCeState);
  const { state: authState } = useAuth();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  // Use refs for stable callbacks in effects
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshHealth = useCallback(async () => {
    if (!isCeConfigured()) return;
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy', pendingCount: health.pendingCount });
    } catch {
      dispatch({ type: 'SET_HEALTH', isConnected: false, pendingCount: 0 });
    }
  }, []);

  const refreshPendingCount = useCallback(async () => {
    if (!isCeConfigured() || !stateRef.current.ceEnabled) return;
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'SET_PENDING_COUNT', count: health.pendingCount });
    } catch { /* silent */ }
  }, []);

  // Initial health check
  useEffect(() => {
    if (!initializedRef.current && state.ceUrl && state.ceEnabled && state.ceApiKey) {
      initializedRef.current = true;
      refreshHealth();
    }
  }, [state.ceUrl, state.ceEnabled, state.ceApiKey, refreshHealth]);

  // Reset connected state on auth token loss (but keep config)
  useEffect(() => {
    if (!authState.token) {
      dispatch({ type: 'RESET' });
    }
  }, [authState.token]);

  // Background polling every 30s
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (!state.ceUrl || !state.ceEnabled || !state.ceApiKey) return;
    pollIntervalRef.current = setInterval(() => { refreshPendingCount(); }, 30_000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [state.ceUrl, state.ceEnabled, state.ceApiKey, refreshPendingCount]);

  const configureCe = useCallback(async (ceUrl: string, apiKey: string) => {
    const trimmed = ceUrl.trim().replace(/\/$/, '');
    if (!trimmed.startsWith('https://') || !trimmed.slice(8).includes('.')) {
      throw new Error('Please enter a valid https:// URL (e.g. https://consent.example.com).');
    }
    try {
      await fetch(`${trimmed}/health`, { cache: 'no-store' });
    } catch {
      throw new Error('Cannot reach the Consent Engine URL. Please check the URL and your network.');
    }
    setCeBaseUrl(trimmed);
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'CONFIGURE', ceUrl: trimmed, apiKey });
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy', pendingCount: health.pendingCount });
    } catch {
      dispatch({ type: 'CONFIGURE', ceUrl: trimmed, apiKey });
      dispatch({ type: 'SET_HEALTH', isConnected: false, pendingCount: 0 });
    }
    try {
      localStorage.setItem(CE_SK.CE_URL, trimmed);
      localStorage.setItem(CE_SK.CE_ENABLED, 'true');
      localStorage.setItem(CE_SK.CE_APIKEY, apiKey);
    } catch { /* */ }
  }, []);

  const removeCe = useCallback(() => {
    setCeBaseUrl('');
    dispatch({ type: 'REMOVE' });
    try {
      localStorage.removeItem(CE_SK.CE_URL);
      localStorage.removeItem(CE_SK.CE_ENABLED);
      localStorage.removeItem(CE_SK.CE_APIKEY);
      localStorage.removeItem(CE_SK.CE_DISMISSED);
    } catch { /* */ }
  }, []);

  const autoConfigureCe = useCallback(async (apiKey: string) => {
    if (!apiKey) return;
    const ceUrl = DEFAULT_CE_URL;
    setCeBaseUrl(ceUrl);
    dispatch({ type: 'CONFIGURE', ceUrl, apiKey });
    try {
      localStorage.setItem(CE_SK.CE_URL, ceUrl);
      localStorage.setItem(CE_SK.CE_ENABLED, 'true');
      localStorage.setItem(CE_SK.CE_APIKEY, apiKey);
    } catch { /* */ }
    // Health check after configuration
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy', pendingCount: health.pendingCount });
    } catch { /* background polling will retry */ }
  }, []);

  const toggleCe = useCallback((enabled: boolean) => {
    dispatch({ type: 'TOGGLE', enabled });
    try { localStorage.setItem(CE_SK.CE_ENABLED, String(enabled)); } catch { /* */ }
    if (enabled && stateRef.current.ceUrl) {
      setCeBaseUrl(stateRef.current.ceUrl);
      refreshHealth();
    }
  }, [refreshHealth]);

  return (
    <ConsentEngineContext.Provider value={{ state, configureCe, autoConfigureCe, removeCe, toggleCe, refreshHealth, refreshPendingCount }}>
      {children}
    </ConsentEngineContext.Provider>
  );
}

export function useConsentEngine() {
  const ctx = useContext(ConsentEngineContext);
  if (!ctx) throw new Error('useConsentEngine must be used within ConsentEngineProvider');
  return ctx;
}
