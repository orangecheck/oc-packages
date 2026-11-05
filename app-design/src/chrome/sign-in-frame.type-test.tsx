// Type tests, checked by `yarn type-check` and never built: a sign-in page always has a way out.
import { SignInFrame } from './sign-in-frame';

export const signInFrameTypeTests = [
    <SignInFrame key="page">form</SignInFrame>,
    // A popup draws its own Close where Back to home would be.
    <SignInFrame key="popup" homeLink={false} back={<button type="button">Close</button>}>
        form
    </SignInFrame>,
    // @ts-expect-error without its home link the frame needs a back of its own
    <SignInFrame key="no-back" homeLink={false}>
        form
    </SignInFrame>,
    // @ts-expect-error null leaves the back out, so it is no way out either
    <SignInFrame key="null-back" homeLink={false} back={null}>
        form
    </SignInFrame>,
];
