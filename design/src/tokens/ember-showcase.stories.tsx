import type { Meta, StoryObj } from '@storybook/react';
import {
    Ban,
    Bitcoin,
    Check,
    EyeOff,
    KeyRound,
    LayoutGrid,
    Lock,
    LogOut,
    MessageCircle,
    Search,
    ShieldCheck,
    Sparkles,
    Zap,
} from 'lucide-react';

import { Badge, Button, IconBadge, Surface } from '../primitives';
import {
    AccentList,
    AccentNote,
    BrandBand,
    CheckList,
    ComparisonTable,
    EmailCapture,
    Faq,
    FeatureCard,
    MarketingHeading,
    Section,
    StepList,
    TwoToneHeading,
    VerifiedChip,
} from '../composites';
import { cn } from './cn';

/*
 * Ember Showcase — the orangecheck.io redesign rebuilt section-for-section from
 * @orangecheck/design components, to prove the new warm look is JUST a skin plus
 * reusable parts. Flip the Skin + Mode toolbars and watch the same page recolour.
 */

function FauxNav() {
    return (
        <nav className="mb-12 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
                <IconBadge tone="onBrand" size="sm">
                    <Check />
                </IconBadge>
                <span className="text-lg font-bold tracking-tight">orangecheck</span>
            </div>
            <div className="text-primary-foreground/85 hidden items-center gap-7 text-sm font-medium md:flex">
                <span>How it works</span>
                <span>For business</span>
                <span>Sign in</span>
                <Button className="bg-background text-foreground hover:bg-background/90 rounded-full">
                    Create account
                </Button>
            </div>
        </nav>
    );
}

function HeroArt() {
    return (
        <div className="bg-dots relative hidden min-h-[22rem] items-center justify-center rounded-3xl md:flex">
            <div className="text-primary-foreground/70 font-mono text-sm leading-7">
                <div>
                    did:oc <span className="text-primary-foreground/45">bc1q…k7x4</span>
                </div>
                <div>
                    google <span className="text-primary-foreground/45">linked</span>
                </div>
                <div>
                    email <span className="text-primary-foreground/45">linked</span>
                </div>
                <div>
                    bitcoin <span className="text-primary-foreground/45">optional</span>
                </div>
                <div>
                    status <span className="text-primary-foreground/45">verified</span>
                </div>
            </div>
            <div className="absolute right-4 bottom-4">
                <VerifiedChip label="Verified, only you" />
            </div>
        </div>
    );
}

function SignInCardMock() {
    return (
        <Surface elevation="lg" pad="lg" className="mx-auto w-full max-w-sm rounded-3xl">
            <div className="flex flex-col items-center text-center">
                <IconBadge tone="brand" size="lg" className="rounded-2xl">
                    L
                </IconBadge>
                <h3 className="text-foreground mt-4 text-lg font-bold">Sign in to Lumen</h3>
                <p className="text-muted-foreground text-sm">Welcome back</p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
                <div className="relative">
                    <Button className="w-full justify-start gap-3 rounded-full">
                        <Check className="size-4" />
                        Continue with OrangeCheck
                    </Button>
                    <Badge
                        variant="neutral"
                        className="absolute -top-2 right-3 text-[10px] tracking-wide"
                    >
                        no password
                    </Badge>
                </div>
                <Button variant="outline" className="w-full justify-start gap-3 rounded-full">
                    <span className="font-semibold">G</span> Continue with Google
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 rounded-full">
                    <span className="font-semibold">@</span> Continue with email
                </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-center text-xs">
                New here? Your account is created automatically.
            </p>
        </Surface>
    );
}

const STEPS = [
    {
        title: 'Create your account',
        children: 'Sign up in seconds with Google, email, or your Bitcoin wallet.',
    },
    {
        title: 'Use it everywhere',
        children: 'Tap “Continue with OrangeCheck” on any app that supports it.',
    },
    {
        title: 'It stays yours',
        children: 'Switch phones or change apps and it follows you. No one can take it.',
    },
];

