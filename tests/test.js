console.log("running");

const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const { groth16, plonk } = require("snarkjs");

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

describe("SecretClaim for groth16", function () {
    let Verifier;
    let verifier;

    beforeEach(async function () {
        Verifier = await ethers.getContractFactory("GatewayContract");
        verifier = await Verifier.deploy();
        await verifier.deployed();
    });

    it("Should return true for correct proof", async function () {
        //[assignment] Add comments to explain what each line is doing
        // computes the witness based on inputs
        const { proof, publicSignals } = await groth16.fullProve({"key":"212","secret":"3333", "recipient":"0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631"}, "contracts/circuits/SecretClaim/SecretClaim_js/SecretClaim.wasm","contracts/circuits/SecretClaim/circuit_final.zkey");

        console.log(publicSignals[0]);

        // convert string to BigInt
        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);

        // retrieves the calldata that we need to pass to the solidity contract
        const calldata = await groth16.exportSolidityCallData(editedProof, editedPublicSignals);

        const argv = calldata.replace(/["[\]\s]/g, "").split(',').map(x => BigInt(x).toString());

        const a = [argv[0], argv[1]];
        const b = [[argv[2], argv[3]], [argv[4], argv[5]]];
        const c = [argv[6], argv[7]];
        const Input = argv.slice(8);

        console.log(BigInt(Input[1]).toString())

        // pass in secret phrase and address
        // inside the circuit stores the correct hash
        // check that the hash matches and spit out the proof

        // makes sure that the proof is correct
        expect(await verifier.verifyProof(a, b, c, Input)).to.be.true;
    });
    it("Should return false for invalid proof", async function () {
        let a = [0, 0];
        let b = [[0, 0], [0, 0]];
        let c = [0, 0];
        let d = [0, 0]
        expect(await verifier.verifyProof(a, b, c, d)).to.be.false;
    });

    it("Should accept a valid proof", async function () {
        //[assignment] Add comments to explain what each line is doing
        // computes the witness based on inputs
        const { proof, publicSignals } = await groth16.fullProve({"key":"212","secret":"3333", "recipient":"0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631"}, "contracts/circuits/SecretClaim/SecretClaim_js/SecretClaim.wasm","contracts/circuits/SecretClaim/circuit_final.zkey");

        console.log(publicSignals[0]);

        // convert string to BigInt
        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);

        // retrieves the calldata that we need to pass to the solidity contract
        const calldata = await groth16.exportSolidityCallData(editedProof, editedPublicSignals);

        const argv = calldata.replace(/["[\]\s]/g, "").split(',').map(x => BigInt(x).toString());

        const a = [argv[0], argv[1]];
        const b = [[argv[2], argv[3]], [argv[4], argv[5]]];
        const c = [argv[6], argv[7]];
        const Input = argv.slice(8);

        console.log(BigInt(Input[1]).toString())

        // pass in secret phrase and address
        // inside the circuit stores the correct hash
        // check that the hash matches and spit out the proof

        // makes sure that the proof is correct
        expect(await verifier.verifyProof(a, b, c, Input)).to.be.true;
    });
});

describe("SecretClaim with PLONK", function () {
    let Verifier;
    let verifier;
    let SecretClaim;
    let secretClaim;
    let account1, account2;

    beforeEach(async function () {
        [
            account1,
            account2, ] = await ethers.getSigners();
        Verifier = await ethers.getContractFactory("SecretClaimVerifier_plonk");
        verifier = await Verifier.deploy();
        await verifier.deployed();
    });

    it("Should return true for correct proof", async function () {
        const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient":"0x34B716A2B8bFeBC37322f6E33b3472D71BBc5631"}, "contracts/circuits/SecretClaim_plonk/SecretClaim_js/SecretClaim.wasm","contracts/circuits/SecretClaim_plonk/circuit_final.zkey");
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
        const { proof, publicSignals } = await plonk.fullProve({"key":"212","secret":"3333", "recipient": account1.address}, "contracts/circuits/SecretClaim_plonk/SecretClaim_js/SecretClaim.wasm","contracts/circuits/SecretClaim_plonk/circuit_final.zkey");

        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);
        const calldata = await plonk.exportSolidityCallData(editedProof, editedPublicSignals);

        const argv = calldata.replace(/["[\]\s]/g, "").split(',')

        console.log("test", [argv[1],argv[2]]);
        expect(await verifier.verifyProof(argv[0], [argv[1],argv[2]])).to.be.true;

        SecretClaim = await ethers.getContractFactory("SecretClaim");
        secretClaim = await SecretClaim.deploy(argv[1]);
        await secretClaim.deployed();

        // has to match account1, cannot front run`
        await secretClaim.connect(account1).verifyZkProof(argv[0]);
    });

});