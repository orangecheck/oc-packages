// The build inlines each PNG as base64; a bundler that resolves it to a URL instead (Storybook) passes the URL.
export const png = (v: string) => (v.startsWith('iVBORw0KGgo') ? `data:image/png;base64,${v}` : v);
