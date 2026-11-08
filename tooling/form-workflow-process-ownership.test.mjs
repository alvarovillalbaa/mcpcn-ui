import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyFormWorkflowTwoEdgeOwnership } from './form-workflow-process-ownership.mjs';

const METHOD = 'fresh_direct_child_of_nonce_group_leader';
const root = '/owned/form-workflow/fixture', nonce = '1234567890abcdef1234567890abcdef';
const copy = value => structuredClone(value);
function fixture(changes = {}) {
  const child = { pid: 302, uid: 1001, ppid: 301, pgid: 300, starttime: '130', state: 'Z', ...changes.child };
  const parent = { pid: 301, uid: 1001, ppid: 300, pgid: 300, starttime: '120', state: 'S', ...changes.parent };
  const groupLeader = { pid: 300, uid: 1001, ppid: 200, pgid: 300, starttime: '110', state: 'R', ...changes.groupLeader };
  const identities = new Map([child, parent, groupLeader].map(value => [value.pid, [copy(value), copy(value)]]));
  const calls = { identities: [], environments: [], probes: 0 };
  const input = { child, parent, groupLeader, parentAnchorDisposition: 'nonce_absent',
    groupProvenance: { method: 'nonce_environment', label: null, identity: copy(groupLeader) },
    taskStartTicks: '100', root, nonce,
    consumeProbe: () => { calls.probes++; return true; },
    readIdentity: pid => {
      calls.identities.push(pid);
      const values = identities.get(pid); assert.ok(values, 'Unexpected process read');
      return copy(values.length > 1 ? values.shift() : values[0]);
    },
    readEnvironment: (pid, limit) => {
      calls.environments.push({ pid, limit });
      return Buffer.from(`UNRELATED=authored\0MCPCN_FORMS_RUN_ROOT=${root}\0MCPCN_FORMS_NONCE=${nonce}\0`);
    },
  };
  return { input, identities, calls, run: overrides => verifyFormWorkflowTwoEdgeOwnership({ ...input, ...overrides }) };
}
function refused(result, failure) {
  assert.equal(result.accepted, false);
  assert.equal(result.method, METHOD);
  assert.equal(result.failure, failure);
  assert.equal(result.proof, null);
}

test('PO01_direct_group_binds_exact_two_edge_chain', () => {
  const current = fixture();
  current.input.groupProvenance.method = 'direct_command_identity';
  current.input.groupProvenance.label = 'authored_browser_command';
  const result = current.run();
  assert.equal(result.accepted, true);
  assert.equal(result.failure, null);
  assert.equal(result.proof.method, METHOD);
  assert.deepEqual(result.before, result.after);
  assert.deepEqual(result.proof.before.child, current.input.child);
  assert.equal(result.proof.groupProvenance.method, 'direct_command_identity');
  assert.deepEqual(current.calls.identities, [302, 301, 300, 302, 301, 300]);
  assert.deepEqual(current.calls.environments, [{ pid: 300, limit: 1048576 }]);
  assert.equal(current.calls.probes, 1);
});

test('PO02_nonce_group_binds_without_promoting_derived_parent', () => {
  const current = fixture({ child: { state: 'R' } });
  current.input.parent.ownershipMethod = METHOD;
  const result = current.run();
  assert.equal(result.accepted, true);
  assert.equal(result.proof.groupProvenance.method, 'nonce_environment');
  assert.equal(result.proof.freshNonceObservation.namespace, 'MCPCN_FORMS');
  assert.ok(result.proof.freshNonceObservation.environmentBytes > 0);
  assert.equal(result.proof.before.parent.ppid, result.proof.before.groupLeader.pid);
  assert.equal(result.proof.before.child.ppid, result.proof.before.parent.pid);
  assert.equal(current.input.parent.ownershipMethod, METHOD);
  assert.equal(result.proof.before.parent.ownershipMethod, undefined);
  assert.equal(Object.hasOwn(result.proof, 'independentParent'), false);
});

test('PO03_only_fresh_parent_nonce_absence_enables_fallback', () => {
  for (const disposition of ['prior_independent', 'derived_anchor_ineligible', 'nonce_read_failed', 'identity_changed', 'probe_bound', null]) {
    const current = fixture();
    refused(current.run({ parentAnchorDisposition: disposition }), 'parent_nonce_absence_required');
    assert.deepEqual(current.calls, { identities: [], environments: [], probes: 0 });
  }
});

test('PO04_derived_or_changed_group_never_becomes_independent', () => {
  for (const method of [METHOD, 'verified_owned_parent_and_group', 'previously_observed_owned_identity', undefined]) {
    const current = fixture();
    refused(current.run({ groupProvenance: { ...current.input.groupProvenance, method } }), 'independent_group_required');
    assert.equal(current.calls.probes, 0);
  }
  const current = fixture();
  current.input.groupProvenance.identity.starttime = '109';
  refused(current.run(), 'independent_group_required');
});

