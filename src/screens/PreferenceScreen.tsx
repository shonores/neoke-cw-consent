import { useState } from 'react';
import { motion } from 'framer-motion';
import ScreenNav from '../components/ScreenNav';
import type { ViewName } from '../types';

const variants = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -32, transition: { duration: 0.14 } },
};

// ─── Preferences storage ─────────────────────────────────────────────────────

const STORAGE_KEY = 'neoke_travel_preferences';

type PrefKey = 'dietary' | 'cuisines' | 'accessibility' | 'seat';

interface StoredPreferences {
  dietary: string[];
  cuisines: string[];
  accessibility: string[];
  seat: string[];
}

function loadPref(key: PrefKey): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const prefs = JSON.parse(raw) as Partial<StoredPreferences>;
      return prefs[key] ?? [];
    }
  } catch { /* ignore */ }
  return [];
}

function savePref(key: PrefKey, values: string[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prefs: Partial<StoredPreferences> = raw ? JSON.parse(raw) : {};
    prefs[key] = values;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface ChipGroup {
  label?: string;
  options: string[];
}

export interface PreferenceConfig {
  title: string;
  subtitle: string;
  storageKey: PrefKey;
  groups: ChipGroup[];
}

export const PREFERENCE_CONFIGS: Record<PrefKey, PreferenceConfig> = {
  dietary: {
    title: 'Dietary requirements',
    subtitle: 'Do you have any dietary requirements? Choose as many as you like.',
    storageKey: 'dietary',
    groups: [
      {
        label: 'Special diets',
        options: ['Vegetarian', 'Pescatarian', 'Vegan', 'Dairy free', 'Gluten free', 'Halal', 'Kosher'],
      },
      {
        label: 'Allergies or intolerances',
        options: ['Peanut', 'Sesame', 'Tree nuts', 'Egg', 'Soybean', 'Seafood'],
      },
    ],
  },
  cuisines: {
    title: 'Preferred cuisines',
    subtitle: 'Is there a particular type of cuisine you favour? Choose as many as you like.',
    storageKey: 'cuisines',
    groups: [
      {
        options: [
          'Italian', 'Chinese', 'French', 'Thai', 'Japanese', 'Indian', 'Mexican',
          'Spanish', 'Greek', 'Turkish', 'Lebanese', 'Brazilian', 'Vietnamese',
          'Moroccan', 'Korean',
        ],
      },
    ],
  },
  accessibility: {
    title: 'Accessibility needs',
    subtitle: "Are there any accessibility considerations you'd like us to know about?",
    storageKey: 'accessibility',
    groups: [
      {
        options: [
          'Wheelchair dependent',
          'Service animal',
          'Visually impaired',
          'Cognitive disability',
          'Travelling with a carer',
          'Oxygen or other assistive device',
        ],
      },
    ],
  },
  seat: {
    title: 'In flight seat preferences',
    subtitle: "You can choose more than one option and we'll do our best to serve you.",
    storageKey: 'seat',
    groups: [
      {
        options: ['Window', 'Aisle', 'Extra leg room', 'Front seats'],
      },
    ],
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  prefKey: PrefKey;
  navigate: (view: ViewName) => void;
}

export default function PreferenceScreen({ prefKey, navigate }: Props) {
  const config = PREFERENCE_CONFIGS[prefKey];
  const [selected, setSelected] = useState<string[]>(() => loadPref(prefKey));

  const toggle = (option: string) => {
    setSelected(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const handleSave = () => {
    savePref(prefKey, selected);
    navigate('account');
  };

  const handleCancel = () => {
    navigate('account');
  };

  return (
    <motion.div
      variants={variants} initial="initial" animate="animate" exit="exit"
      className="flex-1 flex flex-col bg-[#F2F2F7] min-h-screen"
    >
      <ScreenNav title={config.title} onBack={handleCancel} />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-40 px-5">
        {/* Subtitle */}
        <div className="pb-6">
          <p className="text-[16px] text-[#8e8e93] leading-6">{config.subtitle}</p>
        </div>

        {/* Chip groups */}
        <div className="space-y-5">
          {config.groups.map((group, gi) => (
            <div key={gi} className="space-y-3">
              {group.label && (
                <p className="text-[16px] font-semibold text-[#1c1c1e] leading-6">{group.label}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {group.options.map(option => {
                  const isSelected = selected.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => toggle(option)}
                      className={`px-4 py-2.5 rounded-full text-[16px] font-medium leading-6 transition-colors active:scale-95 ${
                        isSelected
                          ? 'bg-[#d4d1ff] text-[#1c1c1e]'
                          : 'bg-[#f1f1f3] text-[#1c1c1e]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer buttons */}
      <div
        className="fixed bottom-0 left-0 right-0 max-w-[512px] mx-auto flex gap-3 px-5 pt-3 bg-white border-t border-[#f1f1f3]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <button
          onClick={handleCancel}
          className="flex-1 py-4 bg-[#EEF2FF] text-[#5B4FE9] text-[16px] font-medium rounded-full active:opacity-70 transition-opacity"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-4 bg-[#5B4FE9] text-white text-[16px] font-medium rounded-full active:opacity-70 transition-opacity"
        >
          Save
        </button>
      </div>
    </motion.div>
  );
}
