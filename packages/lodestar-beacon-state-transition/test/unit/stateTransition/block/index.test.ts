import {generateState} from "../../../utils/state";
import {expect} from "chai";
import sinon from "sinon";

import {config} from "@chainsafe/lodestar-config/mainnet";
import * as processEth1Data from "../../../../src/block/eth1Data";
import * as processBlockHeader from "../../../../src/block/blockHeader";
import * as processRandao from "../../../../src/block/randao";
import * as processOperations from "../../../../src/block/operations";
import {processBlock} from "../../../../src";
import {generateEmptyBlock} from "../../../utils/block";

describe("process block", function () {
  const sandbox = sinon.createSandbox();

  let processEth1Stub: any, processBlockHeaderStub: any, processRandaoStub: any, processOperationsStub: any;

  beforeEach(() => {
    processBlockHeaderStub = sandbox.stub(processBlockHeader, "processBlockHeader");
    processRandaoStub = sandbox.stub(processRandao, "processRandao");
    processEth1Stub = sandbox.stub(processEth1Data, "processEth1Data");
    processOperationsStub = sandbox.stub(processOperations, "processOperations");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should process block", function () {
    processEth1Stub.returns(0);
    processBlockHeaderStub.returns(0);
    processRandaoStub.returns(0);
    processOperationsStub.returns(0);
    processBlock(config, generateState(), generateEmptyBlock(), false);
    expect(processEth1Stub.calledOnce).to.be.true;
    expect(processBlockHeaderStub.calledOnce).to.be.true;
    expect(processRandaoStub.calledOnce).to.be.true;
    expect(processOperationsStub.calledOnce).to.be.true;
  });
});
