/**
 * Generic composites.
 *
 * Auth-free compositions built only from primitives: section headers, empty
 * states, stat grids, inline help, toned callouts, definition lists, and data
 * rows. These are the family's shared "tier 2" building blocks — richer than a
 * primitive, but with no dependency on auth or the family registry. Whenever a
 * site is about to hand-roll one of these, import it from here instead.
 */
export { SectionHeader } from './section-header';
export type { SectionHeaderProps } from './section-header';

export { EmptyState } from './empty-state';
export type { EmptyStateProps, EmptyStateCta } from './empty-state';

export { StatGrid, StatTile } from './stat-grid';
export type { StatGridProps, StatItem } from './stat-grid';

export { HelpHint } from './help-hint';
export type { HelpHintProps } from './help-hint';

export { Callout } from './callout';
export type { CalloutProps, CalloutTone } from './callout';

export { DefinitionList } from './definition-list';
export type { DefinitionListProps, DefinitionItem } from './definition-list';

export { DataRow } from './data-row';
export type { DataRowProps } from './data-row';
