# @orangecheck/legal

Family-internal legal-document engine for the `.ochk.io` sub-sites. **Not for
third-party integration.**

It composes **Terms of Service** and **Privacy Policy** pages from one shared
clause library plus per-profile content, so the whole family stays in sync
from a single source of truth — while the commercial products keep the
variants they genuinely need.

## Why this exists

The ecosystem outgrew "one Terms page on ochk.io". The non-custodial protocol
sites, a consumer product that pays users in sats, a paid encrypted vault, and
an enterprise B2B product cannot share one legal document. This package keeps
the boilerplate shared and the divergence explicit.

## Profiles

| Profile    | Sites                                                             |
|------------|-------------------------------------------------------------------|
| `protocol` | ochk.io + the six verb sites + docs + analytics (one shared doc)  |
| `me`       | me.ochk.io — consumer identity that pays users in sats            |
| `vault`    | vault.ochk.io — paid end-to-end-encrypted secrets vault           |
| `fleet`    | fleet.ochk.io — enterprise managed agent infrastructure           |

The nine `protocol` sites do **not** host their own pages — their footers link
to ochk.io. Only the three commercial products self-host.

## Usage

```tsx
// src/pages/terms.tsx on a self-hosting site
import { buildDoc, LegalDocument } from '@orangecheck/legal';
import { Seo } from '@/components/layout/Seo';

const doc = buildDoc('me', 'terms'); // pure + synchronous

export default function TermsPage() {
    return (
        <>
            <Seo title={doc.metaTitle} description={doc.metaDescription} canonical="/terms" />
            <div className="container py-12">
                <LegalDocument doc={doc} />
            </div>
        </>
    );
}
```

Tailwind 4 must scan the package so its utility classes emit. In `globals.css`:

```css
@source '../../node_modules/@orangecheck/legal';
```

Footer links resolve through one helper:

```ts
import { legalHref } from '@orangecheck/legal';
legalHref('me', 'terms');     // → '/terms'
legalHref('stamp', 'terms');  // → 'https://ochk.io/terms'
```

Security pages stay bespoke per product but share the disclosure block:

```tsx
import { SecurityDisclosure } from '@orangecheck/legal';
<SecurityDisclosure securityContact="security@ochk.io" />
```

## Authoring

- Shared clauses live in `src/content/clauses.ts`.
- Each profile composes them in `src/content/<profile>.ts`.
- Strings use `[[TOKEN]]` placeholders (`ENTITY`, `PRODUCT`, `HOST`, `CONTACT`,
  `SECURITY_CONTACT`, `GOVERNING_LAW`, `ARBITRATION_SEAT`) resolved by
  `buildDoc`.
- A `stub` block renders a visible **"pending · counsel review"** notice — used
  for money, custody, refund, SLA, and regulated-activity sections that must be
  finalized by counsel before the commercial products reach general
  availability.

### Entity of record

No formal legal entity is registered yet. `LEGAL_ENTITY` in `src/constants.ts`
is the single swap point — set it (and `LEGAL_ENTITY_LONG`) when the entity is
formed, rebuild, and publish; every document family-wide updates.

## Build

```
npm install
npm run build
```
