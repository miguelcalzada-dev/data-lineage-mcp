export interface RiskBadgeProps {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
}

const labels: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'Riesgo alto',
  MEDIUM: 'Riesgo medio',
  LOW: 'Riesgo bajo',
};

export function RiskBadge({ level }: RiskBadgeProps): JSX.Element {
  const styles = {
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300',
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[level]}`}
    >
      {labels[level]}
    </span>
  );
}
