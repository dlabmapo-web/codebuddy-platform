'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './overlays';

export function ChoiceField<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void; disabled?: boolean;
}) {
  const id = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-[14px] font-bold" id={`${id}-label`}>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-labelledby={`${id}-label ${id}-value`} aria-describedby={`${id}-help`} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-[14px] font-semibold text-ink outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} type="button">
            <span id={`${id}-value`}>{selected?.label}</span><ChevronDown aria-hidden className="size-4 shrink-0 text-sub" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-1.5">
          <DropdownMenuRadioGroup aria-label={label} onValueChange={(next) => { const option = options.find((item) => item.value === next); if (option) onChange(option.value); }} value={value}>
            {options.map((option) => (
              <DropdownMenuRadioItem className="items-start gap-2.5 rounded-lg p-3 focus:bg-brand-soft" key={option.value} textValue={option.label} value={option.value}>
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center">{value === option.value ? <Check aria-hidden className="size-4 text-brand" /> : null}</span>
                <span><span className="block font-semibold text-ink">{option.label}</span><span className="mt-1 block text-[12px] font-normal leading-5 text-sub">{option.description}</span></span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-[12px] leading-4 text-sub" id={`${id}-help`}>{selected?.description}</p>
    </div>
  );
}
