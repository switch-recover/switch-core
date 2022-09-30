const { expect } = require("chai")
const { ethers } = require("hardhat")
const { starknet } = require("hardhat")
const { groth16, plonk } = require("snarkjs")
const { unstringifyBigInts } = require("ffjavascript").utils

let account1, account2, account3

const deployContracts = async () => {
    // Signers
    ;[account1, account2, account3] = await ethers.getSigners()

    // Deploy L1 factory contract
    RecoveryContractFactory = await ethers.getContractFactory("RecoveryContractFactory")
    recoveryContractFactory = await RecoveryContractFactory.deploy()
    await recoveryContractFactory.deployed()
    // console.log("Deployed L1 recovery contract factory:", recoveryContractFactory.address)

    // Deploy fake L1 starknet core contract address
    FakeStarknetCoreContract = await ethers.getContractFactory("StarknetCoreFake")
    fakeStarknetCoreContract = await FakeStarknetCoreContract.deploy()
    await fakeStarknetCoreContract.deployed()
    // console.log("Deployed fake L1 Starknet core contract:", fakeStarknetCoreContract.address)

    // Deploy L1 gateway contract
    GatewayContract = await ethers.getContractFactory("GatewayContract")
    gatewayContract = await GatewayContract.deploy(fakeStarknetCoreContract.address, recoveryContractFactory.address)
    await gatewayContract.deployed()
    // console.log("Deployed L1 gateway contract:", gatewayContract.address)

    // Deploy L2 storage prover contract
    const factRegistryAddressFelt = 945446405930356733034975194720402002914171111673876520981451176768939208501n
    const L1HeadersStoreAddress = 837485042664063856828332244883203579059038878551051469326645034621781373797n
    StorageProverContract = await starknet.getContractFactory("storage_prover")
    storageProverContract = await StorageProverContract.deploy({
        _fact_registry_address: factRegistryAddressFelt,
        _L1_headers_store_address: L1HeadersStoreAddress,
        _L1_gateway_address: BigInt(gatewayContract.address),
    })
    // console.log("Deployed L2 storage prover:", storageProverContract.address)

    // Deploy fake ERC20 tokens
    erc20FakeContract = await ethers.getContractFactory("ERC20Fake")
    USDCContract = await erc20FakeContract.deploy("USDC", "USDC")
    await USDCContract.deployed()
    // console.log("Deployed fake USDC:", UsdcFakeContract.address)
    await USDCContract._mint(account1.address, ethers.utils.parseEther("100"))

    DAIContract = await erc20FakeContract.deploy("DAI", "DAI")
    await DAIContract.deployed()
    // console.log("Deployed fake DAI:", DAIContract.address)
    await DAIContract._mint(account1.address, ethers.utils.parseEther("5000"))

    WethFakeContract = await erc20FakeContract.deploy("WETH", "WETH")
    await WethFakeContract.deployTransaction.wait()
    // console.log("Deployed fake WETH:", WethFakeContract.address)

    // Set StorageProver contract address in L1 gateway contract
    await gatewayContract.setProverAddress(BigInt(storageProverContract.address))
    // console.log("Set StorageProver contract address in L1 gateway contract")

    // Set gateway contract address in recovery contract factory
    await recoveryContractFactory.setGatewayContract(gatewayContract.address)
    // console.log("Set gateway contract address in recovery contract factory")

    // Set trusted agent
    await gatewayContract.updateTrustedAgent(account3.address)
}

