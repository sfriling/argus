export type TabKey = 'summary' | 'map' | 'board' | 'fleet' | 'agents' | 'insights' | 'review';

export type TabDef = { key: TabKey; label: string; icon: string };

export const TABS: TabDef[] = [
  { key: 'summary', label: 'Summary', icon: '◳' },
  { key: 'map', label: 'Map', icon: '◉' },
  { key: 'board', label: 'Board', icon: '▦' },
  { key: 'fleet', label: 'Fleet', icon: '⊞' },
  { key: 'agents', label: 'Agents', icon: '◆' },
  { key: 'insights', label: 'Insights', icon: '▤' },
  { key: 'review', label: 'Review', icon: '✦' },
];

export function Tabs({
  active,
  onSelect,
  tabs = TABS,
}: {
  active: TabKey;
  onSelect: (key: TabKey) => void;
  tabs?: TabDef[];
}) {
  return (
    <nav className="flex items-center gap-1" role="tablist">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.key)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: on ? '#f4f4f5' : '#71717a',
              background: on ? '#1f1f23' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!on) e.currentTarget.style.color = '#a1a1aa';
            }}
            onMouseLeave={(e) => {
              if (!on) e.currentTarget.style.color = '#71717a';
            }}
          >
            <span aria-hidden style={{ opacity: 0.8 }}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
