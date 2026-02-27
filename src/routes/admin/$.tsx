import { createFileRoute } from "@tanstack/react-router";
import { CustomRoutes, Resource } from "ra-core";
import { tanStackRouterProvider } from "ra-router-tanstack";
import { Ticket, Tag, Calendar, Tags, Users, UsersRound } from "lucide-react";
import { Admin } from "@/components/admin/admin";
import { dataProvider } from "@/lib/supabase-provider";
import { authProvider } from "@/lib/auth-provider";
import { TicketList } from "@/components/admin/ticket-list";
import { TicketShow } from "@/components/admin/ticket-show";
import { CouponList } from "@/components/admin/coupon-list";
import { CouponCreate } from "@/components/admin/coupon-create";
import { CouponEdit } from "@/components/admin/coupon-edit";
import { CheckInPage } from "@/components/admin/check-in-page";
import { PaymentsPage } from "@/components/admin/payments-page";
import { TicketCreatePage } from "@/components/admin/ticket-create-page";
import { AdminsPage } from "@/components/admin/admins-page";
import { ReconciliationPage } from "@/components/admin/reconciliation-page";
import { EventCreatePage } from "@/components/admin/event-create-page";
import { EventList } from "@/components/admin/event-list";
import { EventShow } from "@/components/admin/event-show";
import { EventEdit } from "@/components/admin/event-edit";
import { TicketTypeList } from "@/components/admin/ticket-type-list";
import { TicketTypeShow } from "@/components/admin/ticket-type-show";
import { TicketTypeEdit } from "@/components/admin/ticket-type-edit";
import { GroupBookingList } from "@/components/admin/group-booking-list";
import { GroupBookingShow } from "@/components/admin/group-booking-show";
import { GroupBookingEdit } from "@/components/admin/group-booking-edit";
import { GroupMemberEdit } from "@/components/admin/group-member-edit";
import { EmailPage } from "@/components/admin/email-page";

export const Route = createFileRoute("/admin/$")({
  component: AdminApp,
});

const { Route: RouterRoute } = tanStackRouterProvider;

function AdminApp() {
  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      routerProvider={tanStackRouterProvider}
      basename="/admin"
      title="Hit Refresh Admin"
      disableTelemetry
      requireAuth
    >
      <Resource
        name="tickets"
        list={TicketList}
        show={TicketShow}
        icon={Ticket}
        recordRepresentation={(r) => r.name ?? r.email}
      />
      <Resource
        name="coupons"
        list={CouponList}
        create={CouponCreate}
        edit={CouponEdit}
        icon={Tag}
        recordRepresentation="code"
      />
      <Resource
        name="events"
        list={EventList}
        show={EventShow}
        edit={EventEdit}
        icon={Calendar}
        recordRepresentation="title"
      />
      <Resource
        name="ticket_types"
        list={TicketTypeList}
        show={TicketTypeShow}
        edit={TicketTypeEdit}
        icon={Tags}
        recordRepresentation="name"
      />
      <Resource
        name="group_bookings"
        list={GroupBookingList}
        show={GroupBookingShow}
        edit={GroupBookingEdit}
        icon={Users}
        recordRepresentation="booking_reference"
      />
      <Resource
        name="group_members"
        edit={GroupMemberEdit}
        icon={UsersRound}
        recordRepresentation={(r) => r.name ?? r.email ?? `Member ${r.member_position}`}
      />
      <CustomRoutes>
        <RouterRoute path="/checkin" element={<CheckInPage />} />
        <RouterRoute path="/payments" element={<PaymentsPage />} />
        <RouterRoute path="/admins" element={<AdminsPage />} />
        <RouterRoute path="/reconciliation" element={<ReconciliationPage />} />
        <RouterRoute path="/ticket-create" element={<TicketCreatePage />} />
        <RouterRoute path="/event-create" element={<EventCreatePage />} />
        <RouterRoute path="/email" element={<EmailPage />} />
      </CustomRoutes>
    </Admin>
  );
}
