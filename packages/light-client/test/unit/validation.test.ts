import {expect} from "chai";
import bls, {init} from "@chainsafe/bls/switchable";
import {Tree} from "@chainsafe/persistent-merkle-tree";
import {altair, ssz} from "@lodestar/types";
import {chainConfig} from "@lodestar/config/default";
import {createIBeaconConfig} from "@lodestar/config";
import {
  EPOCHS_PER_SYNC_COMMITTEE_PERIOD,
  FINALIZED_ROOT_GINDEX,
  NEXT_SYNC_COMMITTEE_GINDEX,
  SLOTS_PER_EPOCH,
  SYNC_COMMITTEE_SIZE,
} from "@lodestar/params";
import {assertValidLightClientUpdate} from "../../src/validation.js";
import {LightClientSnapshotFast, SyncCommitteeFast} from "../../src/types.js";
import {defaultBeaconBlockHeader, getSyncAggregateSigningRoot, signAndAggregate} from "../utils/utils.js";
import {isNode} from "../../src/utils/utils.js";

describe("validation", function () {
  // In browser test this process is taking more time than default 2000ms
  // specially on the CI
  this.timeout(15000);

  const genValiRoot = Buffer.alloc(32, 9);
  const config = createIBeaconConfig(chainConfig, genValiRoot);

  let update: altair.LightClientUpdate;
  let snapshot: LightClientSnapshotFast;

  before("prepare bls", async () => {
    // This process has to be done manually because of an issue in Karma runner
    // https://github.com/karma-runner/karma/issues/3804
    await init(isNode ? "blst-native" : "herumi");
  });

  before("prepare data", function () {
    // Update slot must > snapshot slot
    // updatePeriod must == snapshotPeriod + 1
    const snapshotHeaderSlot = 1;
    const updateHeaderSlot = EPOCHS_PER_SYNC_COMMITTEE_PERIOD * SLOTS_PER_EPOCH + 1;
    const attestedHeaderSlot = updateHeaderSlot + 1;

    const skBytes: Buffer[] = [];
    for (let i = 0; i < SYNC_COMMITTEE_SIZE; i++) {
      const buffer = Buffer.alloc(32, 0);
      buffer.writeInt16BE(i + 1, 30); // Offset to ensure the SK is less than the order
      skBytes.push(buffer);
    }
    const sks = skBytes.map((skBytes) => bls.SecretKey.fromBytes(skBytes));
    const pks = sks.map((sk) => sk.toPublicKey());
    const pubkeys = pks.map((pk) => pk.toBytes());

    // Create a sync committee with the keys that will sign the `syncAggregate`
    const nextSyncCommittee: altair.SyncCommittee = {
      pubkeys,
      aggregatePubkey: bls.aggregatePublicKeys(pubkeys),
    };

    // finalizedCheckpointState must have `nextSyncCommittee`
    const finalizedCheckpointState = ssz.altair.BeaconState.defaultViewDU();
    finalizedCheckpointState.nextSyncCommittee = ssz.altair.SyncCommittee.toViewDU(nextSyncCommittee);
    // Prove it
    const nextSyncCommitteeBranch = new Tree(finalizedCheckpointState.node).getSingleProof(
      BigInt(NEXT_SYNC_COMMITTEE_GINDEX)
    );

    // update.header must have stateRoot to finalizedCheckpointState
    const finalizedHeader = defaultBeaconBlockHeader(updateHeaderSlot);
    finalizedHeader.stateRoot = finalizedCheckpointState.hashTreeRoot();

    // syncAttestedState must have `header` as finalizedCheckpoint
    const syncAttestedState = ssz.altair.BeaconState.defaultViewDU();
    syncAttestedState.finalizedCheckpoint = ssz.phase0.Checkpoint.toViewDU({
      epoch: 0,
      root: ssz.phase0.BeaconBlockHeader.hashTreeRoot(finalizedHeader),
    });
    // Prove it
    const finalityBranch = new Tree(syncAttestedState.node).getSingleProof(BigInt(FINALIZED_ROOT_GINDEX));

    // finalityHeader must have stateRoot to syncAttestedState
    const syncAttestedBlockHeader = defaultBeaconBlockHeader(attestedHeaderSlot);
    syncAttestedBlockHeader.stateRoot = syncAttestedState.hashTreeRoot();

    const forkVersion = ssz.Bytes4.defaultValue();
    const signingRoot = getSyncAggregateSigningRoot(config, syncAttestedBlockHeader);
    const syncAggregate = signAndAggregate(signingRoot, sks);

    const syncCommittee: SyncCommitteeFast = {
      pubkeys: pks,
      aggregatePubkey: bls.PublicKey.fromBytes(bls.aggregatePublicKeys(pubkeys)),
    };

    update = {
      attestedHeader: syncAttestedBlockHeader,
      nextSyncCommittee: nextSyncCommittee,
      nextSyncCommitteeBranch: nextSyncCommitteeBranch,
      finalizedHeader: finalizedHeader,
      finalityBranch: finalityBranch,
      syncAggregate,
      forkVersion,
    };

    snapshot = {
      header: defaultBeaconBlockHeader(snapshotHeaderSlot),
      currentSyncCommittee: syncCommittee,
      nextSyncCommittee: syncCommittee,
    };
  });

  it("should validate valid update", () => {
    expect(() => assertValidLightClientUpdate(config, snapshot.nextSyncCommittee, update)).to.not.throw();
  });
});