const CAPABILITIES = [
    { icon: <LayoutGrid />, title: 'One login, everywhere', body: 'Use the same account on every app that supports OrangeCheck.' },
    { icon: <Search />, title: 'No passwords, ever', body: 'Sign in with a single tap. Nothing to remember, nothing to leak.' },
    { icon: <Bitcoin />, title: 'Get rewarded for being real', body: 'Some apps give you a small reward just for proving you are genuine.' },
    { icon: <MessageCircle />, title: 'Private messages', body: 'Send messages that only the right person can open.' },
    { icon: <Lock />, title: 'A vault for your secrets', body: 'Keep passwords, keys, and private notes locked away.' },
    { icon: <Sparkles />, title: 'Let your AI act for you', body: 'Give an assistant permission to act, with limits you set.' },
];

const PROMISES = [
    { icon: <Bitcoin />, title: 'Never sell your data', body: 'No ads, no tracking, no data business. You are not the product.' },
    { icon: <Search />, title: 'Never store a password', body: 'Nothing to forget, leak, or steal. There simply is no password.' },
    { icon: <LogOut />, title: 'Never lock you in', body: 'Leave whenever you want and take your identity with you.' },
    { icon: <EyeOff />, title: 'Never watch you', body: 'No record of where you sign in. No one sits in the middle.' },
    { icon: <Lock />, title: 'Never hold your money', body: 'Even if you add Bitcoin, your coins never move. We cannot touch them.' },
    { icon: <Check />, title: 'Never hide how it works', body: 'It is open source, so anyone can check exactly what it does.' },
];

const BUSINESS = [
    { icon: <ShieldCheck />, title: 'Stop bots and fake accounts', body: 'Only real people get through, so your signups stay clean.' },
    { icon: <Search />, title: 'No passwords to store', body: 'Nothing to breach, no reset flows to build. One less database.' },
    { icon: <Lock />, title: 'Less data, less liability', body: 'Confirm what you need without collecting personal info.' },
    { icon: <Zap />, title: 'One-tap sign-in', body: 'Users log in instantly instead of filling out a form.' },
];

const COMPARISON = [
    { label: 'Who owns your account', theirs: 'The company does', ours: 'You do' },
    { label: 'If they ban you', theirs: 'You lose everything', ours: 'Nothing, it’s still yours' },
    { label: 'Passwords', theirs: 'One more to remember', ours: 'None, ever' },
    { label: 'Your personal data', theirs: 'Stored on their servers', ours: 'Stays with you' },
    { label: 'Across different apps', theirs: 'Start over every time', ours: 'The same you, everywhere' },
    { label: 'If the company shuts down', theirs: 'Your account is gone', ours: 'It keeps working' },
];

const FAQ = [
    { q: 'Is it free?', a: 'Yes. Creating your account is free, and it always will be.' },
    { q: 'Do I need to know anything about Bitcoin?', a: 'No. You can use Google or email and never touch Bitcoin.' },
    { q: 'What if I lose my phone?', a: 'Your identity lives with you, not the phone. You can recover it.' },
    { q: 'Is it safe?', a: 'It is open source and offline-verifiable. No black box.' },
    { q: 'Who owns my account?', a: 'You do. No company can ban it, delete it, or lock you out.' },
    { q: 'What can I use it for?', a: 'Signing in, private messages, a secrets vault, and more.' },
];

const WHY_LIST = [
    { title: 'It’s truly yours', children: 'A Google or Facebook login still belongs to them, and they can suspend it. Yours can’t be banned, deleted, or locked.', active: true },
    { title: 'Prove you’re real, share nothing' },
    { title: 'You choose what each app sees' },
    { title: 'Your reputation travels with you' },
];

