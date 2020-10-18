import {IBeaconNodeOptions} from "@chainsafe/lodestar/lib/node/options";
import {RecursivePartial} from "../../util";
import * as api from "./api";
import * as eth1 from "./eth1";
import * as logger from "./logger";
import * as metrics from "./metrics";
import * as network from "./network";
import * as sync from "./sync";

export type IBeaconNodeArgs = api.IApiArgs &
  eth1.IEth1Args &
  logger.ILoggerArgs &
  metrics.IMetricsArgs &
  network.INetworkArgs &
  sync.ISyncArgs;

export function parseBeaconNodeArgs(args: IBeaconNodeArgs): RecursivePartial<IBeaconNodeOptions> {
  return {
    api: api.parseArgs(args),
    // chain: {},
    // db: {},
    eth1: eth1.parseArgs(args),
    logger: logger.parseArgs(args),
    metrics: metrics.parseArgs(args),
    network: network.parseArgs(args),
    sync: sync.parseArgs(args),
  };
}

export const beaconNodeOptions = {
  ...api.options,
  ...eth1.options,
  ...logger.options,
  ...metrics.options,
  ...network.options,
  ...sync.options,
};
