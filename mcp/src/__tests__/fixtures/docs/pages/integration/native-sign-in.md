# Sign in from an app or a game

A desktop build or a game can't open the sign-in popup, and it can't keep a
secret: anyone can read what ships in it. So it signs the player in through
their own browser. The app listens on `127.0.0.1`, opens orangecheck, and gets a
one-time code back. Your server trades the code for the same token the popup
gives, bound to your site. Nothing secret is in the app.

It works for live projects and test projects. A test project signs in its own
developer and nobody else. It needs `@orangecheck/me-client` 0.50.0 or
`orangecheck` 3.6.0 on your server.

## How it works

1. The app picks a free port on `127.0.0.1`, makes a random verifier and its
   SHA-256 challenge (PKCE, RFC 7636), and opens
   `https://ochk.io/native/authorize` in the player's browser.
2. The player signs in there as usual. orangecheck asks every time, "Sign in to
   an app on this device?", and names your project, the website the sign-in is
   for and the player's account. A native app can't prove which app it is, so
   the player is the check. On a test project anyone but its developer is told
   "This app is in testing. Only its developer can sign in to it." and gets no
   code.
3. The browser comes back to `http://127.0.0.1:<port>/<path>?code=…&state=…`.
   The app checks `state` and shows a page that says to go back to the game.
4. The app sends the code, its verifier and its redirect to your server. Your
   server trades them with `exchangeNativeCode` (or `exchange_native_code`),
   which checks the token as your popup route does, and starts its own session
   only on `valid`.

A code works once, for a minute, and only with the verifier its challenge was
made from, for your project and the exact redirect it was sent to. A sign-out
everywhere ends any code not yet traded.

### What reaches your loopback

Only two answers ever come back to the app, each with your `state`: `code`, or
`error=access_denied` when the player presses Cancel. Every other stop keeps the
player on ochk.io's page, which says why, and sends nothing back: a test
project's stranger, sign-in from apps turned off, a frozen project, a bad
redirect, state or challenge, an audience the project doesn't offer, or too many
sign-ins at once. So the app always needs a way to stop waiting: a Cancel that
calls `stop()`, and a timeout.

## Turn it on

