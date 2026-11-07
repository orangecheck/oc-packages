declare module '*.webp' {
    const src: string;
    export default src;
}

// A text file's contents, as Vite's ?raw gives them: the Introduction story reads CHANGELOG.md.
declare module '*.md?raw' {
    const text: string;
    export default text;
}
