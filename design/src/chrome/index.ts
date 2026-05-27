/**
 * Family chrome.
 *
 * Auth- and family-coupled composites: the shared header logo/dropdown,
 * account menu, primary nav, ecosystem switcher, dashboard shells, and the
 * family-properties registry. These depend on `@orangecheck/auth-client` and
 * the family map, so they live in their own tier separate from the
 * dependency-free primitives and the generic composites.
 */
export { EcosystemSwitcher } from './ecosystem-switcher';
export type { EcosystemSwitcherProps, EcosystemSlug } from './ecosystem-switcher';

export { OcLogoDropdown } from './logo-dropdown';
export type { OcLogoDropdownProps } from './logo-dropdown';

export { OcAccountMenu, OcAccountMenuView } from './account-menu';
export type {
    OcAccountMenuProps,
    OcAccountMenuViewProps,
    OcAccountMenuItem,
    OcAccountMenuBuildInfo,
    OcAccountMenuSession,
} from './account-menu';

export {
    FAMILY_PROPERTIES,
    SITE_STATE_LABEL,
    findFamilyProperty,
} from './family-properties';
export type { FamilyProperty, FamilyCategory, SiteState } from './family-properties';

export { OcPrimaryNav } from './primary-nav';
export type { OcPrimaryNavProps, OcPrimaryNavLink } from './primary-nav';

export { OcDashboardShell, OcDashboardHub } from './dashboard-shell';
export type {
    OcDashboardShellProps,
    OcDashboardHubProps,
    OcDashboardTool,
} from './dashboard-shell';

export { AppShell } from './app-shell';
export type { AppShellProps } from './app-shell';

export { LayoutSubHeader } from './layout-sub-header';
export type { LayoutSubHeaderProps, LayoutSubHeaderTag } from './layout-sub-header';
