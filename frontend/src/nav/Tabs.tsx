export type TabKey = 'summary' | 'fleet' | 'agents' | 'insights';

export type TabDef = { key: TabKey; label: string; icon: string };

export const TABS: TabDef[] = [
  { key: 'summary', label: 'Summary', icon: '◳' },
  { key: 'fleet', label: 'Fleet', icon: '⊞' },
  { key: 'agents', label: 'Agents', icon: '◆' },
  { key: 'insights', label: 'Insights', icon: '▤' },
];

export function Tabs({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <nav className="flex items-center gap-1" role="tablist">
      {TABS.map((t) => {
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
