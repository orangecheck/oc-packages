/** Storybook stub for next/router — a no-op router so composites render. */
export function useRouter() {
    return {
        pathname: '/',
        route: '/',
        asPath: '/',
        basePath: '',
        query: {} as Record<string, string>,
        isReady: true,
        push: async () => true,
        replace: async () => true,
        prefetch: async () => undefined,
        back: () => undefined,
        forward: () => undefined,
        reload: () => undefined,
        beforePopState: () => undefined,
        events: { on: () => undefined, off: () => undefined, emit: () => undefined },
    };
}

export default { useRouter };
