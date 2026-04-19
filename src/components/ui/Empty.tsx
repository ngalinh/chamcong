import { type LucideIcon } from "lucide-react";

export function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="h-14 w-14 rounded-2xl bg-neutral-100 flex items-center justify-center">
        <Icon size={26} className="text-neutral-400" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-neutral-500 mt-1 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}
