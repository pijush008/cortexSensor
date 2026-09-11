import { cn } from "@/lib/utils";

export interface Field {
  label: string;
  value: React.ReactNode;
  /** Renders the value in the mono face — for IDs, keys and versions. */
  mono?: boolean;
  /** Lets one field span the full width, for addresses and descriptions. */
  wide?: boolean;
}

/**
 * The label/value block every detail page opens with.
 *
 * Shared so the detail pages read the same way: a record's fields are the first
 * thing anyone wants after clicking a row, and four pages inventing four
 * layouts for the same job makes the console feel assembled rather than
 * designed.
 *
 * An empty value renders as an em dash rather than blank. A missing field and a
 * field the page forgot look identical when both are empty, and "—" says the
 * record genuinely has nothing there.
 */
export function FieldGrid({
  fields,
  className,
}: {
  fields: Field[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {fields.map((f) => (
        <div key={f.label} className={cn(f.wide && "sm:col-span-2 lg:col-span-3")}>
          <dt className="text-[0.75rem] font-medium text-slate-500">
            {f.label}
          </dt>
          <dd
            className={cn(
              "mt-1 break-words text-sm text-slate-800",
              f.mono && "font-mono text-[0.78125rem]",
            )}
          >
            {f.value === null || f.value === undefined || f.value === "" ? (
              <span className="text-slate-400">—</span>
            ) : (
              f.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
