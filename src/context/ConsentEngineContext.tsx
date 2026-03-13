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
import { setCeBaseUrl, checkCeHealth, isCeConfigured, connectNode } from '../api/consentEngineClient';

export const CE_SK = {
  CE_URL: 'neoke_ce_url',
  CE_ENABLED: 'neoke_ce_enabled',
  CE_APIKEY: 'neoke_ce_apikey',
  CE_DISMISSED: 'neoke_ce_dismissed',
} as const;

export const DEFAULT_CE_URL    = 'https://neoke-consent-engine.fly.dev';
export const DEFAULT_CE_APIKEY = '970fa93a67239497ece6aaa15b235d1a2d682588863983b618ff9717cec0b4e7';

interface ConsentEngineState {
  ceUrl: string | null;
  ceEnabled: boolean;
  ceApiKey: string | null;
  isConnected: boolean;
  pendingCount: number;
  lastChecked: number | null;
  /** Increments on each audit.event.created SSE push so AuditLogScreen can react. */
  sseAuditCount: number;
  /** Increments on each queue.item.created/resolved SSE push so ConsentQueueScreen can react immediately. */
  sseQueueCount: number;
}

interface ConsentEngineContextValue {
  state: ConsentEngineState;
  configureCe: (ceUrl: string, apiKey: string) => Promise<void>;
  /** Silently configure CE with the default URL and hardcoded CE API key — never throws. */
  autoConfigureCe: () => Promise<void>;
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
  | { type: 'SSE_AUDIT' }
  | { type: 'SSE_QUEUE' }
  | { type: 'RESET' };

const defaultState: ConsentEngineState = {
  ceUrl: null,
  ceEnabled: false,
  ceApiKey: null,
  isConnected: false,
  pendingCount: 0,
  lastChecked: null,
  sseAuditCount: 0,
  sseQueueCount: 0,
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
    case 'SSE_AUDIT':
      return { ...state, sseAuditCount: state.sseAuditCount + 1 };
    case 'SSE_QUEUE':
      return { ...state, sseQueueCount: state.sseQueueCount + 1 };
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
    if (ceUrl) {
      setCeBaseUrl(ceUrl);
      // Always use the hardcoded CE API key — localStorage may have an old value
      localStorage.setItem(CE_SK.CE_APIKEY, DEFAULT_CE_APIKEY);
      return { ceUrl, ceEnabled, ceApiKey: DEFAULT_CE_APIKEY, isConnected: false, pendingCount: 0, lastChecked: null, sseAuditCount: 0, sseQueueCount: 0 };
    }
  } catch { /* */ }
  return defaultState;
}

