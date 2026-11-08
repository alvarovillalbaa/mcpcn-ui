# Form-workflow CI process ownership — prospective two-edge protocol

8 November 2026. Applies only to the next changed-source form-workflow packet.
The [fourth failure](../results/2026/11-08/form-workflow-attempt-4.md) remains
failed. Existing product APIs, browser actions, service contracts, compiler
checks, timeouts, resource bounds and unknown-ownership rejection remain.

Direct launched identities and independently nonce-marked descendants keep
their existing rules. The new fallback applies only when a candidate child
has an immediate parent whose fresh bounded environment was readable but lacked
the exact task markers, and its group leader already has independent direct/
nonce provenance. A prior derived identity cannot supply independent ownership.

The sixth candidate also probes readable marker-absent candidates eagerly,
before waiting for an environment-read failure. A pure selector must bind a
fresh group identity to independent direct/nonce provenance and require matching
UID/PGID, distinct identities, ordered post-cutoff start times and no self-parent
shape. The selector grants no ownership. A selected candidate must then pass
the existing complete parent/group or two-edge proof; failure stays fatal as
eager_ownership_unproved. Record trigger readable_nonce_absent and the actual
proof. Off-group selection grants nothing; derived identities remain ineligible
as independent anchors. No deferred retry or weaker late-exit proof is allowed.

Prove exactly child→parent→group-leader, with no recursive ancestor search:

- Fresh kernel identities have equal task UID and PGID, distinct child/parent/
  leader PIDs, and leader.pid equals its PGID.
- child.ppid equals parent.pid, and parent.ppid equals leader.pid.
- All three start times are at or after the recorded job cutoff, ordered
  leader≤parent≤child. Equality accommodates kernel tick resolution.
- A new bounded read of the leader's environment contains both exact current
  MCPCN_FORMS_RUN_ROOT and MCPCN_FORMS_NONCE entries. Prior ledger membership
  alone cannot establish this new fallback.
- Fresh before/after identities preserve UID/PID/start time/PPID/PGID for all
  three processes. Missing, changed, reused or unreadable proof rejects the
  fallback. Existing finite64-probe accounting still applies.

Record this provenance explicitly as
`fresh_direct_child_of_nonce_group_leader`. Track an accepted parent as derived
owned identity for later drain/closure checks; it must never become an eligible
independent anchor. Preserve the complete child/parent/group identity binding
and fresh marker-read result without publishing raw environment data or nonce.
Off-chain processes, arbitrary shared groups, recursive derived ownership and
unproved observations remain fatal. Z-state does not grant an exception.

The actual helper receives bounded identity/environment readers so twelve
authored fixture cases can test accepted binding and refusal of identity,
parent/group, nonce, task-cutoff and provenance counterexamples without an
application, browser or real host-process fixture. CI must run those checks
and retain exact source/case/output identities separately from the unchanged
110 product units, twelve browser cases and two installed consumers. Full
source/process/stream closure and root removal are still required for acceptance.

Publish the concrete changed helper/controller/fixtures and this protocol before
one new immutable-source dispatch. Standing owner approval covers this focused
free CI repair. Storage Guard still prohibits local tests/builds/apps/browser;
only static source checks and bounded evidence handling occur locally.
