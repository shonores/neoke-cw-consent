import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConsentEngineProvider, useConsentEngine } from './context/ConsentEngineContext';
import DashboardScreen from './screens/DashboardScreen';
import CredentialDetailScreen from './screens/CredentialDetailScreen';
import ReceiveScreen from './screens/ReceiveScreen';
import PresentScreen from './screens/PresentScreen';
import AccountScreen from './screens/AccountScreen';
import OnboardingStep1Screen from './screens/OnboardingStep1Screen';
import OnboardingStep2Screen from './screens/OnboardingStep2Screen';
import ConsentRulesScreen from './screens/ConsentRulesScreen';
import ConsentRuleEditorScreen from './screens/ConsentRuleEditorScreen';
import ConsentQueueScreen from './screens/ConsentQueueScreen';
import ConsentQueueDetailScreen from './screens/ConsentQueueDetailScreen';
import AuditLogScreen from './screens/AuditLogScreen';
import TravelServicesScreen from './screens/TravelServicesScreen';
import TravelServiceDetailScreen from './screens/TravelServiceDetailScreen';
import PreferenceScreen from './screens/PreferenceScreen';
import ReAuthModal from './components/ReAuthModal';
import CeIntakeOverlay from './components/CeIntakeOverlay';
import { detectUriType } from './utils/uriRouter';
import type { ViewName, Credential } from './types';

// ============================================================
// Bottom tab bar
// ============================================================
function TabBar({
  currentView,
  onNavigate,
  ceEnabled,
  pendingCount,
  ceDisconnected,
}: {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
  ceEnabled: boolean;
  pendingCount: number;
  ceDisconnected: boolean;
}) {
  const homeActive = currentView === 'dashboard';
  const scanActive = currentView === 'receive' || currentView === 'present';
  const accountActive = currentView === 'account';
  const consentActive = ['consent_rules', 'consent_queue', 'consent_queue_detail', 'audit_log', 'consent_rule_editor'].includes(currentView);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/90 backdrop-blur-xl border-t border-black/5 flex z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Home */}
      <button
        className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-3 transition-colors ${homeActive ? 'text-[#5843de]' : 'text-[#868496]'}`}
        onClick={() => onNavigate('dashboard')}
        aria-label="Home"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            fill={homeActive ? 'currentColor' : 'none'}
            fillOpacity={homeActive ? 0.12 : 0}
          />
          <path d="M9 21V13h6v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span className="text-[10px] font-medium">Home</span>
      </button>

      {/* Scan QR Code */}
      <button
        className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-3 transition-colors ${scanActive ? 'text-[#5843de]' : 'text-[#868496]'}`}
        onClick={() => onNavigate('receive')}
        aria-label="Scan QR Code"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.7" fill={scanActive ? 'currentColor' : 'none'} fillOpacity={scanActive ? 0.12 : 0} />
          <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.7" fill={scanActive ? 'currentColor' : 'none'} fillOpacity={scanActive ? 0.12 : 0} />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.7" fill={scanActive ? 'currentColor' : 'none'} fillOpacity={scanActive ? 0.12 : 0} />
          <rect x="13" y="13" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
          <rect x="17.5" y="13" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
          <rect x="13" y="17.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
          <rect x="17.5" y="17.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
        </svg>
        <span className="text-[10px] font-medium">Scan QR Code</span>
      </button>

      {/* Inbox (consent queue) */}
      {ceEnabled && (
        <button
          className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-3 transition-colors relative ${consentActive ? 'text-[#5843de]' : 'text-[#868496]'}`}
          onClick={() => onNavigate('consent_queue')}
          aria-label="Inbox"
        >
          <div className="relative">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M2 12h4l2 3h8l2-3h4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={consentActive ? 'currentColor' : 'none'}
                fillOpacity={consentActive ? 0.08 : 0}
              />
            </svg>
            {pendingCount > 0 ? (
              <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            ) : ceDisconnected ? (
              <span className="absolute -top-0.5 -right-0.5 w-[9px] h-[9px] bg-amber-400 rounded-full border-2 border-white" />
            ) : null}
          </div>
          <span className="text-[10px] font-medium">Inbox</span>
        </button>
      )}

      {/* Profile */}
      <button
        className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-3 transition-colors ${accountActive ? 'text-[#5843de]' : 'text-[#868496]'}`}
        onClick={() => onNavigate('account')}
        aria-label="Profile"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle
            cx="8" cy="8" r="3.5"
            stroke="currentColor"
            strokeWidth="1.7"
            fill={accountActive ? 'currentColor' : 'none'}
            fillOpacity={accountActive ? 0.12 : 0}
          />
          <path
            d="M2 20c0-3.31 2.69-6 6-6s6 2.69 6 6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path d="M16 6h6M16 10h4M16 14h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
        <span className="text-[10px] font-medium">Profile</span>
      </button>
    </div>
  );
}

