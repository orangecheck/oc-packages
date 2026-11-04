/** tsup inlines each baked PNG as base64 (loader `.png: base64`), for ./og's `ogArt` data URIs. */
declare module '*.png' {
    const base64: string;
    export default base64;
}
