import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}