test('PO05_offchain_parent_or_collapsed_edges_are_refused', () => {
  for (const changes of [{ parent: { ppid: 299 } }, { child: { ppid: 300 } }, { child: { pid: 301 } }, { parent: { pid: 300 } }]) {
    const current = fixture(changes);
    refused(current.run(), 'two_edge_structure_unproved');
    assert.equal(current.calls.probes, 0);
  }
});

test('PO06_reparenting_before_or_after_nonce_read_is_refused', () => {
  for (const pid of [302, 301, 300]) {
    for (const sample of [0, 1]) {
      const current = fixture();
      current.identities.get(pid)[sample].ppid += 1;
      refused(current.run(), sample === 0 ? 'two_edge_before_identity_changed' : 'two_edge_after_identity_changed');
    }
  }
});

test('PO07_pid_or_starttime_reuse_at_each_edge_is_refused', () => {
  for (const pid of [302, 301, 300]) {
    for (const field of ['pid', 'starttime']) {
      const current = fixture();
      current.identities.get(pid)[1][field] = field === 'pid' ? pid + 100 : '140';
      refused(current.run(), 'two_edge_after_identity_changed');
    }
  }
});

test('PO08_group_nonce_and_root_must_match_exact_current_namespace', () => {
  for (const raw of [
    `MCPCN_FORMS_RUN_ROOT=${root}\0MCPCN_FORMS_NONCE=ffffffffffffffffffffffffffffffff\0`,
    `MCPCN_FORMS_RUN_ROOT=${root}-other\0MCPCN_FORMS_NONCE=${nonce}\0`,
    `OTHER_RUN_ROOT=${root}\0OTHER_NONCE=${nonce}\0`,
    `PREFIX_MCPCN_FORMS_RUN_ROOT=${root}\0MCPCN_FORMS_NONCE=${nonce}-suffix\0`,
    '',
  ]) {
    const current = fixture();
    refused(current.run({ readEnvironment: () => Buffer.from(raw) }), 'fresh_group_nonce_absent');
    assert.equal(current.calls.probes, 1);
  }
});

test('PO09_uid_mismatch_or_change_at_any_identity_is_refused', () => {
  for (const role of ['child', 'parent', 'groupLeader']) {
    const current = fixture({ [role]: { uid: 1002 } });
    refused(current.run(), 'two_edge_structure_unproved');
  }
  for (const pid of [302, 301, 300]) {
    const current = fixture(); current.identities.get(pid)[1].uid = 1002;
    refused(current.run(), 'two_edge_after_identity_changed');
  }
});

test('PO10_pgid_mismatch_or_change_at_any_identity_is_refused', () => {
  for (const role of ['child', 'parent', 'groupLeader']) {
    const current = fixture({ [role]: { pgid: 399 } });
    refused(current.run(), 'two_edge_structure_unproved');
  }
  for (const pid of [302, 301, 300]) {
    const current = fixture(); current.identities.get(pid)[1].pgid = 399;
    refused(current.run(), 'two_edge_after_identity_changed');
  }
});

test('PO11_job_cutoff_and_group_parent_child_start_order_are_required', () => {
  for (const changes of [
    { groupLeader: { starttime: '99' } }, { parent: { starttime: '99' } }, { child: { starttime: '99' } },
    { groupLeader: { starttime: '121' } }, { parent: { starttime: '131' } },
  ]) {
    const current = fixture(changes);
    refused(current.run(), 'two_edge_structure_unproved');
    assert.equal(current.calls.probes, 0);
  }
});

test('PO12_probe_environment_and_identity_read_bounds_fail_closed', () => {
  const malformed = fixture({ child: { starttime: 130 } });
  refused(malformed.run(), 'two_edge_structure_unproved');
  const numericCutoff = fixture();
  refused(numericCutoff.run({ taskStartTicks: 100 }), 'context_invalid');
  const exhausted = fixture();
  refused(exhausted.run({ consumeProbe: () => false }), 'probe_bound');
  assert.deepEqual(exhausted.calls.environments, []);
  const oversized = fixture();
  refused(oversized.run({ readEnvironment: () => Buffer.alloc(1048577) }), 'environment_read_bound');
  const unreadable = fixture();
  const denied = Object.assign(new Error('Authored environment read refusal'), { code: 'EACCES' });
  const deniedResult = unreadable.run({ readEnvironment: () => { throw denied; } });
  refused(deniedResult, 'two_edge_read_failed'); assert.equal(deniedResult.errno, 'EACCES');
  const vanished = fixture();
  const gone = Object.assign(new Error('Authored vanished identity'), { code: 'ENOENT' });
  const goneResult = vanished.run({ readIdentity: () => { throw gone; } });
  refused(goneResult, 'two_edge_read_failed'); assert.equal(goneResult.errno, 'ENOENT');
  const missing = fixture(); refused(missing.run({ readIdentity: () => null }), 'two_edge_before_identity_changed');
});