const generateZkProof = async (account) => {
    /// The following snippet is temp fix to generate the Pedersen Hash (argv[1]) for deployment
    const { proof, publicSignals } = await plonk.fullProve(
        { key: "212", secret: "3333", recipient: account.address },
        "circuits/SecretClaim.wasm",
        "circuits/circuit_final.zkey"
    )
    const editedPublicSignals = unstringifyBigInts(publicSignals)
    const editedProof = unstringifyBigInts(proof)
    const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals)
    const argv = calldata.replace(/["[\]\s]/g, "").split(",")
    return { zkProof: argv[0], hashedPassword: argv[1] }
}

describe("Contract deployment", function () {
    beforeEach(deployContracts)

    it("Should deploy a recovery contract", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000")

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)
        expect(await recoveryContract.recipient()).to.equal(account2.address)
    })

    it("Should deploy a recovery contract with password", async function () {
        await recoveryContractFactory.deployPasswordRecoveryContract(2893183928, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000")

        const RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        expect(await recoveryContractPassword.hashedPassword()).to.equal(2893183928)
    })

    it("Should deploy a recovery contract with trusted agents", async function () {
        await recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        expect().to.not.equal("0x0000000000000000000000000000000000000000")

        const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents")
        const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress)
        expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address)
        expect(await recoveryContractTrustedAgents.legalDocumentsHash()).to.equal("abcdedfg")
    })

    it("Shouldn't deploy a new recovery contract if already existing for EOA", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        await expect(recoveryContractFactory.deployRecoveryContract(account2.address, 1000)).to.be.revertedWith(
            "Existing recovery contract"
        )
        await expect(recoveryContractFactory.deployPasswordRecoveryContract(2893183928, 1000)).to.be.revertedWith(
            "Existing recovery contract"
        )
        await expect(recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)).to.be.revertedWith(
            "Existing recovery contract"
        )
    })

    it("Should terminate a recovery contract and allow for the creation of a new one", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)

        await gatewayContract.terminateRecoveryContract()
        await expect(recoveryContractFactory.deployRecoveryContract(account2.address, 1000)).to.not.be.revertedWith(
            "Existing recovery contract"
        )

        await gatewayContract.terminateRecoveryContract()
        await expect(recoveryContractFactory.deployPasswordRecoveryContract(2893183928, 1000)).to.not.be.revertedWith(
            "Existing recovery contract"
        )

        await gatewayContract.terminateRecoveryContract()
        await expect(
            recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)
        ).to.not.be.revertedWith("Existing recovery contract")
    })

    it("Should return an exception if terminating an non-existing recovery contract", async function () {
        await expect(gatewayContract.terminateRecoveryContract()).to.be.revertedWith("No existing recovery")
    })
})

describe("Contract activation", function () {
    beforeEach(deployContracts)

    it("Should be able to activate a recovery contract", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)

        expect(await recoveryContract.isActive()).to.equal(false)
        await gatewayContract.activateRecoveryContract(account1.address, 1000)
        expect(await recoveryContract.isActive()).to.equal(true)
    })

    it("Should fail to activate contract if the L2 message cannot be consumed", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)

        expect(await recoveryContract.isActive()).to.equal(false)
        await fakeStarknetCoreContract.toggleIsValid()
        await expect(gatewayContract.activateRecoveryContract(account2.address, 1000)).to.be.revertedWith(
            "INVALID_MESSAGE_TO_CONSUME"
        )
    })

    it("Should fail to activate contract if the minBlocks is too small", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)

        expect(await recoveryContract.isActive()).to.equal(false)
        await expect(gatewayContract.activateRecoveryContract(account1.address, 100)).to.be.revertedWith(
            "Inactivity too short"
        )
    })

    it("Should be able to activate a password recovery contract", async function () {
        const { zkProof, hashedPassword } = await generateZkProof(account2)

        await recoveryContractFactory.deployPasswordRecoveryContract(hashedPassword, 1000)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        expect(await recoveryContractPassword.hashedPassword()).to.equal(hashedPassword)
        expect(await recoveryContractPassword.isActive()).to.equal(false)

        await gatewayContract.activateRecoveryContractPassword(account1.address, 1000, zkProof, account2.address)
        expect(await recoveryContractPassword.isActive()).to.equal(true)
    })

    it("Should be able to activate recovery contract with trusted agents", async function () {
        await recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents")
        const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress)

        expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(false)
        await gatewayContract.activateRecoveryContract(account1.address, 1000)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(true)
    })

    it("Should fail to activate password recovery contract if the recipient is wrong", async function () {
        const { zkProof, hashedPassword } = await generateZkProof(account2)

        await recoveryContractFactory.deployPasswordRecoveryContract(hashedPassword, 1000)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        expect(await recoveryContractPassword.hashedPassword()).to.equal(hashedPassword)
        expect(await recoveryContractPassword.isActive()).to.equal(false)

        await expect(
            gatewayContract.activateRecoveryContractPassword(account1.address, 1000, zkProof, account3.address)
        ).to.be.revertedWith("Proof verification failed")
    })
})

