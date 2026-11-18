// Type tests, checked by `yarn type-check` and never built: a page with no code says what happened.
import { ErrorPage } from './error-page';

export const errorPageTypeTests = [
    <ErrorPage key="404" code={404} />,
    <ErrorPage key="403" code={403} title="Not on the owner allowlist" />,
    <ErrorPage key="none" title="Not signed in to ochk.io" detail="There is nothing left to end here." />,
    // @ts-expect-error with no code there are no default words to fall back on
    <ErrorPage key="bare" />,
    // @ts-expect-error a title alone leaves the line under it to a code it does not have
    <ErrorPage key="title-only" title="Signed out" />,
    // @ts-expect-error a line alone leaves the heading to a code it does not have
    <ErrorPage key="detail-only" detail="There is nothing left to end here." />,
    // @ts-expect-error an empty title draws an empty heading
    <ErrorPage key="title-undefined" title={undefined} detail="There is nothing left to end here." />,
    // @ts-expect-error an empty line draws an empty paragraph
    <ErrorPage key="detail-null" title="Signed out" detail={null} />,
];
