# V1 components: first CI invocation

7 November 2026. Result: **failed before installation**. No application check
or generated artifact passed in this invocation.

- [Run 42422451332](https://github.com/alvarovillalbaa/mcpcn-ui/actions/runs/42422451332),
  job `128553594276`.
- Checked source `925beb3771d5520fe7c9a272ad1b37b1a585a207`; workflow commit
  `879a51c67a2d47d11228aad0bb2b4d6d57350ca9`. These identities are distinct.
- Node `24.22.2`; no dependency installation, package or docs build, generation,
  unit test, installed-consumer or browser case ran.

The controller rejected `source_secret_or_dependency_path` during source
export. The only matching tracked path is the root `.npmrc`: 84 public bytes
containing `auto-install-peers=true`, `strict-peer-dependencies=false` and
`link-workspace-packages=true`. It is not a credential file. The new controller
guard had rejected this existing workspace input before installation.

The next candidate allows only that exact root path with those exact three
lines and final newlines. Other `.npmrc` paths/content and the existing secret
and dependency exclusions remain rejected. No check is disabled or reclassified.

The [original receipt](v1-components-attempt-1-originals/receipt.json) records
two passing original-source guards with identical 369-file byte/mode/Git-blob
and filesystem vectors. All eight guard commands exited normally with complete
sixteen stdout/stderr streams and absent groups. Owned cleanup passed: scratch
root removed, zero remaining owned processes, no signals, no uncertain reads
and no scanner errors. This establishes cleanup of this failed invocation,
not application acceptance.

The [decode manifest](v1-components-attempt-1-originals/decode-manifest.json)
binds all 17 originals and 46 chunks: 394,117 decoded bytes and 66,702 gzip bytes.
Canonical base64, single-member gzip completion without trailing data, lengths
and SHA256 were independently verified. The original receipt is 329,483 bytes,
SHA256 `7147aedba6e392fa88c21fdb8e597e49bc489fc117a2d385d71ad8fb74c12e65`.
The complete original job log is retained outside Git: 116,127 UTF-8 bytes,
SHA256 `46714d93084c45a2fd5c491398b3b43164d5e7c6faec69f91769274aafbf4614`.
It is not duplicated into the repository alongside the decoded originals.

One publication-order deviation is also retained: `update_ref` returned 422
because it does not create an absent branch. The controller was dispatched
with the valid immutable source SHA before the separate supported
`create_branch` call created `qa/mcpcn-v1-components-20261107` at that SHA.
Checkout and both source guards bound the intended commit. The branch did not
exist at dispatch; the retry must verify its head before dispatching. This
ordering error does not explain or waive the separate export-guard failure.
