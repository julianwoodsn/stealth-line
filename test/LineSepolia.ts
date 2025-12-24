import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { Line } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("LineSepolia", function () {
  let signers: Signers;
  let lineContract: Line;
  let lineContractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const lineDeployment = await deployments.get("Line");
      lineContractAddress = lineDeployment.address;
      lineContract = await ethers.getContractAt("Line", lineDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("creates a line and decrypts the secret", async function () {
    steps = 6;
    this.timeout(4 * 40000);

    progress("Creating line...");
    const tx = await lineContract.connect(signers.alice).createLine("Sepolia Relay");
    await tx.wait();

    progress("Fetching line count...");
    const lineCount = await lineContract.getLineCount();
    const lineId = Number(lineCount);

    progress(`Fetching line ${lineId} data...`);
    const lineData = await lineContract.getLine(lineId);
    const secretHandle = lineData[4];

    progress(`Decrypting secret handle ${secretHandle}...`);
    const secret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      secretHandle,
      lineContractAddress,
      signers.alice,
    );
    progress(`Decrypted secret: ${secret}`);

    expect(secret).to.be.greaterThanOrEqual(10_000_000);
    expect(secret).to.be.lessThanOrEqual(99_999_999);
  });
});
