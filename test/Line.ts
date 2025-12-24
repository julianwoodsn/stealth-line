import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { Line, Line__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("Line")) as Line__factory;
  const lineContract = (await factory.deploy()) as Line;
  const lineContractAddress = await lineContract.getAddress();

  return { lineContract, lineContractAddress };
}

describe("Line", function () {
  let signers: Signers;
  let lineContract: Line;
  let lineContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ lineContract, lineContractAddress } = await deployFixture());
  });

  it("creates a line and stores a decryptable 8-digit secret", async function () {
    const lineName = "Night Shift";
    const tx = await lineContract.connect(signers.alice).createLine(lineName);
    await tx.wait();

    const lineCount = await lineContract.getLineCount();
    expect(lineCount).to.eq(1n);

    const lineData = await lineContract.getLine(1);
    expect(lineData[0]).to.eq(lineName);
    expect(lineData[1]).to.eq(signers.alice.address);
    expect(lineData[3]).to.eq(1n);

    const secret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      lineData[4],
      lineContractAddress,
      signers.alice,
    );

    expect(secret).to.be.greaterThanOrEqual(10_000_000);
    expect(secret).to.be.lessThanOrEqual(99_999_999);
  });

  it("allows members to decrypt the same secret", async function () {
    await lineContract.connect(signers.alice).createLine("Shadow Loop");
    await lineContract.connect(signers.bob).joinLine(1);

    const isMember = await lineContract.isMember(1, signers.bob.address);
    expect(isMember).to.eq(true);

    const lineData = await lineContract.getLine(1);
    const aliceSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      lineData[4],
      lineContractAddress,
      signers.alice,
    );
    const bobSecret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      lineData[4],
      lineContractAddress,
      signers.bob,
    );

    expect(bobSecret).to.eq(aliceSecret);
  });

  it("stores encrypted messages from members", async function () {
    await lineContract.connect(signers.alice).createLine("Cipher Room");

    await expect(
      lineContract.connect(signers.bob).sendMessage(1, "0xdeadbeef"),
    ).to.be.revertedWithCustomError(lineContract, "NotMember");

    const encryptedMessage = "0xdeadbeef";
    await lineContract.connect(signers.alice).sendMessage(1, encryptedMessage);

    const messageCount = await lineContract.getMessageCount(1);
    expect(messageCount).to.eq(1n);

    const message = await lineContract.getMessage(1, 0);
    expect(message[0]).to.eq(signers.alice.address);
    expect(message[2]).to.eq(encryptedMessage);
  });
});
