// To compile: npx hardhat compile
// To deploy: npx hardhat run --network goerli scripts/deploy.ts
// To verify: npx hardhat verify --network goerli <address> "0xde29d060D45901Fb19ED6C6e959EB22d8626708e"

import { ethers } from "hardhat"
import { starknet } from "hardhat"
import fs from "fs"

async function main() {
    // Set mode:
    //   testing - deploys a fake Starknet core contract for L1 <> L2 messaging
    //   live - uses the actual Starknet core contract for L1 <> L2 messaging
    const mode = "testing"

    // Preliminary information
    const [deployer] = await ethers.getSigners()
    console.log("Deploying L1 contracts with the account:", deployer.address)
    console.log("Account balance:", (await deployer.getBalance()).toString())

    // Deploy L1 factory contract
    const factoryContractFactory = await ethers.getContractFactory("RecoveryContractFactory")
    const factoryContract = await factoryContractFactory.deploy()
    await factoryContract.deployTransaction.wait()
    console.log("Deployed L1 recovery contract factory:", factoryContract.address)

    // Deploy fake L1 starknet core contract address
    const StarknetCoreFakeContractFactory = await ethers.getContractFactory("StarknetCoreFake")
    const StarknetCoreFakeContract = await StarknetCoreFakeContractFactory.deploy()
    await StarknetCoreFakeContract.deployTransaction.wait()
    console.log(`Deployed Starknet core contract (${mode} mode):`, StarknetCoreFakeContract.address)

    const starknetCoreContract = {
        live: "0xde29d060D45901Fb19ED6C6e959EB22d8626708e",
        testing: StarknetCoreFakeContract.address,
    }

    // Deploy L1 gateway contract
    const starknetCoreContractAddress = starknetCoreContract[mode]
    const gatewayContractFactory = await ethers.getContractFactory("GatewayContract")
    const gatewayContract = await gatewayContractFactory.deploy(starknetCoreContractAddress, factoryContract.address)
    await gatewayContract.deployTransaction.wait()
    console.log("Deployed L1 gateway contract:", gatewayContract.address)

    // Deploy fake ERC20 tokens
    const erc20FakeContract = await ethers.getContractFactory("ERC20Fake")
    const erc20Fake1 = await erc20FakeContract.deploy("USDC", "USDC")
    await erc20Fake1.deployTransaction.wait()
    console.log("Deployed fake USDC:", erc20Fake1.address)

    const erc20Fake2 = await erc20FakeContract.deploy("UNI", "UNI")
    await erc20Fake2.deployTransaction.wait()
    console.log("Deployed fake UNI:", erc20Fake2.address)

    const erc20Fake3 = await erc20FakeContract.deploy("WETH", "WETH")
    await erc20Fake3.deployTransaction.wait()
    console.log("Deployed fake WETH:", erc20Fake3.address)

    // Deploy L2 storage prover contract
    const factRegistryAddressFelt = 945446405930356733034975194720402002914171111673876520981451176768939208501n
    const L1HeadersStoreAddress = 837485042664063856828332244883203579059038878551051469326645034621781373797n

    const storageProverFactory = await starknet.getContractFactory("storage_prover")
    const storageProver = await storageProverFactory.deploy({
        _fact_registry_address: factRegistryAddressFelt,
        _L1_headers_store_address: L1HeadersStoreAddress,
        _L1_gateway_address: BigInt(gatewayContract.address),
    })
    console.log("Deployed L2 storage prover:", storageProver.address)

    // Write deployment addresses to scripts/deployments.txt
    const deploymentAddresses = {
        Mode: mode,
        Deployer: deployer.address,
        L1RecoveryContractFactory: factoryContract.address,
        L1StarknetCoreContract: starknetCoreContractAddress,
        L1GatewayContract: gatewayContract.address,
        L2StorageProverContract: storageProver.address,
        L1FakeUSDC: erc20Fake1.address,
        L1FakeUNI: erc20Fake2.address,
        L1FakeWETH: erc20Fake3.address,
    }

    fs.writeFileSync("scripts/deployments.json", JSON.stringify(deploymentAddresses))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
