import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {config} from "@lodestar/config/default";
import {Api, ReqTypes} from "../../../src/beacon/routes/validator.js";
import {getClient} from "../../../src/beacon/client/validator.js";
import {getRoutes} from "../../../src/beacon/server/validator.js";
import {runGenericServerTest} from "../../utils/genericServerTest.js";

const ZERO_HASH = Buffer.alloc(32, 0);

describe("beacon / validator", () => {
  runGenericServerTest<Api, ReqTypes>(config, getClient, getRoutes, {
    getAttesterDuties: {
      args: [1000, [1, 2, 3]],
      res: {
        data: [
          {
            pubkey: Buffer.alloc(48, 1),
            validatorIndex: 2,
            committeeIndex: 3,
            committeeLength: 4,
            committeesAtSlot: 5,
            validatorCommitteeIndex: 6,
            slot: 7,
          },
        ],
        dependentRoot: ZERO_HASH,
      },
    },
    getProposerDuties: {
      args: [1000],
      res: {data: [{slot: 1, validatorIndex: 2, pubkey: Buffer.alloc(48, 3)}], dependentRoot: ZERO_HASH},
    },
    getSyncCommitteeDuties: {
      args: [1000, [1, 2, 3]],
      res: {
        data: [{pubkey: Buffer.alloc(48, 1), validatorIndex: 2, validatorSyncCommitteeIndices: [3]}],
      },
    },
    produceBlock: {
      args: [32000, Buffer.alloc(96, 1), "graffiti"],
      res: {data: ssz.phase0.BeaconBlock.defaultValue()},
    },
    produceBlockV2: {
      args: [32000, Buffer.alloc(96, 1), "graffiti"],
      res: {data: ssz.altair.BeaconBlock.defaultValue(), version: ForkName.altair},
    },
    produceBlindedBlock: {
      args: [32000, Buffer.alloc(96, 1), "graffiti"],
      res: {data: ssz.bellatrix.BlindedBeaconBlock.defaultValue(), version: ForkName.bellatrix},
    },
    produceAttestationData: {
      args: [2, 32000],
      res: {data: ssz.phase0.AttestationData.defaultValue()},
    },
    produceSyncCommitteeContribution: {
      args: [32000, 2, ZERO_HASH],
      res: {data: ssz.altair.SyncCommitteeContribution.defaultValue()},
    },
    getAggregatedAttestation: {
      args: [ZERO_HASH, 32000],
      res: {data: ssz.phase0.Attestation.defaultValue()},
    },
    publishAggregateAndProofs: {
      args: [[ssz.phase0.SignedAggregateAndProof.defaultValue()]],
      res: undefined,
    },
    publishContributionAndProofs: {
      args: [[ssz.altair.SignedContributionAndProof.defaultValue()]],
      res: undefined,
    },
    prepareBeaconCommitteeSubnet: {
      args: [[{validatorIndex: 1, committeeIndex: 2, committeesAtSlot: 3, slot: 4, isAggregator: true}]],
      res: undefined,
    },
    prepareSyncCommitteeSubnets: {
      args: [[{validatorIndex: 1, syncCommitteeIndices: [2], untilEpoch: 3}]],
      res: undefined,
    },
    prepareBeaconProposer: {
      args: [[{validatorIndex: "1", feeRecipient: "0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b"}]],
      res: undefined,
    },
    getLiveness: {
      args: [[0], 0],
      res: {data: []},
    },
    registerValidator: {
      args: [[ssz.bellatrix.SignedValidatorRegistrationV1.defaultValue()]],
      res: undefined,
    },
  });

  // TODO: Extra tests to implement maybe

  // getAttesterDuties
  // - throw validation error on invalid epoch "a"
  // - throw validation error on no validator indices
  // - throw validation error on invalid validator index "a"

  // getProposerDuties
  // - throw validation error on invalid epoch "a"

  // prepareBeaconCommitteeSubnet
  // - throw validation error on missing param

  // produceAttestationData
  // - throw validation error on missing param

  // produceBlock
  // - throw validation error on missing randao reveal
  // - throw validation error on invalid slot
});
