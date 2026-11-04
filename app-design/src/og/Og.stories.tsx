import type { Meta, StoryObj } from '@storybook/react';

import { OG_SIZE, OgBento, OgCard, ogArt, SOCIAL_SIZE, type OgBentoProps, type OgCardProps } from '.';

/*
 * The share images as next/og draws them (@orangecheck/app-design/og), shown
 * here scaled down in the browser's own Inter. A route renders them with
 * ogFonts(), at OG_SIZE or SOCIAL_SIZE. Each is an image, so it carries no
 * focusable control; a page that shows one gives the <img> its own alt.
 */
const meta: Meta = { title: 'Brand/OG and social' };
export default meta;

function Scaled({ size, scale, label, children }: { size: { width: number; height: number }; scale: number; label: string; children: React.ReactNode }) {
    return (
        <figure role="img" aria-label={label} className="max-w-full overflow-hidden" style={{ width: size.width * scale, height: size.height * scale }}>
            <div
                style={{
                    width: size.width,
                    height: size.height,
                    transform: `scale(${scale})`,
                    transformOrigin: '0 0',
                    display: 'flex',
                }}
            >
                {children}
            </div>
        </figure>
    );
}

const cards: OgCardProps[] = [
    {
        tone: 'paper',
        eyebrow: 'Lumen Notes',
        title: 'Notes that stay on your own keys.',
        product: 'notes',
        host: 'lumen.example',
    },
    {
        tone: 'ink',
        eyebrow: 'Lumen Notes',
        title: 'Sign in once, on every device you own.',
        product: 'notes',
        host: 'lumen.example',
    },
    {
        tone: 'burnt',
        eyebrow: 'Halfway Books',
        title: 'Every second-hand shelf, one search.',
        host: 'halfway.example',
        art: ogArt.ditherMark,
    },
    {
        tone: 'brand',
        eyebrow: 'Halfway Books',
        title: 'Listing a book is free.',
        host: 'halfway.example',
        mark: false,
    },
];

/** The four tones of the 1200×630 card: paper, ink, burnt and brand. */
export const Cards: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-6">
            {cards.map((card) => (
                <Scaled key={card.tone} size={OG_SIZE} scale={0.5} label={`Share card, ${card.tone}: ${card.title}`}>
                    <OgCard {...card} />
                </Scaled>
            ))}
        </div>
    ),
};

const tiles: OgBentoProps = {
    hero: {
        tone: 'paper',
        title: 'Lumen Notes keeps your notes on your own keys.',
        lockup: true,
        art: { ...ogArt.ditherMarkInk, place: 'right' },
    },
    top: [
        { tone: 'brand', numeral: '0', body: 'passwords to remember' },
        { tone: 'ink', numeral: '0', body: 'forms to fill in' },
    ],
    wide: {
        tone: 'burnt',
        numeral: '80%',
        body: ['of every shelf at Halfway Books', 'is second hand.'],
        art: { ...ogArt.halftoneField, place: 'left' },
    },
    row: [
        {
            tone: 'paper',
            title: 'Notes that stay yours.',
            art: { ...ogArt.ditherMarkInk, place: 'center' },
        },
        {
            tone: 'ink',
            footer: 'lumen.example',
            art: { ...ogArt.ditherMark, place: 'center' },
        },
        {
            tone: 'surface',
            kicker: 'Receipts',
            title: 'Every order comes with a receipt.',
            rows: [
                ['Paperback', '£4'],
                ['Hardback', '£9'],
            ],
            footer: 'Example data',
        },
        {
            tone: 'brand',
            kicker: 'For shops',
            title: 'Listing a book is free.',
            body: 'halfway.example/shops',
        },
    ],
};

/** The bento: rounded tiles on the social sheet, at 1200×630 (two rows) and 1920×1080 (three). */
export const Bento: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-6">
            <Scaled size={OG_SIZE} scale={0.5} label="Social image, 1200 by 630: Lumen Notes and Halfway Books tiles">
                <OgBento {...tiles} />
            </Scaled>
            <Scaled size={SOCIAL_SIZE} scale={0.36} label="Social image, 1920 by 1080: Lumen Notes and Halfway Books tiles">
                <OgBento {...tiles} size="social" />
            </Scaled>
        </div>
    ),
};