describe("Asset recovery", function () {
    beforeEach(deployContracts)

    it("Should fail claiming if recovery contract is inactive", async function () {
        await recoveryContractFactory.deployRecoveryContract(account2.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)

        expect(await recoveryContract.isActive()).to.equal(false)
        await expect(
            recoveryContract.connect(account2).claimAssets([USDCContract.address, DAIContract.address], [10, 10])
        ).to.be.revertedWith("Not active")
    })

    it("Should be able to claim from an active recovery contract", async function () {
        await recoveryContractFactory.deployRecoveryContract(account3.address, 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract")
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress)

        expect(Number(await USDCContract.balanceOf(account1.address))).to.equal(Number(ethers.utils.parseEther("100")))
        expect(Number(await DAIContract.balanceOf(account1.address))).to.equal(Number(ethers.utils.parseEther("5000")))

        await USDCContract.connect(account1).approve(
            recoveryContract.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )
        await DAIContract.connect(account1).approve(
            recoveryContract.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )

        await gatewayContract.activateRecoveryContract(account1.address, 1000)
        expect(await recoveryContract.isActive()).to.equal(true)

        await recoveryContract
            .connect(account3)
            .claimAssets(
                [USDCContract.address, DAIContract.address],
                [ethers.utils.parseEther("100"), ethers.utils.parseEther("5000")]
            )

        expect(await USDCContract.balanceOf(account3.address)).to.equal(ethers.utils.parseEther("100"))
        expect(await DAIContract.balanceOf(account3.address)).to.equal(ethers.utils.parseEther("5000"))
        expect(await USDCContract.balanceOf(account1.address)).to.equal(0)
        expect(await DAIContract.balanceOf(account1.address)).to.equal(0)
    })

    it("Should recover from a password recovery contract", async function () {
        const { zkProof, hashedPassword } = await generateZkProof(account2)

        await recoveryContractFactory.deployPasswordRecoveryContract(hashedPassword, 1000)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        await USDCContract.connect(account1).approve(
            recoveryContractPassword.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )
        await DAIContract.connect(account1).approve(
            recoveryContractPassword.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )

        expect(await recoveryContractPassword.hashedPassword()).to.equal(hashedPassword)
        expect(await recoveryContractPassword.isActive()).to.equal(false)

        await gatewayContract.activateRecoveryContractPassword(account1.address, 1000, zkProof, account2.address)
        expect(await recoveryContractPassword.isActive()).to.equal(true)

        await recoveryContractPassword
            .connect(account2)
            .claimAssets(
                [USDCContract.address, DAIContract.address],
                [ethers.utils.parseEther("100"), ethers.utils.parseEther("5000")]
            )

        expect(await USDCContract.balanceOf(account2.address)).to.equal(ethers.utils.parseEther("100"))
        expect(await DAIContract.balanceOf(account2.address)).to.equal(ethers.utils.parseEther("5000"))
        expect(await USDCContract.balanceOf(account1.address)).to.equal(0)
        expect(await DAIContract.balanceOf(account1.address)).to.equal(0)
    })

    it("Should recover from a recovery contract with trusted agents", async function () {
        await recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents")
        const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress)

        await USDCContract.connect(account1).approve(
            recoveryContractTrustedAgents.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )
        await DAIContract.connect(account1).approve(
            recoveryContractTrustedAgents.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )

        expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(false)
        await gatewayContract.activateRecoveryContract(account1.address, 1000)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(true)

        await recoveryContractTrustedAgents
            .connect(account3)
            .claimAssets(
                [USDCContract.address, DAIContract.address],
                [ethers.utils.parseEther("100"), ethers.utils.parseEther("5000")]
            )

        expect(await USDCContract.balanceOf(account3.address)).to.equal(ethers.utils.parseEther("100"))
        expect(await DAIContract.balanceOf(account3.address)).to.equal(ethers.utils.parseEther("5000"))
        expect(await USDCContract.balanceOf(account1.address)).to.equal(0)
        expect(await DAIContract.balanceOf(account1.address)).to.equal(0)
    })

    it("Should fail claiming from trusted agents if recipient is incorrect", async function () {
        await recoveryContractFactory.deployTrustedAgentRecoveryContract("abcdedfg", 1000)
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)

        const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents")
        const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress)

        await USDCContract.connect(account1).approve(
            recoveryContractTrustedAgents.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )
        await DAIContract.connect(account1).approve(
            recoveryContractTrustedAgents.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )

        expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(false)
        await gatewayContract.activateRecoveryContract(BigInt(account1.address), 1000)
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(true)

        await expect(
            recoveryContractTrustedAgents
                .connect(account2)
                .claimAssets(
                    [USDCContract.address, DAIContract.address],
                    [ethers.utils.parseEther("100"), ethers.utils.parseEther("5000")]
                )
        ).to.be.revertedWith("Only recipient")
    })

    it("Should fail claiming from zk proof methodology if recipient is incorrect", async function () {
        const { zkProof, hashedPassword } = await generateZkProof(account2)

        await recoveryContractFactory.deployPasswordRecoveryContract(hashedPassword, 1000)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        await USDCContract.connect(account1).approve(
            recoveryContractPassword.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )
        await DAIContract.connect(account1).approve(
            recoveryContractPassword.address,
            ethers.BigNumber.from(ethers.utils.parseEther("10000000"))
        )

        expect(await recoveryContractPassword.hashedPassword()).to.equal(hashedPassword)
        expect(await recoveryContractPassword.isActive()).to.equal(false)

        await gatewayContract.activateRecoveryContractPassword(account1.address, 1000, zkProof, account2.address)
        expect(await recoveryContractPassword.isActive()).to.equal(true)

        await expect(
            recoveryContractPassword
                .connect(account1)
                .claimAssets(
                    [USDCContract.address, DAIContract.address],
                    [ethers.utils.parseEther("100"), ethers.utils.parseEther("5000")]
                )
        ).to.be.revertedWith("Only recipient")
    })
})

