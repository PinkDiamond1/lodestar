import bls from "@chainsafe/bls/switchable";
import {PointFormat, PublicKey, SecretKey} from "@chainsafe/bls/types";
import {hash} from "@chainsafe/persistent-merkle-tree";
import {BitArray, fromHexString} from "@chainsafe/ssz";
import {routes} from "@lodestar/api";
import {IBeaconConfig} from "@lodestar/config";
import {
  DOMAIN_SYNC_COMMITTEE,
  EPOCHS_PER_SYNC_COMMITTEE_PERIOD,
  FINALIZED_ROOT_DEPTH,
  FINALIZED_ROOT_INDEX,
  NEXT_SYNC_COMMITTEE_DEPTH,
  NEXT_SYNC_COMMITTEE_INDEX,
  SLOTS_PER_EPOCH,
  SYNC_COMMITTEE_SIZE,
} from "@lodestar/params";
import {altair, phase0, Slot, ssz, SyncPeriod} from "@lodestar/types";
import {SyncCommitteeFast} from "../../src/types.js";
import {computeSigningRoot} from "../../src/utils/domain.js";
import {getLcLoggerConsole} from "../../src/utils/logger.js";

const CURRENT_SYNC_COMMITTEE_INDEX = 22;
const CURRENT_SYNC_COMMITTEE_DEPTH = 5;

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * To enable debug logs run with
 * ```
 * DEBUG=true mocha ...
 * ```
 */
export const testLogger = getLcLoggerConsole({logDebug: Boolean(process.env.DEBUG)});

export const genesisValidatorsRoot = Buffer.alloc(32, 0xaa);
export const SOME_HASH = Buffer.alloc(32, 0xaa);

export function signAndAggregate(message: Uint8Array, sks: SecretKey[]): altair.SyncAggregate {
  const sigs = sks.map((sk) => sk.sign(message));
  const aggSig = bls.Signature.aggregate(sigs).toBytes();
  return {
    syncCommitteeBits: BitArray.fromBoolArray(sks.map(() => true)),
    syncCommitteeSignature: aggSig,
  };
}

export function getSyncAggregateSigningRoot(
  config: IBeaconConfig,
  syncAttestedBlockHeader: phase0.BeaconBlockHeader
): Uint8Array {
  const domain = config.getDomain(syncAttestedBlockHeader.slot, DOMAIN_SYNC_COMMITTEE);
  return computeSigningRoot(ssz.phase0.BeaconBlockHeader, syncAttestedBlockHeader, domain);
}

export function defaultBeaconBlockHeader(slot: Slot): phase0.BeaconBlockHeader {
  const header = ssz.phase0.BeaconBlockHeader.defaultValue();
  header.slot = slot;
  return header;
}

export type SyncCommitteeKeys = {
  pks: PublicKey[];
  syncCommittee: altair.SyncCommittee;
  syncCommitteeFast: SyncCommitteeFast;
  signHeader(config: IBeaconConfig, header: phase0.BeaconBlockHeader): altair.SyncAggregate;
  signAndAggregate(message: Uint8Array): altair.SyncAggregate;
};

/**
 * To make the test fast each sync committee has a single key repeated `SYNC_COMMITTEE_SIZE` times
 */
export function getInteropSyncCommittee(period: SyncPeriod): SyncCommitteeKeys {
  const skBytes = Buffer.alloc(32, 0);
  skBytes.writeInt32BE(1 + period);
  const sk = bls.SecretKey.fromBytes(skBytes);
  const pk = sk.toPublicKey();
  const pks = Array.from({length: SYNC_COMMITTEE_SIZE}, () => pk);

  const pkBytes = pk.toBytes(PointFormat.compressed);
  const pksBytes = Array.from({length: SYNC_COMMITTEE_SIZE}, () => pkBytes);

  const aggPk = bls.PublicKey.aggregate(pks);

  function signAndAggregate(message: Uint8Array): altair.SyncAggregate {
    const sig = sk.sign(message);
    const sigs = Array.from({length: SYNC_COMMITTEE_SIZE}, () => sig);
    const aggSig = bls.Signature.aggregate(sigs).toBytes();
    return {
      syncCommitteeBits: BitArray.fromBoolArray(sigs.map(() => true)),
      syncCommitteeSignature: aggSig,
    };
  }

  function signHeader(config: IBeaconConfig, header: phase0.BeaconBlockHeader): altair.SyncAggregate {
    return signAndAggregate(getSyncAggregateSigningRoot(config, header));
  }

  return {
    pks,
    signAndAggregate,
    signHeader,
    syncCommittee: {
      pubkeys: pksBytes,
      aggregatePubkey: aggPk.toBytes(PointFormat.compressed),
    },
    syncCommitteeFast: {
      pubkeys: pks,
      aggregatePubkey: aggPk,
    },
  };
}

/**
 * Creates LightClientUpdate that passes `assertValidLightClientUpdate` function, from mock data
 */
