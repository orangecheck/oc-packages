import type { ReactNode } from 'react';

/** A link in a header, a footer or a menu. */
export interface NavItem {
    href: string;
    label: ReactNode;
    /** Marks the current section for styling and aria-current. */
    active?: boolean;
    external?: boolean;
    /** One line under the label, where a dropdown has room for it. */
    description?: ReactNode;
    /** One level of links under this one: a dropdown in the header, a group in the phone menu. */
    children?: NavItem[];
}

export interface FooterColumn {
    heading: string;
    links: NavItem[];
}
