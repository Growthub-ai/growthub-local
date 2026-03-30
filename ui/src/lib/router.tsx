import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  isGlobalPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";
import { surfaceRouteMount } from "@/lib/surface-profile";

function applySurfaceMount(pathname: string): string {
  if (surfaceRouteMount === "/dx") return pathname;
  if (isGlobalPath(pathname)) return pathname;
  if (pathname.startsWith(`${surfaceRouteMount}/`) || pathname === surfaceRouteMount) return pathname;
  return `${surfaceRouteMount}${pathname}`;
}

function resolveTo(to: To, companyPrefix: string | null): To {
  if (typeof to === "string") {
    const withCompany = applyCompanyPrefix(to, companyPrefix);
    const { pathname, search, hash } = splitToString(withCompany);
    return `${applySurfaceMount(pathname)}${search}${hash}`;
  }

  if (to.pathname && to.pathname.startsWith("/")) {
    const withCompany = applyCompanyPrefix(to.pathname, companyPrefix);
    const resolved = applySurfaceMount(withCompany);
    if (resolved !== to.pathname) {
      return { ...to, pathname: resolved };
    }
  }

  return to;
}

function splitToString(path: string): { pathname: string; search: string; hash: string } {
  const match = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return { pathname: match?.[1] ?? path, search: match?.[2] ?? "", hash: match?.[3] ?? "" };
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

export * from "react-router-dom";

export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.Link>>(
  function CompanyLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    return <RouterDom.Link ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.NavLink>>(
  function CompanyNavLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    return <RouterDom.NavLink ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
  },
);

export function Navigate({ to, ...props }: React.ComponentProps<typeof RouterDom.Navigate>) {
  const companyPrefix = useActiveCompanyPrefix();
  return <RouterDom.Navigate to={resolveTo(to, companyPrefix)} {...props} />;
}

export function useNavigate(): ReturnType<typeof RouterDom.useNavigate> {
  const navigate = RouterDom.useNavigate();
  const companyPrefix = useActiveCompanyPrefix();

  return React.useCallback(
    ((to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(resolveTo(to, companyPrefix), options);
    }) as ReturnType<typeof RouterDom.useNavigate>,
    [navigate, companyPrefix],
  );
}
