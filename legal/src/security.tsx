/**
 * @orangecheck/legal — shared security-disclosure block.
 *
 * Security pages stay bespoke per product (each describes a different custody
 * and data posture), but the *vulnerability-disclosure mechanics* should be
 * identical family-wide. Drop `<SecurityDisclosure>` into any bespoke
 * `/security` page to get a consistent "how to report / what to expect" block.
 */

export interface SecurityDisclosureProps {
    /** Security contact mailbox. */
    securityContact?: string;
    /** Heading shown above the block. Pass `null` to omit. */
    heading?: string | null;
}

export function SecurityDisclosure({
    securityContact = 'security@ochk.io',
    heading = 'responsible disclosure',
}: SecurityDisclosureProps) {
    return (
        <div className="font-mono text-sm leading-relaxed">
            {heading && (
                <h2 className="font-display text-foreground mb-4 text-lg font-bold tracking-wider uppercase">
                    {heading}
                </h2>
            )}

            <div className="border-primary/30 bg-primary/[0.03] mb-4 border px-4 py-3 text-xs leading-relaxed">
                <span className="text-primary mr-2">{'!! '}</span>
                <span className="text-foreground">
                    Don&apos;t open public GitHub issues for exploitable bugs. Public disclosure
                    before a fix ships puts everyone using the protocol at risk.
                </span>
            </div>

            <p className="text-muted-foreground mb-4">
                Email{' '}
                <a
                    href={`mailto:${securityContact}`}
                    className="text-primary underline decoration-dotted underline-offset-3"
                >
                    {securityContact}
                </a>{' '}
                — use PGP for highly sensitive findings; the fingerprint and key are published at{' '}
                <a
                    href="https://github.com/orangecheck/.github/blob/main/SECURITY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                >
                    github.com/orangecheck/.github/SECURITY.md
                </a>
                . Alternatively, open a private GitHub security advisory on the most relevant{' '}
                <code className="text-[0.95em]">orangecheck/*</code> repository.
            </p>

            <ul className="divide-y border text-xs">
                {(
                    [
                        ['acknowledgement', 'within 72 hours of receipt'],
                        [
                            'triage',
                            'within 7 days — whether we agree it is a vulnerability, the severity assigned, and a target fix date',
                        ],
                        [
                            'coordinated disclosure',
                            'we credit you (unless you prefer anonymity) and publish an advisory once the fix ships',
                        ],
                        [
                            'bounty',
                            'no paid bounty program yet — the ecosystem is young; we are grateful for responsible disclosure',
                        ],
                    ] as const
                ).map(([k, v]) => (
                    <li key={k} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5">
                        <span className="text-primary w-44 flex-shrink-0 font-bold tracking-widest uppercase">
                            {k}
                        </span>
                        <span className="text-muted-foreground flex-1">{v}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
