import * as React from 'react';
import { cn } from '@/lib/utils';

// Context for sidebar state
const SidebarContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}

// SidebarProvider - manages sidebar state
interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function SidebarProvider({ children, defaultOpen = true }: SidebarProviderProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="flex min-h-screen w-full">{children}</div>
    </SidebarContext.Provider>
  );
}

// Sidebar - main sidebar container
interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: 'icon' | 'offcanvas' | 'none';
}

export function Sidebar({ className, collapsible = 'none', children, ...props }: SidebarProps) {
  const { open } = useSidebar();

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all',
        collapsible === 'icon' && !open && 'w-16',
        collapsible === 'icon' && open && 'w-64',
        collapsible === 'none' && 'w-64',
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

// SidebarHeader
export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2 p-4', className)} {...props} />;
}

// SidebarContent
export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-auto p-4', className)} {...props} />;
}

// SidebarFooter
export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto p-4', className)} {...props} />;
}

// SidebarRail - visual element
export function SidebarRail({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('absolute inset-y-0 right-0 w-px bg-border', className)} {...props} />;
}

// SidebarGroup
export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

// SidebarGroupLabel
export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-1 text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

// SidebarMenu
export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex flex-col gap-1', className)} {...props} />;
}

// SidebarMenuItem
export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('list-none', className)} {...props} />;
}

// SidebarMenuButton
interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
  size?: 'default' | 'sm' | 'lg';
}

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(({ className, asChild, isActive, size = 'default', children, ...props }, ref) => {
  const Comp = asChild ? React.Fragment : 'button';
  const buttonProps = asChild ? {} : props;

  const content = (
    <Comp
      ref={asChild ? undefined : ref}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
        isActive && 'bg-accent text-accent-foreground',
        size === 'sm' && 'text-xs',
        size === 'lg' && 'text-base',
        className
      )}
      {...buttonProps}
    >
      {children}
    </Comp>
  );

  return asChild ? <>{children}</> : content;
});
SidebarMenuButton.displayName = 'SidebarMenuButton';

// SidebarMenuSub
export function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('ml-4 flex flex-col gap-1 border-l pl-4', className)} {...props} />;
}

// SidebarMenuSubItem
export function SidebarMenuSubItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('list-none', className)} {...props} />;
}

// SidebarMenuSubButton
export const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => {
  const Comp = asChild ? React.Fragment : 'a';
  const buttonProps = asChild ? {} : props;

  const content = (
    <Comp
      ref={asChild ? undefined : ref}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...buttonProps}
    >
      {children}
    </Comp>
  );

  return asChild ? <>{children}</> : content;
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';

// SidebarMenuAction
interface SidebarMenuActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  showOnHover?: boolean;
  asChild?: boolean;
}

export const SidebarMenuAction = React.forwardRef<HTMLButtonElement, SidebarMenuActionProps>(
  ({ className, showOnHover, asChild, children, ...props }, ref) => {
    const Comp = asChild ? React.Fragment : 'button';
    const buttonProps = asChild ? {} : props;

    const content = (
      <Comp
        ref={asChild ? undefined : ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md p-1 hover:bg-accent hover:text-accent-foreground',
          showOnHover && 'opacity-0 group-hover:opacity-100',
          className
        )}
        {...buttonProps}
      >
        {children}
      </Comp>
    );

    return asChild ? <>{children}</> : content;
  }
);
SidebarMenuAction.displayName = 'SidebarMenuAction';

// SidebarInset - main content area
export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-1 flex-col', className)} {...props} />;
}
