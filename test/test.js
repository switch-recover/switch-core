const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const { groth16, plonk } = require("snarkjs");

let account1, account2, account3;

function unstringifyBigInts(o) {
    if ((typeof(o) == "string") && (/^[0-9]+$/.test(o) ))  {
        return BigInt(o);
    } else if ((typeof(o) == "string") && (/^0x[0-9a-fA-F]+$/.test(o) ))  {
        return BigInt(o);
    } else if (Array.isArray(o)) {
        return o.map(unstringifyBigInts);
    } else if (typeof o == "object") {
        if (o===null) return null;
        const res = {};
        const keys = Object.keys(o);
        keys.forEach( (k) => {
            res[k] = unstringifyBigInts(o[k]);
        });
        return res;
    } else {
        return o;
    }
}

// describe("Recovery contract deployment", function () {
//     beforeEach(async function () {
//         [account1,account2, account3] = await ethers.getSigners();
//         RecoveryContractFactory = await ethers.getContractFactory("RecoveryContractFactory");
//         recoveryContractFactory = await RecoveryContractFactory.deploy();
        
//         GatewayContract = await ethers.getContractFactory("GatewayContract");
//         gatewayContract = await GatewayContract.deploy("0x0000000000000000000000000000000000000000",account3.address,recoveryContractFactory.address);
//         await gatewayContract.deployed();

//         await recoveryContractFactory.updateGatewayContract(gatewayContract.address);
//     });

//     it("Should deploy a recovery contract", async function () {
//         await gatewayContract.deployRecoveryContract(account2.address, 1000);
//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");

//         const RecoveryContract = await ethers.getContractFactory("RecoveryContract");
//         const recoveryContract = await RecoveryContract.attach(recoveryContractAddress);

//         expect(await recoveryContract.recipient()).to.equal(account2.address);
//     })

//     it("Should deploy a recovery contract with trusted agents", async function () {
//         await gatewayContract.deployRecoveryContractTrustedAgents(1000, "abcdedfg");
//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         expect().to.not.equal("0x0000000000000000000000000000000000000000");

//         const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents");
//         const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress);

//         expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address);
//         expect(await recoveryContractTrustedAgents.legalDocumentsHash()).to.equal("abcdedfg");
//     })

//     it("Should deploy a recovery contract with zk recovery", async function () {
//         await gatewayContract.deployRecoveryContractZk(1000, 2893183928);
//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");

//         const RecoveryContractZkProof = await ethers.getContractFactory("RecoveryContractZkProof");
//         const recoveryContractZkProof = await RecoveryContractZkProof.attach(recoveryContractAddress);

//         expect(await recoveryContractZkProof.hashedPassword()).to.equal(2893183928);
//     })

//     it("Shouldn't deploy a new recovery contract if already existing for EOA", async function () {
//         await gatewayContract.deployRecoveryContract(account2.address, 1000);

//         await expect(gatewayContract.deployRecoveryContract(account2.address, 1000)).to.be.revertedWith("Recovery already exists");
//         await expect(gatewayContract.deployRecoveryContractTrustedAgents(1000, "abcdedfg")).to.be.revertedWith("Recovery already exists");
//         await expect(gatewayContract.deployRecoveryContractZk(1000, 2893183928)).to.be.revertedWith("Recovery already exists");
//     })

//     it("Should terminate a recovery contract and allow for the creation of a new one", async function () {
//         await gatewayContract.deployRecoveryContract(account2.address, 1000);

//         await expect(gatewayContract.deployRecoveryContract(account2.address, 1000)).to.be.revertedWith("Recovery already exists");
//         await expect(gatewayContract.deployRecoveryContractTrustedAgents(1000, "abcdedfg")).to.be.revertedWith("Recovery already exists");
//         await expect(gatewayContract.deployRecoveryContractZk(1000, 2893183928)).to.be.revertedWith("Recovery already exists");

