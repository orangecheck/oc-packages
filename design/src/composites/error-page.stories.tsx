import type { Meta, StoryObj } from '@storybook/react';

import { OcErrorPage } from './error-page';

const meta = {
    title: 'Composites/OcErrorPage',
    component: OcErrorPage,
    parameters: { layout: 'fullscreen' },
    argTypes: {
        variant: { control: 'inline-radio', options: ['not-found', 'server-error'] },
    },
    args: { variant: 'not-found' },
} satisfies Meta<typeof OcErrorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const NotFound: Story = {
    args: { variant: 'not-found' },
};

export const ServerError: Story = {
    args: { variant: 'server-error' },
};

/**
 * A site can override any of the copy. `homeHref` matters for the sites whose
 * real root is app-scoped rather than `/`.
 */
export const Customised: Story = {
    args: {
        variant: 'not-found',
        title: 'no such envelope',
        detail: 'that stamp id has never been published to the relays we read.',
        homeHref: '/verify',
        actions: ['check the id for a typo', 'try a different relay', 'stamp it yourself'],
    },
};

/** `children` is where a site adds a report link or a status page. */
export const WithExtraContent: Story = {
    args: {
        variant: 'server-error',
        children: (
            <p className="text-muted-foreground font-mono text-xs">
                {'// '}persisting? open an issue on{' '}
                <a href="https://github.com/orangecheck" className="text-primary underline">
                    github.com/orangecheck
                </a>
            </p>
        ),
    },
};
