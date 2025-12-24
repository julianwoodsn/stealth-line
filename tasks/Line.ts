import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

function encryptMessage(plaintext: string, secret: number): string {
  const data = Buffer.from(plaintext, "utf8");
  const output = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const keyByte = (secret >> ((i % 4) * 8)) & 0xff;
    output[i] = data[i] ^ keyByte;
  }
  return `0x${output.toString("hex")}`;
}

task("task:line-address", "Prints the Line contract address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const line = await deployments.get("Line");
  console.log("Line address is " + line.address);
});

task("task:create-line", "Creates a Line with a random 8-digit secret")
  .addParam("name", "Line name")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const lineDeployment = await deployments.get("Line");
    const signers = await ethers.getSigners();
    const lineContract = await ethers.getContractAt("Line", lineDeployment.address);

    const tx = await lineContract.connect(signers[0]).createLine(taskArguments.name);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    let lineId: string | undefined;
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = lineContract.interface.parseLog(log);
        if (parsed?.name === "LineCreated") {
          lineId = parsed.args.lineId.toString();
          break;
        }
      } catch {
        // Ignore non-Line logs.
      }
    }

    console.log(`Line created with id=${lineId ?? "unknown"}`);
  });

task("task:join-line", "Joins a Line to gain secret access")
  .addParam("lineid", "Line id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const lineDeployment = await deployments.get("Line");
    const signers = await ethers.getSigners();
    const lineContract = await ethers.getContractAt("Line", lineDeployment.address);

    const tx = await lineContract.connect(signers[0]).joinLine(taskArguments.lineid);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Joined line ${taskArguments.lineid}`);
  });

task("task:decrypt-line-secret", "Decrypts the Line secret for the caller")
  .addParam("lineid", "Line id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const lineDeployment = await deployments.get("Line");
    const signers = await ethers.getSigners();
    const lineContract = await ethers.getContractAt("Line", lineDeployment.address);

    const lineData = await lineContract.getLine(taskArguments.lineid);
    const secretHandle = lineData[4];

    const secret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      secretHandle,
      lineDeployment.address,
      signers[0],
    );

    console.log(`Line ${taskArguments.lineid} secret: ${secret}`);
  });

task("task:send-message", "Encrypts and sends a message to a Line")
  .addParam("lineid", "Line id")
  .addParam("message", "Plaintext message")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const lineDeployment = await deployments.get("Line");
    const signers = await ethers.getSigners();
    const lineContract = await ethers.getContractAt("Line", lineDeployment.address);

    const lineData = await lineContract.getLine(taskArguments.lineid);
    const secretHandle = lineData[4];

    const secret = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      secretHandle,
      lineDeployment.address,
      signers[0],
    );

    const encryptedMessage = encryptMessage(taskArguments.message, Number(secret));
    const tx = await lineContract.connect(signers[0]).sendMessage(taskArguments.lineid, encryptedMessage);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log("Message sent.");
  });