function Page() {
    return (
        <div className="bg-background text-foreground">
            {/* 1 — HERO */}
            <BrandBand>
                <FauxNav />
                <div className="grid items-center gap-12 md:grid-cols-2">
                    <div>
                        <TwoToneHeading
                            as="h1"
                            tone="onBrand"
                            lead="Your accounts aren’t really yours."
                            className="md:text-6xl"
                        />
                        <p className="text-primary-foreground/85 mt-5 max-w-md text-lg leading-relaxed">
                            We give you one that is. <strong>A single login for every app</strong>{' '}
                            that no company can ban, delete, or take away.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Button className="bg-background text-foreground hover:bg-background/90 rounded-full px-6">
                                Create your free account
                            </Button>
                            <Button
                                variant="outline"
                                className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 rounded-full px-6"
                            >
                                See how it works
                            </Button>
                        </div>
                        <div className="mt-8">
                            <CheckList
                                tone="onBrand"
                                items={['Free forever', 'No passwords', 'No ID checks', 'Open source']}
                            />
                        </div>
                    </div>
                    <HeroArt />
                </div>
            </BrandBand>

            {/* 2 — HOW IT WORKS */}
            <Section>
                <MarketingHeading
                    eyebrow="HOW IT WORKS"
                    lead="Up and running in three steps."
                    muted="No setup, no jargon."
                />
                <div className="mt-12">
                    <StepList steps={STEPS} variant="bare" />
                </div>
            </Section>

            {/* 3 — IT'S JUST A BUTTON */}
            <Section tone="muted">
                <div className="grid items-center gap-12 md:grid-cols-2">
                    <div>
                        <MarketingHeading
                            eyebrow="USING IT IN REAL LIFE"
                            lead="It’s just a button."
                            muted="Like “Sign in with Google,” but you own it."
                            body="On any app that supports OrangeCheck, you’ll see a “Continue with OrangeCheck” button. Tap it, approve, and you’re in."
                        />
                        <div className="mt-6 flex flex-wrap gap-2">
                            <Badge variant="brand" className="gap-1">
                                <Check className="size-3" /> Tap the button
                            </Badge>
                            <Badge variant="brand" className="gap-1">
                                <Check className="size-3" /> Approve
                            </Badge>
                            <Badge variant="brand" className="gap-1">
                                <Check className="size-3" /> You’re in
                            </Badge>
                        </div>
                    </div>
                    <SignInCardMock />
                </div>
            </Section>

            {/* 4 — WHY MORE THAN A LOGIN */}
            <Section>
                <MarketingHeading
                    eyebrow="WHY IT’S MORE THAN A LOGIN"
                    lead="A normal login belongs to them."
                    muted="This one belongs to you."
                />
                <div className="mt-12 grid items-start gap-12 md:grid-cols-2">
                    <AccentList items={WHY_LIST} />
                    <FeatureCard
                        tone="muted"
                        align="center"
                        elevation="none"
                        icon={<Lock />}
                        title="Yours, and only yours"
                        className="py-10"
                    >
                        No company can ban it, delete it, or lock you out. It works even if an app
                        disappears.
                    </FeatureCard>
                </div>
            </Section>

            {/* 5 — THE DIFFERENCE */}
            <Section>
                <MarketingHeading eyebrow="THE DIFFERENCE" lead="See it side by side." />
                <div className="mt-10">
                    <ComparisonTable rows={COMPARISON} />
                </div>
            </Section>

            {/* 6 — EVERYTHING */}
            <Section tone="muted">
                <MarketingHeading
                    eyebrow="EVERYTHING YOUR ACCOUNT CAN DO"
                    lead="One account."
                    muted="A lot more than a login."
                />
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {CAPABILITIES.map((c) => (
                        <FeatureCard key={c.title} icon={c.icon} iconTone="peach" title={c.title}>
                            {c.body}
                        </FeatureCard>
                    ))}
                </div>
            </Section>

            {/* 7 — GET PAID (brand band) */}
            <BrandBand>
                <MarketingHeading
                    tone="onBrand"
                    eyebrow="EARN WHILE YOU’RE AT IT"
                    lead="Get paid to be yourself."
                    body="Apps lose real money to bots and fake accounts. When you prove you’re a genuine person, a little of that value comes back to you."
                />
                <div className="mt-12">
                    <StepList
                        tone="onBrand"
                        variant="card"
                        steps={[
                            { title: 'An app checks you’re real', children: 'A quick, private confirmation. No personal details shared.' },
                            { title: 'You get a small reward', children: 'A few sats land in your account. Sats are tiny amounts of Bitcoin.' },
                            { title: 'It adds up quietly', children: 'A little more each time you verify. Ignore it, or cash it out later.' },
                        ]}
                    />
                </div>
                <div className="mt-8 max-w-2xl">
                    <AccentNote tone="onBrand">
                        This won’t replace your income. It’s a small thank-you for being a real person
                        on a web full of bots.
                    </AccentNote>
                </div>
            </BrandBand>

            {/* 8 — OUR PROMISES */}
            <Section>
                <MarketingHeading eyebrow="OUR PROMISES" lead="Things we’ll never do." />
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {PROMISES.map((p) => (
                        <FeatureCard key={p.title} icon={p.icon} iconTone="dark" title={p.title}>
                            {p.body}
                        </FeatureCard>
                    ))}
                </div>
            </Section>

            {/* 9 — FOR BUSINESS (forced-dark band) */}
            <Section tone="dark">
                <MarketingHeading
                    eyebrow="FOR APPS AND BUSINESSES"
                    lead="Know your users are real."
                    muted="Without holding their data."
                    body="Add a “Continue with OrangeCheck” button to your app. Your users sign in with an account they already own, and you get verified, real people."
                />
                <div className="mt-12 grid gap-6 md:grid-cols-2">
                    {BUSINESS.map((b) => (
                        <FeatureCard
                            key={b.title}
                            orientation="horizontal"
                            icon={b.icon}
                            iconTone="peach"
                            title={b.title}
                        >
                            {b.body}
                        </FeatureCard>
                    ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                    <Button className="rounded-full px-6">Read the docs</Button>
                    <Button variant="outline" className="rounded-full px-6">
                        Talk to us
                    </Button>
                </div>
            </Section>

            {/* 10 — QUESTIONS + FOOTER CTA */}
            <Section>
                <MarketingHeading eyebrow="QUESTIONS" lead="Everything you might be wondering." />
                <div className="mt-8 max-w-3xl">
                    <Faq items={FAQ} defaultOpen={0} />
                </div>
            </Section>

            <BrandBand>
                <div className="mx-auto max-w-2xl text-center">
                    <TwoToneHeading
                        tone="onBrand"
                        lead="One account. Every app."
                        muted="Yours for good."
                        className="justify-center"
                    />
                    <p className="text-primary-foreground/85 mt-4 text-lg">
                        Be first to claim yours. We’ll email you the moment it opens, and nothing else.
                    </p>
                    <div className="mt-8 flex justify-center">
                        <EmailCapture
                            tone="onBrand"
                            note="No spam. Just one email when it’s ready."
                            className="w-full max-w-md"
                        />
                    </div>
                </div>
            </BrandBand>
        </div>
    );
}

const meta = {
    title: 'Themes/Ember Showcase',
    parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The full orangecheck.io redesign in the ember skin, edge-to-edge. Opens in
 * ember/light. (See `AnySkin` to flip skins, `LightAndDark` for both modes.)
 */
export const Flagship: Story = {
    parameters: { layout: 'fullscreen', bareSurface: true },
    globals: { skin: 'ember', mode: 'light' },
    render: () => <Page />,
};

/**
 * Ember in both modes at once, self-controlled (ignores the toolbar) so light
 * and dark are visible side by side.
 */
export const LightAndDark: Story = {
    parameters: { layout: 'fullscreen', disableGlobalTheme: true },
    render: () => (
        <div className="flex flex-col gap-10">
            {(['light', 'dark'] as const).map((mode) => (
                <div
                    key={mode}
                    data-oc-theme="ember"
                    className={cn(
                        'bg-background text-foreground overflow-hidden rounded-xl border',
                        mode === 'dark' && 'dark'
                    )}
                >
                    <Page />
                </div>
            ))}
        </div>
    ),
};

/**
 * The same page, driven by the Skin + Mode toolbars. Flip Skin (ember →
 * orangecheck / phosphor / lightning / gold) or Mode (light → dark) and watch
 * the identical markup recolour — the proof that this redesign is a skin, not a
 * rebuild. Built entirely from @orangecheck/design components.
 */
export const AnySkin: Story = {
    parameters: { layout: 'fullscreen', bareSurface: true },
    render: () => <Page />,
};
