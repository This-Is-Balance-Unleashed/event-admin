import { createFileRoute } from "@tanstack/react-router";
import { CustomRoutes, Resource } from "ra-core";
import { tanStackRouterProvider } from "ra-router-tanstack";
import { Ticket, Tag } from "lucide-react";
import { Admin } from "@/components/admin/admin";
import { dataProvider } from "@/lib/supabase-provider";
import { TicketList } from "@/components/admin/ticket-list";
import { TicketShow } from "@/components/admin/ticket-show";
import { CouponList } from "@/components/admin/coupon-list";
import { CouponCreate } from "@/components/admin/coupon-create";
import { CouponEdit } from "@/components/admin/coupon-edit";
import { CheckInPage } from "@/components/admin/check-in-page";
import { PaymentsPage } from "@/components/admin/payments-page";

export const Route = createFileRoute("/admin/$")({
  component: AdminApp,
});

const { Route: RouterRoute } = tanStackRouterProvider;

function AdminApp() {
  return (
    <Admin
      dataProvider={dataProvider}
      routerProvider={tanStackRouterProvider}
      basename="/admin"
      title="Hit Refresh Admin"
      disableTelemetry
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
      <CustomRoutes>
        <RouterRoute path="/checkin" element={<CheckInPage />} />
        <RouterRoute path="/payments" element={<PaymentsPage />} />
      </CustomRoutes>
    </Admin>
  );
}
