import { verifySignature } from '@orangecheck/bip322';

// BIP-322 verification in vote-core's named-argument shape. Returns false on
// any parse or verify failure.

export async function bip322Verify(args: {
    address: string;
    message: string;
    signature: string;
}): Promise<boolean> {
    return verifySignature(args.address, args.message, args.signature);
}
