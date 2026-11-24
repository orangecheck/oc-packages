// Fedimint's client-root derivation run through Fedimint's own HKDF crate and
// rust-bip39 2.2.2 (fedimint v0.13.0's pin). The DerivableSecret steps below
// are copied from fedimint v0.13.0 (264ebf22) crypto/derive-secret/src/lib.rs
// and fedimint-client-module/src/secret.rs (get_default_client_secret).
// fedimint-hkdf 0.9.1 builds on Rust 1.85; its HKDF differs from 0.13.0's only
// in `%` for `is_multiple_of` and two PRK (de)serialisers it lacks, so the
// program prints DerivableSecret::to_random_bytes::<32>() of each secret.
// keys/test/derive.test.ts pins what it prints.
//
//   cargo run --release -- <W as 64 hex> <federation id as 64 hex>
use bitcoin_hashes::sha512::Hash as Sha512;
use hkdf::Hkdf;

const CHILD_TAG: &[u8; 8] = b"childkey";

fn tagged_derive(tag: &[u8; 8], derivation: u64) -> [u8; 16] {
    let mut info = [0u8; 16];
    info[0..8].copy_from_slice(&tag[..]);
    info[8..16].copy_from_slice(&derivation.to_be_bytes()[..]);
    info
}

fn child_key(k: &Hkdf<Sha512>, cid: u64) -> Hkdf<Sha512> {
    Hkdf::from_prk(k.derive_hmac(&tagged_derive(CHILD_TAG, cid)))
}

fn federation_key(k: &Hkdf<Sha512>, fid: &[u8; 32]) -> Hkdf<Sha512> {
    let tag: [u8; 8] = fid[..8].try_into().unwrap();
    Hkdf::from_prk(k.derive_hmac(&tagged_derive(&tag, 0)))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let entropy = hex::decode(&args[1]).unwrap();
    let fid: [u8; 32] = hex::decode(&args[2]).unwrap().try_into().unwrap();
    let mnemonic = bip39::Mnemonic::from_entropy(&entropy).unwrap();
    // Bip39RootSecretStrategy::to_root_secret: DerivableSecret::new_root(seed(""), b"Fedimint Client Salt")
    let root = Hkdf::<Sha512>::new(mnemonic.to_seed_normalized("").as_ref(), Some(b"Fedimint Client Salt"));
    // DerivableSecret::to_random_bytes::<32>(): derive(tagged_derive(b"rawbytes", 0)).
    let raw = |k: &Hkdf<Sha512>| hex::encode(k.derive::<32>(&tagged_derive(b"rawbytes", 0)));
    println!("root_raw32 {}", raw(&root));
    let client = child_key(&child_key(&federation_key(&child_key(&root, 0), &fid), 0), 0);
    println!("client_raw32 {}", raw(&client));
}
