// Bridge: re-exports router primitives from the TanStack Router adapter.
// shadcn-admin-kit components import from "react-router", but this project
// uses ra-router-tanstack (no react-router RouterContext is provided).
// Import from here instead of "react-router" in all admin components.
import { tanStackRouterProvider } from "ra-router-tanstack";

export const { Link, Navigate, useNavigate, useLocation, useMatch, useParams } =
  tanStackRouterProvider;
