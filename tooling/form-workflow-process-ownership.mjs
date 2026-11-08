// CI-only ownership proof. All process/environment reads are injected; no state grants ownership.
const METHOD = 'fresh_direct_child_of_nonce_group_leader';
const ENVIRONMENT_LIMIT = 1048576;
const independent = new Set(['direct_command_identity', 'nonce_environment']);
const identity = value => value && Number.isSafeInteger(value.pid) && value.pid > 0
  && Number.isSafeInteger(value.uid) && value.uid >= 0 && Number.isSafeInteger(value.ppid) && value.ppid >= 0
  && Number.isSafeInteger(value.pgid) && value.pgid > 0 && typeof value.starttime === 'string' && /^[1-9][0-9]{0,19}$/.test(value.starttime);
const equal = (left, right) => identity(left) && identity(right)
  && ['pid', 'uid', 'ppid', 'pgid', 'starttime'].every(field => left[field] === right[field]);

// Selection schedules the existing proof while anchors are readable. It grants no ownership.
export function isFormWorkflowEagerOwnershipCandidate({ candidate, groupLeader, groupProvenance, taskStartTicks }) {
  if (!identity(candidate) || !identity(groupLeader) || typeof taskStartTicks !== 'string'
    || !/^[1-9][0-9]{0,19}$/.test(taskStartTicks) || !groupProvenance || !independent.has(groupProvenance.method)
    || !equal(groupProvenance.identity, groupLeader)) return false;
  const cutoff = BigInt(taskStartTicks), groupStart = BigInt(groupLeader.starttime), candidateStart = BigInt(candidate.starttime);
  return candidate.pid !== groupLeader.pid && candidate.ppid > 0 && candidate.ppid !== candidate.pid
    && candidate.uid === groupLeader.uid && candidate.pgid === groupLeader.pid && groupLeader.pgid === groupLeader.pid
    && cutoff <= groupStart && cutoff <= candidateStart && groupStart <= candidateStart;
}

export function verifyFormWorkflowTwoEdgeOwnership({ child, parent, groupLeader, parentAnchorDisposition,
  groupProvenance, taskStartTicks, root, nonce, consumeProbe, readIdentity, readEnvironment }) {
  const result = { accepted: false, method: METHOD, failure: null, before: null, after: null,
    environmentBytes: null, errno: null, proof: null };
  const refuse = failure => { result.failure = failure; return result; };
  if (parentAnchorDisposition !== 'nonce_absent') return refuse('parent_nonce_absence_required');
  if (!groupProvenance || !independent.has(groupProvenance.method)
    || !equal(groupProvenance.identity, groupLeader)) return refuse('independent_group_required');
  if (typeof taskStartTicks !== 'string' || !/^[1-9][0-9]{0,19}$/.test(taskStartTicks) || typeof root !== 'string' || !root.startsWith('/')
    || root.length > 4096 || root.includes('\0') || typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)
    || ![consumeProbe, readIdentity, readEnvironment].every(value => typeof value === 'function')) return refuse('context_invalid');
  const chain = (currentChild, currentParent, currentGroup) => {
    if (![currentChild, currentParent, currentGroup].every(identity)) return false;
    const cutoff = BigInt(taskStartTicks), childStart = BigInt(currentChild.starttime);
    const parentStart = BigInt(currentParent.starttime), groupStart = BigInt(currentGroup.starttime);
    return new Set([currentChild.pid, currentParent.pid, currentGroup.pid]).size === 3
      && currentChild.ppid === currentParent.pid && currentParent.ppid === currentGroup.pid
      && currentGroup.pid === currentGroup.pgid && currentChild.pgid === currentGroup.pid && currentParent.pgid === currentGroup.pid
      && currentChild.uid === currentParent.uid && currentParent.uid === currentGroup.uid
      && cutoff <= groupStart && cutoff <= parentStart && cutoff <= childStart
      && groupStart <= parentStart && parentStart <= childStart;
  };
  if (!chain(child, parent, groupLeader)) return refuse('two_edge_structure_unproved');
  try {
    const before = { child: readIdentity(child.pid), parent: readIdentity(parent.pid), groupLeader: readIdentity(groupLeader.pid) };
    result.before = before;
    if (!equal(child, before.child) || !equal(parent, before.parent) || !equal(groupLeader, before.groupLeader)
      || !chain(before.child, before.parent, before.groupLeader)) return refuse('two_edge_before_identity_changed');
    if (consumeProbe() !== true) return refuse('probe_bound');
    const raw = readEnvironment(before.groupLeader.pid, ENVIRONMENT_LIMIT);
    if (!(raw instanceof Uint8Array) || raw.byteLength > ENVIRONMENT_LIMIT) return refuse('environment_read_bound');
    result.environmentBytes = raw.byteLength;
    const fields = Buffer.from(raw).toString('utf8').split('\0');
    const noncePresent = fields.includes(`MCPCN_FORMS_RUN_ROOT=${root}`) && fields.includes(`MCPCN_FORMS_NONCE=${nonce}`);
    const after = { child: readIdentity(child.pid), parent: readIdentity(parent.pid), groupLeader: readIdentity(groupLeader.pid) };
    result.after = after;
    if (!equal(before.child, after.child) || !equal(before.parent, after.parent) || !equal(before.groupLeader, after.groupLeader)
      || !chain(after.child, after.parent, after.groupLeader)) return refuse('two_edge_after_identity_changed');
    if (!noncePresent) return refuse('fresh_group_nonce_absent');
    result.accepted = true;
    result.proof = { method: METHOD, taskStartTicks, before, after, groupProvenance,
      freshNonceObservation: { namespace: 'MCPCN_FORMS', environmentBytes: raw.byteLength,
        before: before.groupLeader, after: after.groupLeader } };
    return result;
  } catch (error) {
    result.errno = typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'UNKNOWN';
    return refuse('two_edge_read_failed');
  }
}
