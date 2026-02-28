import { createElement } from "react";
import {
  useCanAccess,
  useCreatePath,
  useGetResourceLabel,
  useHasDashboard,
  useResourceDefinitions,
  useTranslate,
} from "ra-core";
import { tanStackRouterProvider } from "ra-router-tanstack";

const { Link, useMatch } = tanStackRouterProvider;
import {
  CalendarPlus,
  CreditCard,
  MailPlus,
  Pencil,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TicketPlus,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { House, List, Shell } from "lucide-react";

/**
 * Navigation sidebar displaying menu items, allowing users to navigate between different sections of the application.
 *
 * The sidebar can collapse to an icon-only view and renders as a collapsible drawer on mobile devices.
 * It automatically includes links to the dashboard (if defined) and all list views defined in Resource components.
 *
 * Included in the default Layout component
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/appsidebar AppSidebar documentation}
 * @see {@link https://ui.shadcn.com/docs/components/sidebar shadcn/ui Sidebar component}
 * @see layout.tsx
 */
export function AppSidebar() {
  const hasDashboard = useHasDashboard();
  const resources = useResourceDefinitions();
  const { openMobile, setOpenMobile } = useSidebar();
  const handleClick = () => {
    if (openMobile) {
      setOpenMobile(false);
    }
  };
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <Shell className="size-5!" />
                <span className="text-base font-semibold">Hit Refresh</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {hasDashboard ? <DashboardMenuItem onClick={handleClick} /> : null}
              {Object.keys(resources)
                .filter((name) => resources[name].hasList)
                .map((name) => (
                  <ResourceMenuItem key={name} name={name} onClick={handleClick} />
                ))}
              <CreateEventMenuItem onClick={handleClick} />
              <SendEmailMenuItem onClick={handleClick} />
              <CheckInMenuItem onClick={handleClick} />
              <CreateTicketsMenuItem onClick={handleClick} />
              <EditTicketsMenuItem onClick={handleClick} />
              <PaymentsMenuItem onClick={handleClick} />
              <AdminsMenuItem onClick={handleClick} />
              <ReconciliationMenuItem onClick={handleClick} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

/**
 * Menu item for the dashboard link in the sidebar.
 *
 * This component renders a sidebar menu item that links to the dashboard page.
 * It displays as active when the user is on the dashboard route.
 *
 * @example
 * <DashboardMenuItem onClick={handleClick} />
 */
export const DashboardMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const translate = useTranslate();
  const label = translate("ra.page.dashboard", {
    _: "Dashboard",
  });
  const match = useMatch({ path: "/", end: true });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/" onClick={onClick}>
          <House />
          {label}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const CreateEventMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/event-create", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/event-create" onClick={onClick}>
          <CalendarPlus />
          Create Event
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const SendEmailMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/email", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/email" onClick={onClick}>
          <MailPlus />
          Send Emails
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const CheckInMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/checkin", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match} className="text-primary font-medium">
        <Link to="/admin/checkin" onClick={onClick}>
          <ScanLine />
          Check In
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const CreateTicketsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/ticket-create", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/ticket-create" onClick={onClick}>
          <TicketPlus />
          Create Tickets
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const EditTicketsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/tickets/edit", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/tickets/edit" onClick={onClick}>
          <Pencil />
          Edit Tickets
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const PaymentsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/payments", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/payments" onClick={onClick}>
          <CreditCard />
          Payments
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const AdminsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/admins", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/admins" onClick={onClick}>
          <ShieldCheck />
          Admins
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const ReconciliationMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/reconciliation", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/reconciliation" onClick={onClick}>
          <RefreshCw />
          Reconciliation
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const ResourceMenuItem = ({ name, onClick }: { name: string; onClick?: () => void }) => {
  const { canAccess, isPending } = useCanAccess({
    resource: name,
    action: "list",
  });
  const resources = useResourceDefinitions();
  const getResourceLabel = useGetResourceLabel();
  const createPath = useCreatePath();
  const to = createPath({
    resource: name,
    type: "list",
  });
  const match = useMatch({ path: to, end: false });

  if (isPending) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (!resources || !resources[name] || !canAccess) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to={to} state={{ _scrollToTop: true }} onClick={onClick}>
          {resources[name].icon ? createElement(resources[name].icon) : <List />}
          {getResourceLabel(name, 2)}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