export function ConsentEngineProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ceReducer, undefined, initCeState);
  const { state: authState } = useAuth();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  // B7: track last registered (ceUrl, nodeId) to prevent duplicate connectNode calls
  const lastRegisteredRef = useRef('');

  // Use refs for stable callbacks in effects
  const stateRef = useRef(state);
  stateRef.current = state;
  const authStateRef = useRef(authState);
  authStateRef.current = authState;

  const refreshHealth = useCallback(async () => {
    if (!isCeConfigured()) return;
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy' || health.status === 'ok', pendingCount: health.pendingCount });
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

  // Ensure node is registered with CE whenever we have both CE and Auth configured.
  // B7: guard with a ref so the registration only fires once per (ceUrl, nodeId) pair,
  // even if other dependencies change and re-run this effect.
  useEffect(() => {
    if (!state.ceUrl || !state.ceEnabled || !state.ceApiKey || !authState.nodeIdentifier || !authState.baseUrl) return;
    const key = `${state.ceUrl}::${authState.nodeIdentifier}`;
    if (lastRegisteredRef.current === key) return;
    lastRegisteredRef.current = key;
    const cleanNodeUrl = authState.baseUrl.replace(/\/:$/, '');
    const nodeApiKey = localStorage.getItem('neoke_node_apikey') ?? '';
    connectNode(state.ceApiKey, authState.nodeIdentifier, cleanNodeUrl, nodeApiKey)
      .then(() => refreshHealth())
      .catch(() => { /* silent — health poll will surface the issue */ });
  }, [state.ceUrl, state.ceEnabled, state.ceApiKey, authState.nodeIdentifier, authState.baseUrl, refreshHealth]);

  // Reset connected state on auth token loss (but keep config)
  useEffect(() => {
    if (!authState.token) {
      dispatch({ type: 'RESET' });
    }
  }, [authState.token]);

  // SSE connection for real-time push — EventSource doesn't support custom headers,
  // so we use fetch + ReadableStream to parse the SSE stream manually.
  useEffect(() => {
    const { ceUrl, ceEnabled, ceApiKey } = state;
    const nodeId = authState.nodeIdentifier;
    if (!ceUrl || !ceEnabled || !ceApiKey || !nodeId) return;

    sseAbortRef.current?.abort();
    const controller = new AbortController();
    sseAbortRef.current = controller;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    // Updated from SSE `retry:` field; default 30s to match CE's guidance
    let retryDelay = 30_000;
    const HEARTBEAT_DEADLINE_MS = 90_000; // 3 missed heartbeats

    const clearHeartbeat = () => {
      if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
    };

    const connect = async () => {
      let shouldReconnect = true;
      try {
        const response = await fetch(`${ceUrl}/sse/${encodeURIComponent(nodeId)}`, {
          headers: { Authorization: `ApiKey ${ceApiKey}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventType = 'message';

        // Start heartbeat deadline — reset on each heartbeat event
        const resetHeartbeat = () => {
          clearHeartbeat();
          heartbeatTimer = setTimeout(() => { reader.cancel(); }, HEARTBEAT_DEADLINE_MS);
        };
        resetHeartbeat();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('retry: ')) {
              const ms = parseInt(line.slice(7).trim(), 10);
              if (!isNaN(ms)) retryDelay = ms;
            } else if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              if (eventType === 'heartbeat') {
                resetHeartbeat();
              } else if (eventType === 'auth.error') {
                clearHeartbeat();
                dispatch({ type: 'RESET' });
                // Re-register node with CE so the next reconnect will succeed
                const { ceApiKey: key } = stateRef.current;
                const { nodeIdentifier, baseUrl } = authStateRef.current;
                if (key && nodeIdentifier && baseUrl) {
                  const cleanUrl = baseUrl.replace(/\/:$/, '');
                  const nodeApiKey = localStorage.getItem('neoke_node_apikey') ?? '';
                  lastRegisteredRef.current = ''; // allow re-registration on next attempt
                  connectNode(key, nodeIdentifier, cleanUrl, nodeApiKey)
                    .then(() => refreshHealth())
                    .catch(() => {});
                }
                shouldReconnect = true; // reconnect after re-registration
                break;
              } else if (eventType === 'queue.item.created' || eventType === 'queue.item.resolved') {
                dispatch({ type: 'SSE_QUEUE' });
                refreshPendingCount();
              } else if (eventType === 'audit.event.created') {
                dispatch({ type: 'SSE_AUDIT' });
              }
              eventType = 'message';
            } else if (line === '') {
              eventType = 'message';
            }
          }
        }
      } catch {
        /* fall through to reconnect */
      } finally {
        clearHeartbeat();
      }
      if (!controller.signal.aborted && shouldReconnect) {
        reconnectTimer = setTimeout(connect, retryDelay);
      }
    };

    connect();
    return () => {
      controller.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
    };
  }, [state.ceUrl, state.ceEnabled, state.ceApiKey, authState.nodeIdentifier, refreshPendingCount, refreshHealth]);

  // Fallback polling every 30s (in case SSE drops silently)
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
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy' || health.status === 'ok', pendingCount: health.pendingCount });
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

  const autoConfigureCe = useCallback(async () => {
    const ceUrl = DEFAULT_CE_URL;
    const ceApiKey = DEFAULT_CE_APIKEY;
    setCeBaseUrl(ceUrl);
    dispatch({ type: 'CONFIGURE', ceUrl, apiKey: ceApiKey });
    try {
      localStorage.setItem(CE_SK.CE_URL, ceUrl);
      localStorage.setItem(CE_SK.CE_ENABLED, 'true');
      localStorage.setItem(CE_SK.CE_APIKEY, ceApiKey);
    } catch { /* */ }
    // Health check after configuration
    try {
      const health = await checkCeHealth();
      dispatch({ type: 'SET_HEALTH', isConnected: health.status === 'healthy' || health.status === 'ok', pendingCount: health.pendingCount });
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
