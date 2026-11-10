import type { DatabaseSync } from "node:sqlite";
import { BlockIdentitySchema, BlockOperationSchema, BlockJsonSchema, type BlockJson, type BlockOperation, type BlockKind } from "@mcpcn/schemas/blocks";
import type { BlockPrincipal } from "./block-store.js";
import { wireSnapshot } from "./wire.js";

export type BlockSqlExecutor = (context: {
  database: DatabaseSync; principal: Readonly<BlockPrincipal>; block: BlockKind; operation: Readonly<BlockOperation>; signal: AbortSignal;
}) => BlockJson;
export type BlockExecutors = Readonly<Record<string, BlockSqlExecutor>>;
export type BlockOperationBatch = { status: "succeeded"; results: BlockJson[] } | { status: "failed"; message: string };

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function captureBlockExecutors(supplied: BlockExecutors = {}): ReadonlyMap<string, BlockSqlExecutor> {
  if (supplied === null || typeof supplied !== "object") throw new Error("mcpcn_block_executor_config_invalid");
  const prototype = Object.getPrototypeOf(supplied);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(supplied).length) throw new Error("mcpcn_block_executor_config_invalid");
  const result = new Map<string, BlockSqlExecutor>();
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(supplied))) {
    BlockIdentitySchema.parse(name);
    if (!descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function") throw new Error("mcpcn_block_executor_config_invalid");
    result.set(name, descriptor.value as BlockSqlExecutor);
  }
  return result;
}
export function requireBlockOperations(operations: BlockOperation[], executors: ReadonlyMap<string, BlockSqlExecutor>) {
  if (!operations.length || operations.length > 80 || operations.some(operation => !executors.has(operation.name))) throw new Error("mcpcn_block_operation_unavailable");
}

/** Trusted SQL callbacks only. External asynchronous effects cannot share this transaction. */
export function executeBlockOperations(database: DatabaseSync, principal: BlockPrincipal, block: BlockKind, signal: AbortSignal,
  operations: BlockOperation[], executors: ReadonlyMap<string, BlockSqlExecutor>): BlockOperationBatch {
  requireBlockOperations(operations, executors);
  if (signal.aborted) throw new Error("mcpcn_block_request_cancelled");
  const trustedPrincipal = freeze(wireSnapshot(principal));
  database.exec("SAVEPOINT mcpcn_block_executor");
  try {
    const results = operations.map(supplied => {
      if (signal.aborted) throw new Error("mcpcn_block_request_cancelled");
      const operation = freeze(BlockOperationSchema.parse(wireSnapshot(supplied)));
      const result = BlockJsonSchema.parse(wireSnapshot(executors.get(operation.name)!({ database, principal: trustedPrincipal, block, operation, signal })));
      wireSnapshot({ _meta: { block: { prepared: { preview: { rows: [{ execution: { result } }] } } } } });
      if (signal.aborted || Buffer.byteLength(JSON.stringify(result)) > 128 * 1024) throw new Error("mcpcn_block_operation_failed");
      return result;
    });
    database.exec("RELEASE mcpcn_block_executor");
    return { status: "succeeded", results };
  } catch {
    // A failed bulk member rolls back every operation in this reviewed batch.
    database.exec("ROLLBACK TO mcpcn_block_executor; RELEASE mcpcn_block_executor;");
    if (signal.aborted) throw new Error("mcpcn_block_request_cancelled");
    return { status: "failed", message: "The transaction-local operation failed. Its business changes were rolled back; review a new attempt before retrying." };
  }
}
