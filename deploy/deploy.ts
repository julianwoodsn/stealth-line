import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedLine = await deploy("Line", {
    from: deployer,
    log: true,
  });

  console.log(`Line contract: `, deployedLine.address);
};
export default func;
func.id = "deploy_line"; // id required to prevent reexecution
func.tags = ["Line"];
