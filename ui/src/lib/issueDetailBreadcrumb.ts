export type IssueDetailBreadcrumb = {
  label: string;
  href: string;
};

type IssueDetailLocationState = {
  issueDetailBreadcrumbs?: IssueDetailBreadcrumb[];
  issueDetailBreadcrumb?: IssueDetailBreadcrumb;
};

function isIssueDetailBreadcrumb(value: unknown): value is IssueDetailBreadcrumb {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<IssueDetailBreadcrumb>;
  return typeof candidate.label === "string" && typeof candidate.href === "string";
}

export function createIssueDetailLocationState(label: string, href: string): IssueDetailLocationState;
export function createIssueDetailLocationState(breadcrumbs: IssueDetailBreadcrumb[]): IssueDetailLocationState;
export function createIssueDetailLocationState(
  labelOrBreadcrumbs: string | IssueDetailBreadcrumb[],
  href?: string,
): IssueDetailLocationState {
  if (Array.isArray(labelOrBreadcrumbs)) {
    return { issueDetailBreadcrumbs: labelOrBreadcrumbs };
  }
  return { issueDetailBreadcrumb: { label: labelOrBreadcrumbs, href: href ?? "/issues" } };
}

export function readIssueDetailBreadcrumb(state: unknown): IssueDetailBreadcrumb | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as IssueDetailLocationState).issueDetailBreadcrumb;
  return isIssueDetailBreadcrumb(candidate) ? candidate : null;
}

export function readIssueDetailBreadcrumbs(state: unknown): IssueDetailBreadcrumb[] | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as IssueDetailLocationState).issueDetailBreadcrumbs;
  if (!Array.isArray(candidate)) return null;
  const breadcrumbs = candidate.filter(isIssueDetailBreadcrumb);
  return breadcrumbs.length > 0 ? breadcrumbs : null;
}
