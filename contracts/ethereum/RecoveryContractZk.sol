// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContract.sol";
import "./SecretClaimVerifier_plonk.sol";

contract RecoveryContractZkProof is RecoveryContract, SecretClaimVerifier_plonk {
    uint public hashedPassword;

    constructor(
        address _recipient, // default set to 0x
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA,
        uint _hashedPassword
    ) RecoveryContract(_recipient, _minBlocks, _gatewayContract, _EOA) {
        hashedPassword = _hashedPassword;
    }

    /// @notice verifies the validity of the proof, and confirms that the proof contains the new recipient.
    function verifyZkProof(bytes calldata proof, address _recipient) public view returns (bool isValid) {
        uint[] memory pubSignals = new uint[](2);
        pubSignals[0] = uint256(hashedPassword);
        pubSignals[1] = uint256(uint160(_recipient));
        require(this.verifyProof(proof,pubSignals), "Proof verification failed");
        return true;
    }


    function activateRecovery(uint256 blocks, bytes calldata proof, address _recipient) external onlyGateway {
        require(_recipient != address(0x0), "Null address");
        require(!isActive, "Already active");
        require(blocks >= minBlocks, "Inactivity too short");
        verifyZkProof(proof, _recipient);
        recipient = _recipient;
        isActive = true;
        emit ActiveRecovery(address(this), recipient, block.timestamp);
    }
}