describe("Zk proof testing (PLONK)", function () {
    let Verifier
    let verifier

    beforeEach(deployContracts)

    beforeEach(async function () {
        ;[account1, account2] = await ethers.getSigners()
        Verifier = await ethers.getContractFactory("SecretClaimVerifier_plonk")
        verifier = await Verifier.deploy()
        await verifier.deployed()
    })

    it("Should return true for correct proof", async function () {
        const { proof, publicSignals } = await plonk.fullProve(
            { key: "212", secret: "3333", recipient: "0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631" },
            "circuits/SecretClaim.wasm",
            "circuits/circuit_final.zkey"
        )
        // console.log(publicSignals[0]);

        const editedPublicSignals = unstringifyBigInts(publicSignals)
        const editedProof = unstringifyBigInts(proof)
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals)

        const argv = calldata.replace(/["[\]\s]/g, "").split(",")
        expect(await verifier.verifyProof(argv[0], [argv[1], argv[2]])).to.be.true
    })
    it("Should return false for invalid proof", async function () {
        const proof = "0x00"
        expect(await verifier.verifyProof(proof, [0, 1])).to.be.false
    })

    it("Should return true for correct proof on the smart contract", async function () {
        const { proof, publicSignals } = await plonk.fullProve(
            { key: "212", secret: "3333", recipient: account2.address },
            "circuits/SecretClaim.wasm",
            "circuits/circuit_final.zkey"
        )

        const editedPublicSignals = unstringifyBigInts(publicSignals)
        const editedProof = unstringifyBigInts(proof)
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals)

        const argv = calldata.replace(/["[\]\s]/g, "").split(",")

        // console.log("test", [argv[1],argv[2]]);
        expect(await verifier.verifyProof(argv[0], [argv[1], argv[2]])).to.be.true

        await recoveryContractFactory.deployPasswordRecoveryContract(argv[1], 10)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        // has to match the pre-inserted account2 into the proof
        await recoveryContractPassword.connect(account1).verifyZkProof(argv[0], account2.address)
    })

    it("Should fail if the proof doesn't match the defined address", async function () {
        const { proof, publicSignals } = await plonk.fullProve(
            { key: "212", secret: "3333", recipient: account2.address },
            "circuits/SecretClaim.wasm",
            "circuits/circuit_final.zkey"
        )

        const editedPublicSignals = unstringifyBigInts(publicSignals)
        const editedProof = unstringifyBigInts(proof)
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals)

        const argv = calldata.replace(/["[\]\s]/g, "").split(",")
        expect(await verifier.verifyProof(argv[0], [argv[1], argv[2]])).to.be.true

        await recoveryContractFactory.deployPasswordRecoveryContract(argv[1], 10)
        RecoveryContractPassword = await ethers.getContractFactory("RecoveryContractPassword")
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address)
        const recoveryContractPassword = await RecoveryContractPassword.attach(recoveryContractAddress)

        await expect(
            recoveryContractPassword.connect(account1).verifyZkProof(argv[0], account1.address)
        ).to.revertedWith("Proof verification failed")
    })
})

// TODO: ADD TESTS TO ALL THE UPDATE RELATED CONTRACTS
