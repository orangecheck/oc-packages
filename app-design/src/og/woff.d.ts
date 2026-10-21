/** tsup inlines each font as base64 (loader `.woff: base64`), so ./og needs no file at run time. */
declare module '*.woff' {
    const base64: string;
    export default base64;
}
