import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Pagination } from './pagination';

const meta = {
    title: 'Primitives/Pagination',
    component: Pagination,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        function Demo() {
            const [page, setPage] = useState(0);
            return (
                <div className="max-w-md">
                    <Pagination page={page} pageSize={10} total={84} onPage={setPage} />
                </div>
            );
        }
        return <Demo />;
    },
};
