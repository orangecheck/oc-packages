// Secret-mode commit per SPEC §4.4.
//
//   commit_msg := "oc-vote/v0/commit\npoll_id: <hex>\nvoter: <addr>\noption: <id>\n"
//   commit    := hex(SHA256(commit_msg))
//
// The commit binds the ballot id to the hashed chosen option so the voter
// cannot sign one ballot and claim a different option at reveal time.

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export function buildCommitMessage(
    pollId: string,
    voter: string,
    option: string
): string {
    return (
        'oc-vote/v0/commit\n' +
        'poll_id: ' + pollId + '\n' +
        'voter: ' + voter + '\n' +
        'option: ' + option + '\n'
    );
}

export function commit(pollId: string, voter: string, option: string): string {
    const msg = buildCommitMessage(pollId, voter, option);
    return bytesToHex(sha256(new TextEncoder().encode(msg)));
}