On [ochk.app](https://ochk.app/me/projects), open the project, then **Sign-in →
Sign in from apps**. The token is bound to an address the project proves:

- A live project needs a verified domain, and signs in for it alone.
- A test project uses its verified domain, or else its development origin (on
  the same page).

Going live keeps it on when the domain is verified, and turns it off otherwise.
It works only while the project's orangecheck sign-in is on; turning that off
pauses it, and turning it back on brings it back. A frozen project signs nobody
in, from an app or anywhere else.

## The app: Godot 4

One script, no plugins, typed throughout, so it loads in a project that treats
GDScript warnings as errors. Add it as a node, set `project_key` and `audience`,
connect the two signals and call `start()`. Give the player a Cancel that calls
`stop()`: most refusals never come back to the game (see
[what reaches your loopback](https://ochk.io/docs/integration/native-sign-in#what-reaches-your-loopback)).

```gdscript
class_name OrangecheckSignIn
extends Node
## Sign a player in with orangecheck through their own browser.

## The browser came back with a code: post all three to your server.
signal code_received(code: String, code_verifier: String, redirect_uri: String)
## No code: "access_denied" (the player said no), "timeout" or "listen_failed".
signal failed(reason: String)

@export var project_key: String = ""
## The site your server checks tokens for, one your project proves. Empty: its
## verified domain, or a test project's development origin when it has none.
@export var audience: String = ""
@export var auth_host: String = "https://ochk.io"
@export var timeout_seconds: float = 300.0
## False to show the link yourself (a console, a QR code) instead of opening the browser.
@export var open_browser: bool = true

const CALLBACK_PATH: String = "/oc/callback"
## The most of one request read: its request line is all that is used.
const MAX_HEAD: int = 8192
## How many connections wait at once, and for how long each may take to send its request.
const MAX_PEERS: int = 16
const PEER_MS: int = 5000

var _server: TCPServer = null
var _peers: Array[StreamPeerTCP] = []
var _heads: Dictionary[StreamPeerTCP, PackedByteArray] = {}
var _since: Dictionary[StreamPeerTCP, int] = {}
var _verifier: String = ""
var _state: String = ""
var _redirect_uri: String = ""
var _deadline_ms: int = 0


func _ready() -> void:
	set_process(_server != null)


## Start a sign-in: opens the player's browser at ochk.io. Returns the link, or "" on failure.
func start() -> String:
	stop()
	_server = TCPServer.new()
	# 127.0.0.1 only, any free port: never "localhost", which a hosts file can move.
	if _server.listen(0, "127.0.0.1") != OK:
		_server = null
		failed.emit("listen_failed")
		return ""
	_redirect_uri = "http://127.0.0.1:%d%s" % [_server.get_local_port(), CALLBACK_PATH]
	var crypto: Crypto = Crypto.new()
	_verifier = _b64url(crypto.generate_random_bytes(32))
	_state = _b64url(crypto.generate_random_bytes(16))
	var sha: HashingContext = HashingContext.new()
	var _started: Error = sha.start(HashingContext.HASH_SHA256)
	var _updated: Error = sha.update(_verifier.to_ascii_buffer())
	var query: Dictionary[String, String] = {
		"project": project_key,
		"redirect_uri": _redirect_uri,
		"state": _state,
		"code_challenge": _b64url(sha.finish()),
		"code_challenge_method": "S256",
	}
	if audience != "":
		query["audience"] = audience
	_deadline_ms = Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	set_process(true)
	var url: String = auth_host + "/native/authorize?" + _encode(query)
	if open_browser:
		var _opened: Error = OS.shell_open(url)
	return url


## Stop listening without a result: a Cancel button calls this.
func stop() -> void:
	set_process(false)
	for peer: StreamPeerTCP in _peers:
		peer.disconnect_from_host()
	_peers.clear()
	_heads.clear()
	_since.clear()
	if _server != null:
		_server.stop()
		_server = null


func _process(_delta: float) -> void:
	if _server == null:
		return
	var now: int = Time.get_ticks_msec()
	if now > _deadline_ms:
		stop()
		failed.emit("timeout")
		return
	while _server != null and _server.is_connection_available():
		var peer: StreamPeerTCP = _server.take_connection()
		# Full: the oldest gives way, so a stalled connection can't keep the browser out.
		if _peers.size() >= MAX_PEERS:
			var oldest: StreamPeerTCP = _peers[0]
			oldest.disconnect_from_host()
			_forget(oldest)
		_peers.append(peer)
		_heads[peer] = PackedByteArray()
		_since[peer] = now
	for peer: StreamPeerTCP in _peers.duplicate():
		_read(peer, now)
		if _server == null:
			return


## Reads what one connection sent; answers it once the request's headers are whole.
func _read(peer: StreamPeerTCP, now: int) -> void:
	var _polled: Error = peer.poll()
	if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED or now - _since[peer] > PEER_MS:
		peer.disconnect_from_host()
		_forget(peer)
		return
	var head: PackedByteArray = _heads[peer]
	var available: int = peer.get_available_bytes()
	if available > 0:
		var got: Array = peer.get_partial_data(mini(available, MAX_HEAD - head.size()))
		var status: int = got[0]
		if status == OK:
			var data: PackedByteArray = got[1]
			head.append_array(data)
			_heads[peer] = head
	# A request can arrive in pieces: wait for the blank line that ends its headers.
	var text: String = head.get_string_from_utf8()
	if not text.contains("\r\n\r\n") and head.size() < MAX_HEAD:
		return
	_forget(peer)
	_answer(peer, text)


func _forget(peer: StreamPeerTCP) -> void:
	_peers.erase(peer)
	var _head_gone: bool = _heads.erase(peer)
	var _since_gone: bool = _since.erase(peer)


func _answer(peer: StreamPeerTCP, head: String) -> void:
	# The request line: GET /oc/callback?code=…&state=… HTTP/1.1
	var line: PackedStringArray = head.get_slice("\r\n", 0).split(" ")
	var target: String = line[1] if line.size() == 3 else ""
	if line.size() != 3 or line[0] != "GET" or target.get_slice("?", 0) != CALLBACK_PATH:
		_reply(peer, 404, "Not found.")
		return
	var params: Dictionary[String, String] = _decode(
		target.get_slice("?", 1) if target.contains("?") else ""
	)
	# Another sign-in's answer, from an old tab say: turn it away and keep waiting.
	if params.get("state", "") != _state:
		_reply(peer, 400, "This isn't the sign-in the game is waiting for. Go back to the game and sign in again.")
		return
	var code: String = params.get("code", "")
	if code != "":
		_reply(peer, 200, "orangecheck sent you back. Go back to the game: it finishes signing you in.")
		var verifier: String = _verifier
		var redirect_uri: String = _redirect_uri
		stop()
		code_received.emit(code, verifier, redirect_uri)
		return
	_reply(peer, 200, "Nothing was signed in. You can close this tab and go back to the game.")
	stop()
	var error: String = params.get("error", "")
	failed.emit(error if error != "" else "access_denied")


func _reply(peer: StreamPeerTCP, status: int, text: String) -> void:
	var body: PackedByteArray = (
		("<!doctype html><meta charset=utf-8><title>orangecheck</title>"
		+ "<p style=\"font:16px system-ui;margin:2em\">%s</p>") % text.xml_escape()
	).to_utf8_buffer()
	var reason: String = {200: "OK", 400: "Bad Request"}.get(status, "Not Found")
	var head: String = (
		"HTTP/1.1 %d %s\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\n"
		+ "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
	) % [status, reason, body.size()]
	var _sent_head: Error = peer.put_data(head.to_utf8_buffer())
	var _sent_body: Error = peer.put_data(body)
	peer.disconnect_from_host()


static func _b64url(bytes: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(bytes).replace("+", "-").replace("/", "_").replace("=", "")


static func _encode(query: Dictionary[String, String]) -> String:
	var parts: PackedStringArray = PackedStringArray()
	for key: String in query:
		var _appended: bool = parts.append("%s=%s" % [key, query[key].uri_encode()])
	return "&".join(parts)


static func _decode(query: String) -> Dictionary[String, String]:
	var out: Dictionary[String, String] = {}
	for pair: String in query.split("&", false):
		var value: String = pair.get_slice("=", 1) if pair.contains("=") else ""
		out[pair.get_slice("=", 0).uri_decode()] = value.replace("+", " ").uri_decode()
	return out
```

Then send the three values to your server and keep whatever session it gives
back:

```gdscript
extends Node

@onready var http: HTTPRequest = $HTTPRequest


func _on_code_received(code: String, code_verifier: String, redirect_uri: String) -> void:
	var body: String = JSON.stringify(
		{"code": code, "code_verifier": code_verifier, "redirect_uri": redirect_uri}
	)
	var _sent: Error = http.request(
		"https://your-game.example/api/orangecheck/native",
		PackedStringArray(["Content-Type: application/json"]),
		HTTPClient.METHOD_POST,
		body
	)
```

## Any other engine

The same steps, in whatever your engine has:

- Listen on `127.0.0.1`, port 0 (any free port). Not `localhost`, which a hosts
  file can point anywhere, and not `[::1]`.
- Make a verifier from 32 random bytes, base64url without padding (43
  characters). The challenge is base64url(SHA-256(verifier)). Make a `state`
  from 16 random bytes the same way.
- Open
  `https://ochk.io/native/authorize?project=<key>&redirect_uri=<url>&state=<state>&code_challenge=<challenge>&code_challenge_method=S256`
  in the system browser. `redirect_uri` is `http://127.0.0.1:<port>/<path>`,
  with no query. Add `&audience=<origin>` for the site your server checks tokens
  for. Without it the token is for the project's verified domain, or a test
  project's development origin when it has none.
- Read each request to the blank line that ends its headers (8 KiB at most)
  before you answer: a request can arrive in pieces.
- Answer only `GET /<path>` whose `state` matches. Another state is another
  sign-in's answer, from an old tab say: reply 400 with a sentence and keep
  waiting. With `code`, reply with a short page and stop listening. With
  `error=access_denied`, the player said no.
- Hold a few connections at most (16 is plenty), drop one that hasn't sent its
  request in about 5 seconds, and when full let the oldest go, so a stalled
  connection can't keep the browser out.
- Send `code`, the verifier and the exact `redirect_uri` to your server. Never
  trade the code in the app: the token is your server's.

## Your server: Node

Set `OC_PROJECT_KEY` and `OC_SIGNING_SECRET` on your server, as for the popup.
The project key comes from your config, never from the app's request: it decides
whose sign-in rule and list of ended sessions apply.

```ts
import {
    exchangeNativeCode,
    MemoryJtiStore,
    spendOnce,
} from '@orangecheck/me-client/server';

declare function startSession(didOc: string): Promise<string>;

// A store every server shares, in production: a unique row, or Redis SET NX.
const spent = new MemoryJtiStore();

export async function nativeSignIn(body: {
    code: string;
    code_verifier: string;
    redirect_uri: string;
}): Promise<{ status: number; session?: string; back_url?: string }> {
    const out = await exchangeNativeCode(
        {
            code: body.code,
            codeVerifier: body.code_verifier,
            redirectUri: body.redirect_uri,
            audience: 'https://your-game.example',
        },
        { projectKey: process.env.OC_PROJECT_KEY }
    );
    if (out.status === 'unavailable') return { status: 503 };
    if (out.status === 'invalid') {
        return out.reason === 'bond_required'
            ? { status: 403, back_url: out.back_url }
            : { status: 401 };
    }
    if (!(await spendOnce(out.session.jti, out.session.exp ?? 0, spent)))
        return { status: 401 };
    return { status: 200, session: await startSession(out.session.did_oc) };
}
```

## Your server: Python

```python
import os

from orangecheck import MemoryJtiStore, NativeSignIn, RevocationList, exchange_native_code, spend_once

spent = MemoryJtiStore()  # in production, a store every server shares
revocations = RevocationList(os.environ["OC_PROJECT_KEY"], os.environ["OC_SIGNING_SECRET"])


def native_sign_in(code: str, code_verifier: str, redirect_uri: str) -> tuple[int, str]:
    got = exchange_native_code(
        code,
        code_verifier,
        redirect_uri,
        "https://your-game.example",
        project_key=os.environ["OC_PROJECT_KEY"],
        revocations=revocations,
    )
    if not isinstance(got, NativeSignIn):
        if got.status == "unavailable":
            return 503, ""
        return (403, got.back_url or "") if got.reason == "bond_required" else (401, "")
    if not spend_once(got.session.jti, got.session.exp, spent):
        return 401, ""
    return 200, got.session.did_oc
```

## What comes back

Start a session only from `valid`. By then the helper has done everything your
popup route does: verified the token for your site, checked it against the list
of ended sessions, and applied your project's "who can sign in" rule. All that
is left is to spend its `jti` once. Don't verify the token again by hand
instead: a hand-rolled check skips the rule and the list.

The token is the popup's: bound to your site, with `rh` for sign out everywhere,
and `azp: "native"` so you can tell how it was made. `invalid_grant` means start
again: the code was spent, expired, or sent with another verifier, redirect or
project. `session_ended` means the player ended their sessions everywhere.
`bond_required` means the account doesn't meet your rule: `back_url` is where
the player backs it, so show it in the game. `unavailable` is an outage, an
unreadable list of ended sessions or rule among them: answer it 503, and have
the app start the sign-in again, since the code may already be spent. `audience`
(me-client 0.63.0, `orangecheck` 3.19.0) means the token is genuine but was made
for another site: the `audience` you pass isn't your site's origin exactly.

### The exchange on the wire

For a stand-in in your own tests. The helper posts JSON to
`https://ochk.io/api/auth/native/token`. The project key goes in the body, with
no key header:

```json
{
    "grant_type": "authorization_code",
    "code": "<code>",
    "code_verifier": "<verifier>",
    "redirect_uri": "http://127.0.0.1:<port>/<path>",
    "project": "pk_live_<key>"
}
```

| ochk.io answers                                                               | The helper's result                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `200 { "ok": true, "token", "token_type": "orangecheck", "audience", "exp" }` | The token, then every check above.                                       |
| `400 { "ok": false, "reason": "invalid_grant" }`                              | `invalid_grant`                                                          |
| `400` with any other `reason` (`unsupported_grant_type`, `invalid_request`)   | `bad_request`                                                            |
| `404`                                                                         | `not_offered`: native sign-in is off.                                    |
| `429`                                                                         | `unavailable`, `rate_limited`: 30 a minute per address, 120 per project. |
| Anything else: a 5xx, a 200 without a token, a timeout                        | `unavailable`, `auth_host_unavailable`.                                  |
