import path from "node:path";
import {IGlobalArgs} from "../../options/index.js";
import {getGlobalPaths, IGlobalPaths} from "../../paths/global.js";

export interface IBeaconPaths {
  beaconDir: string;
  peerStoreDir: string;
  dbDir: string;
  persistInvalidSszObjectsDir: string;
  configFile?: string;
  peerIdFile: string;
  enrFile: string;
  logFile?: string;
  bootnodesFile?: string;
}

/**
 * Defines the path structure of the files relevant to the beacon node
 *
 * ```bash
 * $dataDir
 * └── $beaconDir
 *     ├── beacon.config.json
 *     ├── peer-id.json
 *     ├── enr
 *     └── chain-db
 * ```
 */
// Using Pick<IGlobalArgs, "dataDir"> make changes in IGlobalArgs throw a type error here
export function getBeaconPaths(
  args: Partial<IBeaconPaths> & Pick<IGlobalArgs, "dataDir">
): IBeaconPaths & IGlobalPaths {
  // Compute global paths first
  const globalPaths = getGlobalPaths(args);

  const dataDir = globalPaths.dataDir;
  const beaconDir = dataDir;
  const dbDir = args.dbDir || path.join(beaconDir, "chain-db");
  const persistInvalidSszObjectsDir = args.persistInvalidSszObjectsDir || path.join(beaconDir, "invalidSszObjects");
  const peerStoreDir = args.peerStoreDir || path.join(beaconDir, "peerstore");
  const configFile = args.configFile;
  const peerIdFile = args.peerIdFile || path.join(beaconDir, "peer-id.json");
  const enrFile = args.enrFile || path.join(beaconDir, "enr");
  const logFile = args.logFile;
  const bootnodesFile = args.bootnodesFile;

  return {
    ...globalPaths,
    beaconDir,
    dbDir,
    persistInvalidSszObjectsDir,
    configFile,
    peerStoreDir,
    peerIdFile,
    enrFile,
    logFile,
    bootnodesFile,
  };
}

/**
 * Constructs representations of the path structure to show in command's description
 */
export const defaultBeaconPaths = getBeaconPaths({dataDir: "$dataDir"});
