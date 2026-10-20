import type { Meta, StoryObj } from '@storybook/react';

import { FamilyList } from '../chrome/family-menu';
import { SiteHeader } from '../chrome';
import { DataTable, Footnote, SectionHeading } from '../components';
import { StatusBadge } from '../primitives';
import { FAMILY, FAMILY_GROUPS, type FamilySite } from './index';

const meta: Meta = { title: 'Family', parameters: { fullBleed: true } };
export default meta;

const GROUP = Object.fromEntries(FAMILY_GROUPS.map((g) => [g.id, g.label]));

/** The menu every site opens from the chevron beside its lockup. Press it to open. */
export const Menu: StoryObj = {
    name: 'Family menu',
    render: () => (
        <div className="min-h-screen">
            <SiteHeader family="stamp" product="stamp" variant="tool" />
            <div className="oca-container flex flex-col gap-8 py-12">
                <SectionHeading
                    eyebrow="The family menu"
                    title="Every site, one line each."
                    lead="Opened from the chevron beside the lockup, so the lockup stays a link home. A status shows only where a site is not live."
                    reveal={false}
                    level={3}
                />
                <div className="max-w-[56rem] rounded-2xl border border-border bg-popover p-3">
                    <FamilyList current="stamp" />
                </div>
            </div>
        </div>
    ),
};

export const Registry: StoryObj = {
    name: 'Registry',
    render: () => (
        <div className="oca-container flex flex-col gap-8 py-12">
            <SectionHeading
                eyebrow="@orangecheck/app-design/family"
                title="One list of the family."
                lead="The menu, the footer, the protocol grid and the app grid all read it. Protocols keep one order everywhere."
                reveal={false}
                level={3}
            />
            <DataTable<FamilySite>
                caption="The family"
                rowKey={(s) => s.slug}
                columns={[
                    { key: 'label', header: 'Site', cell: (s) => <span className="font-medium">{s.label}</span>, primary: true, width: '9rem' },
                    { key: 'group', header: 'Group', cell: (s) => GROUP[s.group], width: '9rem' },
                    { key: 'line', header: 'Line', cell: (s) => s.line, minWidth: '18rem' },
                    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} />, width: '8rem' },
                    {
                        key: 'href',
                        header: 'Link',
                        cell: (s) => <span className="font-mono text-[0.8125rem]">{s.href.replace('https://', '')}</span>,
                        hideOnPhone: true,
                    },
                ]}
                rows={[...FAMILY]}
            />
            <Footnote>Status is written in the registry until the claims source exists, then read from there.</Footnote>
        </div>
    ),
};
