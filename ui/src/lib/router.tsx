import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  extractSurfaceRootFromPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";

function resolveTo(to: To, companyPrefix: string | null, surfaceRoot: "/dx" | "/gtm" | null): To {
  if (typeof to === "string") {
    return applyCompanyPrefix(to, companyPrefix, surfaceRoot);
  }

  if (to.pathname && to.pathname.startsWith("/")) {
    const pathname = applyCompanyPrefix(to.pathname, companyPrefix, surfaceRoot);
    if (pathname !== to.pathname) {
      return { ...to, pathname };
    }
  }

  return to;
}

function useActiveCompanyPrefix(): string | null {
  const { selectedCompany } = useCompany();
  const params = RouterDom.useParams<{ companyPrefix?: string }>();
  const location = RouterDom.useLocation();

  if (params.companyPrefix) {
    return normalizeCompanyPrefix(params.companyPrefix);
  }

  const pathPrefix = extractCompanyPrefixFromPath(location.pathname);
  if (pathPrefix) return pathPrefix;

  return selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
}

function useActiveSurfaceRoot(): "/dx" | "/gtm" | null {
  const location = RouterDom.useLocation();
  return extractSurfaceRootFromPath(location.pathname);
}

export * from "react-router-dom";

export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.Link>>(
  function CompanyLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    const surfaceRoot = useActiveSurfaceRoot();
    return <RouterDom.Link ref={ref} to={resolveTo(to, companyPrefix, surfaceRoot)} {...props} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.NavLink>>(
  function CompanyNavLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    const surfaceRoot = useActiveSurfaceRoot();
    return <RouterDom.NavLink ref={ref} to={resolveTo(to, companyPrefix, surfaceRoot)} {...props} />;
  },
);

export function Navigate({ to, ...props }: React.ComponentProps<typeof RouterDom.Navigate>) {
  const companyPrefix = useActiveCompanyPrefix();
  const surfaceRoot = useActiveSurfaceRoot();
  return <RouterDom.Navigate to={resolveTo(to, companyPrefix, surfaceRoot)} {...props} />;
}

export function useNavigate(): ReturnType<typeof RouterDom.useNavigate> {
  const navigate = RouterDom.useNavigate();
  const companyPrefix = useActiveCompanyPrefix();
  const surfaceRoot = useActiveSurfaceRoot();

  return React.useCallback(
    ((to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(resolveTo(to, companyPrefix, surfaceRoot), options);
    }) as ReturnType<typeof RouterDom.useNavigate>,
    [navigate, companyPrefix, surfaceRoot],
  );
}
