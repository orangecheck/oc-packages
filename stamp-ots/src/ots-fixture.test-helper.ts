// A real OpenTimestamps proof: opentimestamps-client examples/hello-world.txt.ots,
// committing to sha256("Hello World!\n") and anchored in Bitcoin block 358391.

import { base64Decode } from './base64.js';

export const HELLO_DIGEST = '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340';

export const HELLO_OTS_FILE = base64Decode(
    'AE9wZW5UaW1lc3RhbXBzAABQcm9vZgC/ieLohOiSlAEIA7ogTlDRJuRnTABeBNguhMITZngK8fQ71Uo3gWtqs0AD' +
    '8cgBAQAAAAHkgvnTLsw7ple2nYmAEIV7VEV6kEl5gv9W+XxOxY5vmAEAAABrSDBFAiEAslOt0dHPkIRDOKR1oE/x' +
    'P8nnvSQrB3Yt6gf1YIst42cCIACyaMqcM0KzdpzdBiiRMXzc74eqwxC2hV6dk4mOu+jsASECDY5NEH0rM5sAUO/d' +
    'S0oJJFqgVgSPElOWN06moqsHCcb/////AmUz5gUAAAAAGXapFAvwV9QPu6Z0SGJRX1tVojEN5XcviKyghgEAAAAA' +
    'ABl2qRTwBoisAAAAAAgI8SCph/cWxTORPDFMeONdNYhMrJQ/pCysSdKyxp9AA/hfiAgI8SDexVs0h+Hj9yKkm1Wn' +
    'eDIVhieF9KOss5KEYBn3HcZKnQgI8SCyyhj0heCAR44CXas9RktBbA4ey2Ypya786MghTQQkMggI8CARsOkGYRlv' +
    '9LCBPD7aFBurXpFgSDe996DJ3zfbDjoRmAgI8CDDS8GkoQk//RSMAWseZkdCkU6Tnvq+TT01ZRWRSybZ4ggI8CDD' +
    '5ufDjGn2ryTCvjTrrEglft5h7AohuVNeREMne+MGRggI8SAHmL+GBuAAJOXV1UvwyWD2Kd+52taRV0VbbyZSwOje' +
    'gQgI8CA/mtptYLqiRABrsKrVFEitL6+51LZIegmZz/JrkfD1NggI8SDHAwGelZqN0/rvdIm7MoukhVdHWOcJHwFG' +
    'TrZYcsl1yAgI8CDL/v/1E/+EuRXj/tb515lnZjD4Nk6ipsdVf62UpbXXiAgI8SAL4jcJhZkTur1EYLvd+O0hPnyH' +
    'c6Sx+s4w+Kz98JO3BQgIAAWIlg1z1xkBA/fvFQ==');

export const BLOCK_HEIGHT = 358391;
export const BLOCK_HASH = '000000000000000003e892881a8cdcdc117c06d444057c98b6f04a9ee75a2319';
export const BLOCK_HEADER_HEX =
    '02000000b96394585a281b7e5f438fd1c9ed492645a1fd61cb3802040000000000000000007ee445d23ad061af4a36b809501fab1ac4f2d7e7a739817dd0cbb7ec661b8a1e376755f58616186272def6';
