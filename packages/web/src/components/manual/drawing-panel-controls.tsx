'use client';

import { Check, PanelBottom, PanelRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/studio/button';
import { Tooltip, TooltipProvider } from '@/components/studio/primitives';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/studio/overlays';
import { useManualTranslation } from './use-manual-translation';

export function DrawingIconButton({ label, children, portalContainer, ...props }: ComponentProps<typeof Button> & {
  label: string; children: ReactNode; portalContainer?: HTMLElement | null;
}) {
  return <TooltipProvider delayDuration={300}>
    <Tooltip content={label} side="top" portalContainer={portalContainer}>
      <Button type="button" variant="ghost" size="icon" aria-label={label} {...props}>
        {children}<span className="sr-only">{label}</span>
      </Button>
    </Tooltip>
  </TooltipProvider>;
}

export function DrawingLayoutControl({ value, onChange, portalContainer }: {
  value: string; onChange: (value: string) => void; portalContainer?: HTMLElement | null;
}) {
  const { t } = useManualTranslation();
  const Icon = value === 'right' ? PanelRight : PanelBottom;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <DrawingIconButton label={t('drawing_layout')} portalContainer={portalContainer} className="hidden data-[state=open]:bg-accent md:inline-flex"><Icon aria-hidden /></DrawingIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" portalContainer={portalContainer} className="min-w-48">
      <DropdownMenuRadioGroup aria-label={t('drawing_layout')} value={value} onValueChange={onChange}>
        {(['below', 'right'] as const).map(layout => {
          const PlacementIcon = layout === 'right' ? PanelRight : PanelBottom;
          return <DropdownMenuRadioItem key={layout} value={layout} className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm outline-none focus:bg-brand-soft focus:text-brand data-[state=checked]:text-brand">
            <PlacementIcon aria-hidden className="size-4" />{t(layout === 'right' ? 'drawing_right' : 'drawing_below')}
            {value === layout ? <Check aria-hidden className="ml-auto size-4" /> : null}
          </DropdownMenuRadioItem>;
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
