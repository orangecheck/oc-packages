/**
 * Family composites + chrome (back-compat surface).
 *
 * Historically these lived in `@orangecheck/ui` and were re-exported here.
 * They have now been folded into `@orangecheck/design` itself, split into two
 * dependency-honest tiers:
 *   - `@orangecheck/design/composites` — generic, auth-free (SectionHeader,
 *     EmptyState, StatGrid, HelpHint, Callout, DefinitionList, DataRow)
 *   - `@orangecheck/design/chrome` — auth/family-coupled (OcAccountMenu,
 *     OcLogoDropdown, OcPrimaryNav, dashboard shells, LayoutSubHeader, …)
 *
 * This `/components` entry re-exports both so the prior single import surface
 * keeps working. New code should prefer the specific tier subpath.
 */
export * from '../composites';
export * from '../chrome';
