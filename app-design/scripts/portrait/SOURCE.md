# The portrait's source

`source.webp` is the one picture every portrait in the package comes from: ParticlePortrait's dots and
posters, HalftoneCanvas's tone, the deck screen and HalftoneSphere's `art/portrait-halftone-*.webp`.
`node scripts/portrait/build.mjs` writes them all from it and `portrait.json`; `--check` fails when a
committed file differs from a fresh run.

**It is generated. It depicts no real person.** It is a text-to-image picture made on a local machine
from the prompt below, with no reference image, no person named and no likeness asked for. The woman in
it does not exist. Nothing was sent to a third-party service.

## Generator

| Part | What | Licence | Pinned |
|---|---|---|---|
| Diffusion model | Z-Image-Turbo (Tongyi-MAI), GGUF Q8_0 by leejet | Apache-2.0: [model card](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/blob/f332072aa78be7aecdf3ee76d5c247082da564a6/README.md), [LICENSE](https://github.com/Tongyi-MAI/Z-Image/blob/26f23eda626ffadda020b04ff79488e1d72004cd/LICENSE) | [`leejet/Z-Image-Turbo-GGUF@c61c0e42`](https://huggingface.co/leejet/Z-Image-Turbo-GGUF/blob/c61c0e422dc8b541b7548cf33a4ef8302b0f8085/z_image_turbo-Q8_0.gguf) `z_image_turbo-Q8_0.gguf`, sha256 `df1c5baa86d1398c979495a6072dbcee79444fdb884a2445582ba0769c44e9a1` |
| Text encoder | Qwen3-4B-Instruct-2507, GGUF Q8_0 by unsloth | Apache-2.0: [LICENSE](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/cdbee75f17c01a7cc42f958dc650907174af0554/LICENSE) | [`unsloth/Qwen3-4B-Instruct-2507-GGUF@a06e946b`](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/blob/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q8_0.gguf) `Qwen3-4B-Instruct-2507-Q8_0.gguf`, sha256 `391c1e410fd9f4cf2de2b510273b56a84c19ce18f4fa3bfb3774031dac4ef068` |
| VAE | FLUX.1 autoencoder (Black Forest Labs), as packaged by Comfy-Org | Apache-2.0: [FLUX.1-schnell card](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | [`Comfy-Org/Z-Image-Turbo@6fc90a3b`](https://huggingface.co/Comfy-Org/Z-Image-Turbo/blob/6fc90a3b1b653e935a0d175e260736de25b84df5/split_files/vae/ae.safetensors) `split_files/vae/ae.safetensors`, sha256 `afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38` |
| Runtime | stable-diffusion.cpp, Vulkan build for Ubuntu 24.04 | MIT | [`master-1043-3be2378`](https://github.com/leejet/stable-diffusion.cpp/releases/tag/master-1043-3be2378) |
| Matte | rembg 2.0.86 with BiRefNet-portrait | MIT ([rembg](https://github.com/danielgatis/rembg), [BiRefNet](https://github.com/ZhengPeng7/BiRefNet)) | `BiRefNet-portrait-epoch_150.onnx`, sha256 `1ba1c8ff5a7bbfadc8d8d13fb11d7be793f91f23d9d466549e37a854f6668f99` |

Apache-2.0 and MIT put no restriction on what the models produce, and allow commercial use.

## The picture

- Prompt, exactly:

  > Black and white portrait photograph, head and shoulders, framed from the upper chest up with space above her head. Her face is turned in a three-quarter view toward the left of the frame, her eyes looking at the viewer, a soft warm closed-mouth smile. A beautiful woman in her late twenties with light shoulder-length hair tucked behind one ear and light freckles. She wears a plain light grey crew-neck sweater. Classic Rembrandt lighting from a single source high on the left: the lit side of her face is bright, the far side falls into deep shadow with a small triangle of light on the cheek, the shadow under her jaw is clear. Plain dark charcoal background. Fine grain, natural skin texture, sharp focus on the eyes, timeless fine-art portrait photography, elegant and tasteful.

- Seed `2401`; 1024 × 1024; `--cfg-scale 1.0 --steps 8`, Euler with the discrete scheduler (the runtime's
  defaults for Z-Image). The generated PNG's sha256 is
  `c25b7f6ebd856704708019cf9d644234429a41488de4952f8eb14c2ed96a0bf7`.
- Matte: BiRefNet-portrait's mask over the whole frame, kept as the alpha.
- Frame: a square 1100 source pixels wide whose top-left is at (-54, -32), transparent past the picture's
  edge, resized to 768 with Lanczos and written as WebP: the picture lossy at quality 92, the alpha
  lossless. `source.webp`'s sha256 is `8a4015b1deef7db420a72bfc4183d54578e8c0d374f92c631563b585210152fc`.

## Replacing it

A new source is square, head and shoulders, with the person's matte as its alpha. Put it here as
`source.webp`, set the named places in `portrait.json` (each a point on the figure, in the unit square),
run `node scripts/portrait/build.mjs`, and replace this file's record. A photograph of a real person
needs that person's written licence for this use first.