export function computeLightclientUpdate(config: IBeaconConfig, period: SyncPeriod): altair.LightClientUpdate {
  const updateSlot = period * EPOCHS_PER_SYNC_COMMITTEE_PERIOD * SLOTS_PER_EPOCH + 1;

  const committee = getInteropSyncCommittee(period);
  const committeeNext = getInteropSyncCommittee(period + 1);

  const nextSyncCommittee = committeeNext.syncCommittee;

  const {root: headerStateRoot, proof: nextSyncCommitteeBranch} = computeMerkleBranch(
    ssz.altair.SyncCommittee.hashTreeRoot(nextSyncCommittee),
    NEXT_SYNC_COMMITTEE_DEPTH,
    NEXT_SYNC_COMMITTEE_INDEX
  );

  // finalized header's state root is used to to validate sync committee branch
  const finalizedHeader: phase0.BeaconBlockHeader = {
    slot: updateSlot,
    proposerIndex: 0,
    parentRoot: SOME_HASH,
    stateRoot: headerStateRoot,
    bodyRoot: SOME_HASH,
  };

  const {root: stateRoot, proof: finalityBranch} = computeMerkleBranch(
    ssz.phase0.BeaconBlockHeader.hashTreeRoot(finalizedHeader),
    FINALIZED_ROOT_DEPTH,
    FINALIZED_ROOT_INDEX
  );

  // attested header's state root is used to validate finality branch
  const attestedHeader: phase0.BeaconBlockHeader = {
    slot: updateSlot,
    proposerIndex: 0,
    parentRoot: SOME_HASH,
    stateRoot: stateRoot,
    bodyRoot: SOME_HASH,
  };

  const forkVersion = config.getForkVersion(updateSlot);
  const syncAggregate = committee.signHeader(config, attestedHeader);

  return {
    attestedHeader,
    nextSyncCommittee,
    nextSyncCommitteeBranch,
    finalizedHeader,
    finalityBranch,
    syncAggregate,
    forkVersion,
  };
}

/**
 * Creates a LightclientSnapshotWithProof that passes validation
 */
export function computeLightClientSnapshot(
  period: SyncPeriod
): {
  snapshot: routes.lightclient.LightclientSnapshotWithProof;
  checkpointRoot: Uint8Array;
} {
  const currentSyncCommittee = getInteropSyncCommittee(period).syncCommittee;

  const {root: headerStateRoot, proof: currentSyncCommitteeBranch} = computeMerkleBranch(
    ssz.altair.SyncCommittee.hashTreeRoot(currentSyncCommittee),
    CURRENT_SYNC_COMMITTEE_DEPTH,
    CURRENT_SYNC_COMMITTEE_INDEX
  );

  const header: phase0.BeaconBlockHeader = {
    slot: period * EPOCHS_PER_SYNC_COMMITTEE_PERIOD * SLOTS_PER_EPOCH,
    proposerIndex: 0,
    parentRoot: SOME_HASH,
    stateRoot: headerStateRoot,
    bodyRoot: SOME_HASH,
  };

  return {
    snapshot: {
      header,
      currentSyncCommittee,
      currentSyncCommitteeBranch,
    },
    checkpointRoot: ssz.phase0.BeaconBlockHeader.hashTreeRoot(header),
  };
}

/**
 * Generates a single fake validator, for tests purposes only.
 */
export function generateValidator(opts: Partial<phase0.Validator> = {}): phase0.Validator {
  return {
    pubkey: fromHexString(
      // randomly pregenerated pubkey
      "0x84105a985058fc8740a48bf1ede9d223ef09e8c6b1735ba0a55cf4a9ff2ff92376b778798365e488dab07a652eb04576"
    ),
    withdrawalCredentials: Buffer.alloc(32),
    activationEpoch: 0,
    activationEligibilityEpoch: 10000,
    exitEpoch: 10000,
    withdrawableEpoch: 10000,
    slashed: opts.slashed || false,
    effectiveBalance: 32,
    ...opts,
  };
}

/**
 * Generates n number of validators, for tests purposes only.
 */
export function generateValidators(n: number, opts?: Partial<phase0.Validator>): phase0.Validator[] {
  return Array.from({length: n}, () => generateValidator(opts));
}

export function generateBalances(n: number): number[] {
  return Array.from({length: n}, () => 32e9);
}

/**
 * Verify that the given ``leaf`` is on the merkle branch ``proof``
 * starting with the given ``root``.
 *
 * Browser friendly version of verifyMerkleBranch
 */
export function computeMerkleBranch(
  leaf: Uint8Array,
  depth: number,
  index: number
): {root: Uint8Array; proof: Uint8Array[]} {
  const proof: Uint8Array[] = [];

  let value = leaf;
  for (let i = 0; i < depth; i++) {
    proof[i] = Buffer.alloc(32, i);
    if (Math.floor(index / 2 ** i) % 2) {
      value = hash(proof[i], value);
    } else {
      value = hash(value, proof[i]);
    }
  }
  return {root: value, proof};
}

export function committeeUpdateToLatestHeadUpdate(
  committeeUpdate: altair.LightClientUpdate
): routes.lightclient.LightclientOptimisticHeaderUpdate {
  return {
    attestedHeader: committeeUpdate.attestedHeader,
    syncAggregate: {
      syncCommitteeBits: committeeUpdate.syncAggregate.syncCommitteeBits,
      syncCommitteeSignature: committeeUpdate.syncAggregate.syncCommitteeSignature,
    },
  };
}

export function committeeUpdateToLatestFinalizedHeadUpdate(
  committeeUpdate: altair.LightClientUpdate
): routes.lightclient.LightclientFinalizedUpdate {
  return {
    attestedHeader: committeeUpdate.attestedHeader,
    finalizedHeader: committeeUpdate.finalizedHeader,
    finalityBranch: committeeUpdate.finalityBranch,
    syncAggregate: {
      syncCommitteeBits: committeeUpdate.syncAggregate.syncCommitteeBits,
      syncCommitteeSignature: committeeUpdate.syncAggregate.syncCommitteeSignature,
    },
  };
}

export function lastInMap<T>(map: Map<unknown, T>): T {
  if (map.size === 0) throw Error("Empty map");
  const values = Array.from(map.values());
  return values[values.length - 1];
}
