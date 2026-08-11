'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeft } from 'lucide-react';
import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Separator, Sheet, SheetContent, Tooltip, TooltipProvider } from './primitives';

const SIDEBAR_COOKIE_NAME = 'cove_sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SIDEBAR_WIDTH = '15.5rem';
/** Wide enough for a 36px icon button plus even breathing room either side. */
const SIDEBAR_WIDTH_ICON = '3.5rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used inside a SidebarProvider.');
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & { defaultOpen?: boolean }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, _setOpen] = React.useState(defaultOpen);

  const setOpen = React.useCallback((value: boolean) => {
    _setOpen(value);
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((value) => !value);
      return;
    }
    setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state: open ? 'expanded' : 'collapsed',
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          className={cn('flex min-h-screen w-full bg-canvas', className)}
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  collapsible = 'icon',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { collapsible?: 'icon' | 'offcanvas' | 'none' }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const { t } = useLayoutTranslation('nav');

  if (collapsible === 'none') {
    return (
      <div
        className={cn(
          'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-ink',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent
          className="w-(--sidebar-width) p-0"
          side="left"
          style={{ '--sidebar-width': SIDEBAR_WIDTH } as React.CSSProperties}
          title={t('sidebar.title')}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-ink md:block"
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-slot="sidebar"
      data-state={state}
    >
      {/* Reserves the layout width so content never sits under the rail. */}
      <div
        className={cn(
          'relative h-svh w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
        )}
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,width] duration-200 ease-linear md:flex',
          'group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]',
          'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
          className,
        )}
        {...props}
      >
        <div
          className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar"
          data-sidebar="sidebar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A hit area along the sidebar's edge that toggles it. The affordance is a
 * short rounded handle that fades in on hover — not a full-height hairline,
 * which reads as a stray border sitting on top of the real one.
 */
export function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar();
  const { t } = useLayoutTranslation('nav');
  return (
    <button
      aria-label={t('sidebar.toggle')}
      className={cn(
        'group/rail absolute inset-y-0 right-0 z-20 hidden w-3 cursor-pointer outline-none md:block',
        className,
      )}
      onClick={toggleSidebar}
      tabIndex={-1}
      type="button"
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-full bg-transparent transition-colors duration-150 group-hover/rail:bg-brand/40"
      />
    </button>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  const { t } = useLayoutTranslation('nav');
  return (
    <Button
      aria-label={t('sidebar.toggle')}
      className={cn('size-8', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...props}
    >
      <PanelLeft />
    </Button>
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn('relative flex min-h-svh w-full min-w-0 flex-col', className)}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-2', className)}
      data-sidebar="header"
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-auto flex flex-col gap-2 p-2', className)}
      data-sidebar="footer"
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-1 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className,
      )}
      data-sidebar="content"
      {...props}
    />
  );
}

export function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return <Separator className={cn('mx-2 w-auto bg-sidebar-border', className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // Collapsed: drop the side padding so each row spans the full icon rail
        // and its button can centre itself against the true width.
        'relative flex w-full min-w-0 flex-col p-2 group-data-[collapsible=icon]:px-0',
        className,
      )}
      data-sidebar="group"
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center overflow-hidden rounded-md px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-sub/80 transition-[margin,opacity] duration-200',
        // Collapsed: fold the label away entirely so no blank gap is left behind.
        'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      data-sidebar="group-label"
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
      data-sidebar="menu"
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      className={cn(
        'group/menu-item relative group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center',
        className,
      )}
      data-sidebar="menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  cn(
    'peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 text-left text-[14px] font-semibold outline-none transition-colors',
    'hover:bg-sidebar-accent hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[active=true]:bg-sidebar-accent data-[active=true]:text-brand',
    // Collapsed: a centred square with the label removed, not a clipped label.
    'group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&>span]:hidden',
    '[&>svg]:size-[1.05rem] [&>svg]:shrink-0 [&>span:last-child]:truncate',
  ),
  {
    variants: {
      size: { default: 'h-9', lg: 'h-11' },
    },
    defaultVariants: { size: 'default' },
  },
);

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  size,
  tooltip,
  className,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }) {
  const Comp = asChild ? Slot : 'button';
  const { state, isMobile } = useSidebar();

  const button = (
    <Comp
      className={cn(sidebarMenuButtonVariants({ size }), className)}
      data-active={isActive}
      data-sidebar="menu-button"
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <Tooltip content={tooltip} hidden={state !== 'collapsed' || isMobile} side="right">
      {button}
    </Tooltip>
  );
}

export function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'ml-4 flex min-w-0 flex-col gap-0.5 border-l border-sidebar-border py-0.5 pl-2.5',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      data-sidebar="menu-sub"
      {...props}
    />
  );
}

export function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('relative', className)} {...props} />;
}

export function SidebarMenuSubButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'a'> & { asChild?: boolean; isActive?: boolean }) {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      className={cn(
        'flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-[13.5px] font-medium text-sub outline-none transition-colors',
        'hover:bg-sidebar-accent hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40',
        'data-[active=true]:font-semibold data-[active=true]:text-brand',
        '[&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        className,
      )}
      data-active={isActive}
      data-sidebar="menu-sub-button"
      {...props}
    />
  );
}

export function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute right-2 flex h-5 min-w-5 select-none items-center justify-center rounded-full bg-brand-soft px-1.5 text-[11px] font-bold tabular-nums text-brand',
        'peer-hover/menu-button:bg-card group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  );
}
