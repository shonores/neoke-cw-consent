import { useState } from 'react';
import { motion } from 'framer-motion';
import { clearLocalCredentials } from '../store/localCredentials';
import { useAuth } from '../context/AuthContext';
import { useConsentEngine } from '../context/ConsentEngineContext';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

interface Props {
  navigate: (view: ViewName) => void;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconPerson() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="7" r="4" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconDocuments() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconSeat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 15V5a2 2 0 012-2h3" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 15h14a2 2 0 010 4H4a2 2 0 010-4z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 15V8H9a2 2 0 00-2 2v5" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 8V5" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconDining() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 1v3M10 1v3M14 1v3" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconCuisines() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2a9 9 0 100 18A9 9 0 0012 2z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 6v6l4 2" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconAccessibility() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="4" r="1.5" stroke="#5843de" strokeWidth="1.7"/>
      <path d="M6 8h12M12 8v6M9 22l3-8 3 8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconNode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M8 21h8M12 17v4" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z" stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round" fill="#5843de" fillOpacity="0.1"/>
      <path d="M9 12l2 2 4-4" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconBuildings() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 21h18M3 7v14M15 21V7M3 7h12M15 7h6v14" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 11h2M7 15h2M11 11h2M11 15h2" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconEnvelope() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#5843de" strokeWidth="1.7" strokeLinejoin="round"/>
      <polyline points="22 6 12 13 2 6" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6M16 13H8M16 17H8" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16 17 21 12 16 7" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="#5843de" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke="#aa281e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="#aa281e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="#868496" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
      <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-5 pb-1.5 px-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#868496]">{title}</p>
      {subtitle && <p className="text-[12px] text-[#868496] leading-4 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 bg-white rounded-[24px] p-1 flex flex-col gap-1">
      {children}
    </div>
  );
}

