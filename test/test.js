const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const { groth16, plonk } = require("snarkjs");

let account1, account2;

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

describe("SecretClaim with PLONK", function () {
    let Verifier;
    let verifier;

    beforeEach(async function () {
        [account1,account2] = await ethers.getSigners();
        Verifier = await ethers.getContractFactory("SecretClaimVerifier_plonk");
        verifier = await Verifier.deploy();
        await verifier.deployed();
    });

    it("Should return true for correct proof", async function () {
        const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient":"0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631"}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");
        console.log(publicSignals[0]);

        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

        const argv = calldata.replace(/["[\]\s]/g, "").split(',')
        expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;
    });
    it("Should return false for invalid proof", async function () {
        const proof = "0x00";
        expect(await verifier.verifyProof(proof, [0,1])).to.be.false;
    });

    it("Should return true for correct proof on the smart contract", async function () {
        const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient": account2.address}, "../circuits/SecretClaim.wasm","../circuits/circuit_final.zkey");

        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

        const argv = calldata.replace(/["[\]\s]/g, "").split(',')

        console.log("test", [argv[1],argv[2]]);
        expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;

        GatewayContract = await ethers.getContractFactory("GatewayContract");
        gatewayContract = await GatewayContract.deploy("0x0000000000000000000000000000000000000000","0x0000000000000000000000000000000000000000");
        await gatewayContract.deployed();

        await gatewayContract.deployRecoveryContractZk(10, argv[1]);
        RecoveryContractZkProof = await ethers.getContractFactory("RecoveryContractZkProof");
        const recoveryContractAddress = await gatewayContract.eoaToRecoveryContract(account1.address);
        console.log("worked", recoveryContractAddress);
        const recoveryContract = await RecoveryContractZkProof.attach(recoveryContractAddress);

        // has to match the pre-inserted account2 into the proof
        await recoveryContract.connect(account1).verifyZkProof(argv[0], account2.address);
    });

});