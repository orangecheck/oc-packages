// BIP-322 verification in vote-core's named-argument shape. Returns false on
// any parse or verify failure.

export async function bip322Verify(args: {
    address: string;
    message: string;
    signature: string;
}): Promise<boolean> {
    try {
        const mod = (await import('bip322-js')) as unknown as {
            Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
            default?: {
                Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
            };
        };
        const Verifier = mod.Verifier ?? mod.default?.Verifier;
        if (!Verifier) return false;
        return Verifier.verifySignature(args.address, args.message, args.signature);
    } catch {
        return false;
    }
}