function ListItem({
  icon,
  iconBg = 'bg-[#f4f3fc]',
  label,
  labelColor = 'text-[#28272e]',
  sublabel,
  right,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  labelColor?: string;
  sublabel?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex gap-3 items-center px-4 py-3 text-left active:bg-[#f7f6f8] transition-colors rounded-[12px]"
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[16px] font-medium leading-6 ${labelColor}`}>{label}</p>
        {sublabel && <p className="text-[13px] text-[#868496] leading-5">{sublabel}</p>}
      </div>
      {right ?? <IconChevron />}
    </button>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AccountScreen({ navigate }: Props) {
  const { state, logout } = useAuth();
  const { state: ceState, removeCe, refreshHealth, autoConfigureCe } = useConsentEngine();
  const [showDisconnectSheet, setShowDisconnectSheet] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const nodeHost = (() => {
    if (state.baseUrl) {
      try { return new URL(state.baseUrl).host; } catch { /* */ }
    }
    return state.nodeIdentifier ?? '—';
  })();

  return (
    <motion.div
      variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#f7f6f8] min-h-screen"
    >
      {/* Header */}
      <div className="px-4 pt-14 pb-2">
        <h1 className="text-[28px] font-bold text-[#28272e] leading-8">Profile</h1>
      </div>

      <main className="flex-1 pb-32 overflow-y-auto">

        {/* ── General ──────────────────────────────────────────── */}
        <SectionHeader title="General" />
        <ListCard>
          <ListItem icon={<IconPerson />} label="Personal info" onClick={() => {}} />
          <ListItem icon={<IconDocuments />} label="Documents" onClick={() => navigate('dashboard')} />
        </ListCard>

        {/* ── Travel preferences ───────────────────────────────── */}
        <SectionHeader title="Travel preferences" />
        <ListCard>
          <ListItem icon={<IconSeat />} label="In flight seat preferences" onClick={() => navigate('profile_seat')} />
          <ListItem icon={<IconDining />} label="Dietary requirements" onClick={() => navigate('profile_dietary')} />
          <ListItem icon={<IconCuisines />} label="Preferred cuisines" onClick={() => navigate('profile_cuisines')} />
          <ListItem icon={<IconAccessibility />} label="Accessibility needs" onClick={() => navigate('profile_accessibility')} />
        </ListCard>

        {/* ── Consent management ───────────────────────────────── */}
        <SectionHeader
          title="Consent management"
          subtitle="Services you're connected to and have shared personal data with."
        />
        <ListCard>
          {/* Connected Node */}
          <ListItem
            icon={<IconNode />}
            label={nodeHost}
            sublabel="Connected node · Secure"
            right={
              <span className="w-2 h-2 rounded-full bg-[#198e41] flex-shrink-0" />
            }
            onClick={() => {}}
          />
          {/* Consent Engine */}
          <ListItem
            icon={<IconShield />}
            label="Consent Engine"
            sublabel={ceState.ceEnabled && ceState.isConnected ? 'Connected' : ceState.ceEnabled ? 'Not connected' : 'Not set up'}
            right={
              <div className="flex items-center gap-2">
                {ceState.ceEnabled && !ceState.isConnected && (
                  <button
                    onClick={e => { e.stopPropagation(); refreshHealth(); }}
                    className="text-[13px] font-medium text-orange-600 active:opacity-70"
                  >
                    Retry
                  </button>
                )}
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ceState.ceEnabled && ceState.isConnected ? 'bg-[#198e41]' : 'bg-orange-400'}`} />
              </div>
            }
            onClick={() => {}}
          />
          {/* CE connect button (only when not enabled) */}
          {!ceState.ceEnabled && (
            <div className="px-2 pb-1">
              <button
                onClick={autoConfigureCe}
                className="w-full py-2.5 text-[14px] font-medium text-[#5843de] bg-[#f4f3fc] rounded-[10px] active:opacity-70 transition-opacity"
              >
                Connect
              </button>
            </div>
          )}
          <ListItem icon={<IconBuildings />} label="Services" onClick={() => navigate('travel_services')} />
          <ListItem icon={<IconActivity />} label="Activity" onClick={() => navigate('audit_log')} />
        </ListCard>

        {/* ── Feedback and legal ───────────────────────────────── */}
        <SectionHeader title="Feedback and legal" />
        <ListCard>
          <ListItem
            icon={<IconEnvelope />}
            label="Give us feedback"
            right={<IconExternal />}
            onClick={() => {}}
          />
          <ListItem
            icon={<IconDoc />}
            label="Terms and Conditions"
            right={<IconExternal />}
            onClick={() => {}}
          />
          <ListItem
            icon={<IconDoc />}
            label="Privacy Statement"
            right={<IconExternal />}
            onClick={() => {}}
          />
        </ListCard>

        {/* ── Account ──────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <ListCard>
          <ListItem
            icon={<IconLogout />}
            label="Log out"
            right={null}
            onClick={logout}
          />
          <ListItem
            icon={<IconTrash />}
            iconBg="bg-[#fbeae9]"
            label="Delete account"
            labelColor="text-[#aa281e]"
            right={null}
            onClick={() => setShowDeleteSheet(true)}
          />
        </ListCard>

        {/* Version */}
        <p className="text-[14px] text-[#868496] text-center py-6">Version 0.01</p>
      </main>

      {/* ── Disconnect CE sheet ─────────────────────────────────── */}
      {showDisconnectSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowDisconnectSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-[24px] p-6 z-50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mx-auto mb-5" />
            <h3 className="text-[18px] font-bold text-[#28272e] mb-2">Disconnect Consent Engine?</h3>
            <p className="text-[14px] text-[#6d6b7e] mb-6 leading-5">
              All consent rules and queue history will remain on the Consent Engine. You can reconnect at any time.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => { removeCe(); setShowDisconnectSheet(false); }}
                className="w-full bg-[#aa281e] text-white text-[16px] font-semibold py-4 rounded-full active:opacity-80"
              >
                Disconnect
              </button>
              <button
                onClick={() => setShowDisconnectSheet(false)}
                className="w-full bg-[#f4f3fc] text-[#5843de] text-[16px] font-semibold py-4 rounded-full active:opacity-80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account sheet ─────────────────────────────────── */}
      {showDeleteSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setShowDeleteSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 bg-white rounded-t-[24px] p-6 z-50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 bg-[#d7d6dc] rounded-full mx-auto mb-5" />
            <h3 className="text-[18px] font-bold text-[#28272e] mb-2">Delete account?</h3>
            <p className="text-[14px] text-[#6d6b7e] mb-6 leading-5">
              This will clear all local credentials and sign you out. This action cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => { clearLocalCredentials(); logout(); setShowDeleteSheet(false); }}
                className="w-full bg-[#aa281e] text-white text-[16px] font-semibold py-4 rounded-full active:opacity-80"
              >
                Delete account
              </button>
              <button
                onClick={() => setShowDeleteSheet(false)}
                className="w-full bg-[#f4f3fc] text-[#5843de] text-[16px] font-semibold py-4 rounded-full active:opacity-80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
