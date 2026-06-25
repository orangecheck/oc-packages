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

export { StatCard } from './stat-card';
export type { StatCardProps } from './stat-card';

export { HelpHint } from './help-hint';
export type { HelpHintProps } from './help-hint';

export { Callout } from './callout';
export type { CalloutProps, CalloutTone } from './callout';

export { DefinitionList } from './definition-list';
export type { DefinitionListProps, DefinitionItem } from './definition-list';

export { DataRow } from './data-row';
export type { DataRowProps } from './data-row';

// Marketing / consumer tier (ember-era landing-page building blocks)
export { TwoToneHeading, MarketingHeading } from './marketing-heading';
export type { TwoToneHeadingProps, MarketingHeadingProps } from './marketing-heading';

export { FeatureCard } from './feature-card';
export type { FeatureCardProps } from './feature-card';

export { Section, BrandBand } from './section';
export type { SectionProps } from './section';

export { ComparisonTable } from './comparison-table';
export type { ComparisonTableProps, ComparisonRow } from './comparison-table';

export { NumberedStep, StepList } from './numbered-step';
export type { NumberedStepProps, StepListProps, Step } from './numbered-step';

export { Faq } from './faq';
export type { FaqProps, FaqItem } from './faq';

export { EmailCapture } from './email-capture';
export type { EmailCaptureProps } from './email-capture';

export { CheckList } from './check-list';
export type { CheckListProps } from './check-list';

export { AccentNote, AccentList } from './accent-note';
export type { AccentNoteProps, AccentListProps, AccentListItem } from './accent-note';

export { VerifiedChip } from './verified-chip';
export type { VerifiedChipProps } from './verified-chip';