//         await gatewayContract.terminateRecoveryContract();
//         await gatewayContract.deployRecoveryContract(account2.address, 1000);

//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");
//     })

//     it("Should return an exception if terminating an non-existing recovery contract", async function () {
//         await expect(gatewayContract.terminateRecoveryContract()).to.be.revertedWith("No existing recovery");
//     })
// })

describe("Recovery contract recovery", function () {
    beforeEach(async function () {
        [account1,account2, account3] = await ethers.getSigners();
        RecoveryContractFactory = await ethers.getContractFactory("RecoveryContractFactory");
        recoveryContractFactory = await RecoveryContractFactory.deploy();

        StarknetCoreFake = await ethers.getContractFactory("StarknetCoreFake");
        starknetCoreFake = await StarknetCoreFake.deploy();
        
        GatewayContract = await ethers.getContractFactory("GatewayContract");
        gatewayContract = await GatewayContract.deploy(starknetCoreFake.address,account3.address,recoveryContractFactory.address);
        await gatewayContract.deployed();

        gatewayContract.setProverAddress("0x1234500000000000000000000000000000000000");

        await recoveryContractFactory.updateGatewayContract(gatewayContract.address);
    });

    it("Should recover from a recovery contract", async function () {
        await gatewayContract.deployRecoveryContract(account2.address, 1000);
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract");
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress);

        expect(await recoveryContract.isActive()).to.equal(false);
        await gatewayContract.activateRecovery(BigInt(account1.address), 1000);
        expect(await recoveryContract.isActive()).to.equal(true);
    })

    it("Should fail the recovery if the L2 message cannot be consumed", async function () {
        await gatewayContract.deployRecoveryContract(account2.address, 1000);
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract");
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress);

        expect(await recoveryContract.isActive()).to.equal(false);
        await starknetCoreFake.toggleIsValid();
        await expect (gatewayContract.activateRecovery(BigInt(account2.address), 1000)).to.be.revertedWith("INVALID_MESSAGE_TO_CONSUME");
    })

    it("Should fail the recovery if the minBlocks is too small", async function () {
        await gatewayContract.deployRecoveryContract(account2.address, 1000);
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        expect(recoveryContractAddress).to.not.equal("0x0000000000000000000000000000000000000000");

        const RecoveryContract = await ethers.getContractFactory("RecoveryContract");
        const recoveryContract = await RecoveryContract.attach(recoveryContractAddress);

        expect(await recoveryContract.isActive()).to.equal(false);
        await expect (gatewayContract.activateRecovery(BigInt(account1.address), 100)).to.be.revertedWith("Inactivity too short");
    })

    it("Should recover from a recovery contract with trusted agents", async function () {
        await gatewayContract.deployRecoveryContractTrustedAgents(1000, "abcdedfg");
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        expect().to.not.equal("0x0000000000000000000000000000000000000000");

        const RecoveryContractTrustedAgents = await ethers.getContractFactory("RecoveryContractTrustedAgents");
        const recoveryContractTrustedAgents = await RecoveryContractTrustedAgents.attach(recoveryContractAddress);

        expect(await recoveryContractTrustedAgents.recipient()).to.equal(account3.address);
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(false);
        await gatewayContract.activateRecovery(BigInt(account1.address), 1000);
        expect(await recoveryContractTrustedAgents.isActive()).to.equal(true);
    })

    it("Should recover from a recovery contract with zk recovery", async function () {
        // The following code is temp fix to generate the Pedersen Hash (argv[1]) for deployment
        const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient": account2.address}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");
        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);
        const argv = calldata.replace(/["[\]\s]/g, "").split(',')

        await gatewayContract.deployRecoveryContractZk(1000, argv[1]);
        RecoveryContractZkProof = await ethers.getContractFactory("RecoveryContractZkProof");
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        const recoveryContractZkProof = await RecoveryContractZkProof.attach(recoveryContractAddress);

        expect(await recoveryContractZkProof.hashedPassword()).to.equal(argv[1]);
        expect(await recoveryContractZkProof.isActive()).to.equal(false);

        await gatewayContract.activateRecoveryZkProof(BigInt(account1.address), 1000, argv[0], account2.address);
        expect(await recoveryContractZkProof.isActive()).to.equal(true);
    })
})

