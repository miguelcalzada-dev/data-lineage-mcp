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
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[level]}`}
    >
      {labels[level]}
    </span>
  );
}