// ============================================================
// Inner app (needs auth context)
// ============================================================
function AppInner() {
  const { state, setNode, setToken } = useAuth();
  const { state: ceState, autoConfigureCe, refreshPendingCount } = useConsentEngine();
  const { ceEnabled, ceApiKey } = ceState;

  // Onboarding step (used when not authenticated)
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [pendingNodeId, setPendingNodeId] = useState('');
  const [pendingBaseUrl, setPendingBaseUrl] = useState('');

  // Read saved node from localStorage to pre-fill step 1
  const [savedNodeId] = useState<string>(() => {
    try { return localStorage.getItem('neoke_node_id') ?? ''; } catch { return ''; }
  });

  // ── Deep-link detection ──────────────────────────────────────────────────
  // B5: use URLSearchParams exclusively — the manual indexOf approach mishandled encoded URIs
  const [deepLinkUri] = useState<string | null>(() => {
    if (!window.location.search) return null;
    const p = new URLSearchParams(window.location.search);
    for (const key of ['uri', 'offer_uri']) {
      const val = p.get(key);
      if (val && detectUriType(val) !== 'unknown') return val;
    }
    return null;
  });
  const deepLinkType = deepLinkUri ? detectUriType(deepLinkUri) : null;
  const deepLinkConsumed = useRef(false);

  // Authenticated navigation state
  const [currentView, setCurrentView] = useState<ViewName>('dashboard');
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [pendingUri, setPendingUri] = useState<string | undefined>();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [selectedServiceDid, setSelectedServiceDid] = useState<string | null>(null);
  const [ceProcessingUri, setCeProcessingUri] = useState<string | null>(null);
  // URI that was CE-bypassed manually — should NOT be re-routed to CE intake
  const [ceBypassedUri, setCeBypassedUri] = useState<string | null>(null);

  // Parse URL hash to restore view on load
  const parseHash = (): { view: ViewName; serviceDid?: string; queueItemId?: string; ruleId?: string } => {
    const hash = window.location.hash.slice(1); // remove #
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs ?? '');
    const did = params.get('did');
    const id = params.get('id');

    switch (path) {
      case 'account': return { view: 'account' };
      case 'activity': return { view: 'audit_log' };
      case 'inbox': return id ? { view: 'consent_queue_detail', queueItemId: id } : { view: 'consent_queue' };
      case 'rules': return id !== null ? { view: 'consent_rule_editor', ruleId: id || undefined } : { view: 'consent_rules' };
      case 'travel': return did ? { view: 'travel_service_detail', serviceDid: did } : { view: 'travel_services' };
      case 'scan': return { view: 'receive' };
      case 'home':
      default: return { view: 'dashboard' };
    }
  };

  const navigate = (
    view: ViewName,
    extra?: {
      selectedCredential?: Credential;
      pendingUri?: string;
      editingRuleId?: string | null;
      selectedQueueItemId?: string | null;
      selectedServiceDid?: string | null;
    }
  ) => {
    setSelectedCredential(extra?.selectedCredential ?? null);
    setPendingUri(extra?.pendingUri);
    if (extra && 'editingRuleId' in extra) setEditingRuleId(extra.editingRuleId ?? null);
    if (extra && 'selectedQueueItemId' in extra) setSelectedQueueItemId(extra.selectedQueueItemId ?? null);
    if (extra && 'selectedServiceDid' in extra) setSelectedServiceDid(extra.selectedServiceDid ?? null);
    setCurrentView(view);

    // Update URL hash
    const updateHash = (v: ViewName, e?: { editingRuleId?: string | null; selectedQueueItemId?: string | null; selectedServiceDid?: string | null }) => {
      let hash = '';
      switch (v) {
        case 'account': hash = '#account'; break;
        case 'audit_log': hash = '#activity'; break;
        case 'consent_queue': hash = '#inbox'; break;
        case 'consent_queue_detail': hash = `#inbox?id=${e?.selectedQueueItemId ?? ''}`; break;
        case 'consent_rules': hash = '#rules'; break;
        case 'consent_rule_editor': hash = `#rules?id=${e?.editingRuleId ?? ''}`; break;
        case 'travel_services': hash = '#travel'; break;
        case 'travel_service_detail': hash = `#travel?did=${encodeURIComponent(e?.selectedServiceDid ?? '')}`; break;
        case 'receive': hash = '#scan'; break;
        case 'present': hash = '#present'; break;
        case 'detail': hash = '#credential'; break;
        case 'profile_dietary': hash = '#profile?pref=dietary'; break;
        case 'profile_cuisines': hash = '#profile?pref=cuisines'; break;
        case 'profile_accessibility': hash = '#profile?pref=accessibility'; break;
        case 'profile_seat': hash = '#profile?pref=seat'; break;
        default: hash = '#home'; break;
      }
      window.history.pushState(null, '', hash);
    };
    updateHash(view, extra);
  };

  // Auto-configure CE silently whenever a token is set and CE isn't yet configured
  useEffect(() => {
    if (!state.token || ceState.ceUrl) return;
    autoConfigureCe();
  }, [state.token, ceState.ceUrl, autoConfigureCe]);

  // Reset state on login/logout; consume deep-link if present
  useEffect(() => {
    if (state.token) {
      if (deepLinkUri && !deepLinkConsumed.current && deepLinkType !== 'unknown') {
        deepLinkConsumed.current = true;
        window.history.replaceState({}, '', window.location.pathname);

        // Issuance (credential offer) always goes directly to wallet — CE not involved
        if (ceEnabled && ceApiKey && deepLinkType !== 'receive') {
          navigate('dashboard');
          setCeProcessingUri(deepLinkUri);
          return;
        }

        if (deepLinkType === 'receive') {
          navigate('receive', { pendingUri: deepLinkUri });
        } else {
          navigate('present', { pendingUri: deepLinkUri });
        }
        return;
      }

      setCurrentView('dashboard');
    } else {
      setOnboardingStep(1);
    }
  }, [state.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh pending count when returning to consent views
  useEffect(() => {
    if (['consent_queue', 'consent_rules', 'audit_log'].includes(currentView)) {
      refreshPendingCount();
    }
  }, [currentView, refreshPendingCount]);

  // Restore view from URL hash on initial mount
  useEffect(() => {
    if (!state.token) return;
    const parsed = parseHash();
    if (parsed.view !== 'dashboard') {
      navigate(parsed.view, {
        selectedServiceDid: parsed.serviceDid,
        selectedQueueItemId: parsed.queueItemId,
        editingRuleId: parsed.ruleId,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session expired → re-auth sheet ─────────────────────────────────────
  if (state.sessionExpired) {
    return (
      <div className="w-full max-w-lg mx-auto min-h-screen bg-[#f7f6f8]">
        <ReAuthModal />
      </div>
    );
  }

  // ── Not authenticated → onboarding ───────────────────────────────────────
  if (!state.token) {
    if (onboardingStep === 2) {
      return (
        <div className="w-full max-w-lg mx-auto">
          <OnboardingStep2Screen
            nodeIdentifier={pendingNodeId}
            nodeBaseUrl={pendingBaseUrl}
            onBack={() => setOnboardingStep(1)}
            onSuccess={(token, expiresAt) => {
              setNode(pendingNodeId, pendingBaseUrl);
              setToken(token, expiresAt);
            }}
          />
        </div>
      );
    }
    return (
      <div className="w-full max-w-lg mx-auto">
        <OnboardingStep1Screen
          savedNodeId={savedNodeId}
          pendingAction={
            deepLinkType === 'receive' ? 'receive'
              : deepLinkType === 'present' ? 'present'
                : null
          }
          onContinue={(nodeId, baseUrl) => {
            setPendingNodeId(nodeId);
            setPendingBaseUrl(baseUrl);
            setOnboardingStep(2);
          }}
        />
      </div>
    );
  }

  // ── Authenticated — main wallet ──────────────────────────────────────────
  const showTabBar = ['dashboard', 'account', 'consent_rules', 'consent_queue', 'audit_log', 'travel_services', 'receive'].includes(currentView);

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f6f8] w-full max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        {currentView === 'dashboard' && (
          <DashboardScreen
            key={state.loginNonce}
            navigate={navigate}
            refreshSignal={refreshSignal}
          />
        )}

        {currentView === 'detail' && selectedCredential && (
          <CredentialDetailScreen
            key="detail"
            credential={selectedCredential}
            onBack={() => navigate('dashboard')}
            onCredentialDeleted={() => {
              setRefreshSignal((s) => s + 1);
              navigate('dashboard');
            }}
          />
        )}

        {currentView === 'receive' && (
          <ReceiveScreen
            key="receive"
            navigate={navigate}
            onCredentialReceived={() => setRefreshSignal((s) => s + 1)}
            initialUri={pendingUri}
            onRouteToCe={undefined}
          />
        )}

        {currentView === 'present' && (
          <PresentScreen
            key="present"
            navigate={navigate}
            initialUri={pendingUri}
            onPresented={() => setRefreshSignal((s) => s + 1)}
            onRouteToCe={ceEnabled && ceApiKey && pendingUri !== ceBypassedUri ? (uri) => {
              setCeProcessingUri(uri);
              navigate('dashboard');
            } : undefined}
          />
        )}

        {currentView === 'account' && (
          <AccountScreen
            key="account"
            navigate={navigate}
          />
        )}

        {currentView === 'consent_rules' && (
          <ConsentRulesScreen key="consent_rules" navigate={navigate} />
        )}

        {currentView === 'consent_rule_editor' && (
          <ConsentRuleEditorScreen key="consent_rule_editor" navigate={navigate} editingRuleId={editingRuleId} />
        )}

        {currentView === 'consent_queue' && (
          <ConsentQueueScreen key="consent_queue" navigate={navigate} />
        )}

        {currentView === 'consent_queue_detail' && selectedQueueItemId && (
          <ConsentQueueDetailScreen key="consent_queue_detail" navigate={navigate} queueItemId={selectedQueueItemId} />
        )}

        {currentView === 'audit_log' && (
          <AuditLogScreen key="audit_log" navigate={navigate} />
        )}

        {currentView === 'travel_services' && (
          <TravelServicesScreen key="travel_services" navigate={navigate} />
        )}

        {currentView === 'travel_service_detail' && selectedServiceDid && (
          <TravelServiceDetailScreen key="travel_service_detail" navigate={navigate} verifierDid={selectedServiceDid} />
        )}

        {currentView === 'profile_dietary' && (
          <PreferenceScreen key="profile_dietary" prefKey="dietary" navigate={navigate} />
        )}
        {currentView === 'profile_cuisines' && (
          <PreferenceScreen key="profile_cuisines" prefKey="cuisines" navigate={navigate} />
        )}
        {currentView === 'profile_accessibility' && (
          <PreferenceScreen key="profile_accessibility" prefKey="accessibility" navigate={navigate} />
        )}
        {currentView === 'profile_seat' && (
          <PreferenceScreen key="profile_seat" prefKey="seat" navigate={navigate} />
        )}
      </AnimatePresence>

      {/* CE Intake Overlay */}
      <AnimatePresence>
        {ceProcessingUri && (
          <CeIntakeOverlay
            rawLink={ceProcessingUri}
            apiKey={ceApiKey ?? ''}
            onDismiss={() => setCeProcessingUri(null)}
            onFallback={(uri, type) => {
              setCeBypassedUri(uri);  // prevent re-routing this URI to CE overlay
              setCeProcessingUri(null);
              navigate(type === 'receive' ? 'receive' : 'present', { pendingUri: uri });
            }}
            onReviewQueue={(itemId) => {
              setCeProcessingUri(null);
              navigate('consent_queue_detail', { selectedQueueItemId: itemId });
            }}
            onViewAudit={() => {
              setCeProcessingUri(null);
              navigate('audit_log');
            }}
          />
        )}
      </AnimatePresence>

      {showTabBar && (
        <TabBar
          currentView={currentView}
          onNavigate={navigate}
          ceEnabled={ceEnabled}
          pendingCount={ceState.pendingCount}
          ceDisconnected={ceEnabled && !ceState.isConnected}
        />
      )}
    </div>
  );
}

// ============================================================
// Root app with providers
// ============================================================
export default function App() {
  return (
    <AuthProvider>
      <ConsentEngineProvider>
        <AppInner />
      </ConsentEngineProvider>
    </AuthProvider>
  );
}