// describe("Recovery contract using zk proof (PLONK)", function () {
//     let Verifier;
//     let verifier;

//     beforeEach(async function () {
//         [account1,account2] = await ethers.getSigners();
//         Verifier = await ethers.getContractFactory("SecretClaimVerifier_plonk");
//         verifier = await Verifier.deploy();
//         await verifier.deployed();
//     });

//     it("Should return true for correct proof", async function () {
//         const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient":"0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631"}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");
//         // console.log(publicSignals[0]);

//         const editedPublicSignals = unstringifyBigInts(publicSignals);
//         const editedProof = unstringifyBigInts(proof);
//         const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

//         const argv = calldata.replace(/["[\]\s]/g, "").split(',')
//         expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;
//     });
//     it("Should return false for invalid proof", async function () {
//         const proof = "0x00";
//         expect(await verifier.verifyProof(proof, [0,1])).to.be.false;
//     });

//     it("Should return true for correct proof on the smart contract", async function () {
//         const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient": account2.address}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");

//         const editedPublicSignals = unstringifyBigInts(publicSignals);
//         const editedProof = unstringifyBigInts(proof);
//         const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

//         const argv = calldata.replace(/["[\]\s]/g, "").split(',')

//         // console.log("test", [argv[1],argv[2]]);
//         expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;

//         RecoveryContractFactory = await ethers.getContractFactory("RecoveryContractFactory");
//         recoveryContractFactory = await RecoveryContractFactory.deploy();

//         GatewayContract = await ethers.getContractFactory("GatewayContract");
//         gatewayContract = await GatewayContract.deploy("0x0000000000000000000000000000000000000000","0x0000000000000000000000000000000000000000", recoveryContractFactory.address);
//         await gatewayContract.deployed();

//         await recoveryContractFactory.updateGatewayContract(gatewayContract.address);

//         await gatewayContract.deployRecoveryContractZk(10, argv[1]);
//         RecoveryContractZkProof = await ethers.getContractFactory("RecoveryContractZkProof");
//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         const recoveryContract = await RecoveryContractZkProof.attach(recoveryContractAddress);

//         // has to match the pre-inserted account2 into the proof
//         await recoveryContract.connect(account1).verifyZkProof(argv[0], account2.address);
//     });

//     it("Should fail if the proof doesn't match the defined address", async function () {
//         const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient": account2.address}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");

//         const editedPublicSignals = unstringifyBigInts(publicSignals);
//         const editedProof = unstringifyBigInts(proof);
//         const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

//         const argv = calldata.replace(/["[\]\s]/g, "").split(',')
//         expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;

//         RecoveryContractFactory = await ethers.getContractFactory("RecoveryContractFactory");
//         recoveryContractFactory = await RecoveryContractFactory.deploy();

//         GatewayContract = await ethers.getContractFactory("GatewayContract");
//         gatewayContract = await GatewayContract.deploy("0x0000000000000000000000000000000000000000","0x0000000000000000000000000000000000000000", recoveryContractFactory.address);
//         await gatewayContract.deployed();

//         await recoveryContractFactory.updateGatewayContract(gatewayContract.address);

//         await gatewayContract.deployRecoveryContractZk(10, argv[1]);
//         RecoveryContractZkProof = await ethers.getContractFactory("RecoveryContractZkProof");
//         const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
//         const recoveryContract = await RecoveryContractZkProof.attach(recoveryContractAddress);

//         await expect(recoveryContract.connect(account1).verifyZkProof(argv[0], account1.address)).to.revertedWith("Proof verification failed");
//     });
// });