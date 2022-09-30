// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContract.sol";
import "./SecretClaimVerifier_plonk.sol";

contract RecoveryContractPassword is
    RecoveryContract,
    SecretClaimVerifier_plonk
{
    uint256 public hashedPassword;

    constructor(
        uint256 _hashedPassword,
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA
    ) RecoveryContract(address(0), _minBlocks, _gatewayContract, _EOA) {
        hashedPassword = _hashedPassword;
    }

    /// @notice verifies the validity of the proof, and confirms that the proof contains the new recipient.
    function verifyZkProof(bytes calldata proof, address _recipient)
        public
        view
        returns (bool isValid)
    {
        uint256[] memory pubSignals = new uint256[](2);
        pubSignals[0] = uint256(hashedPassword);
        pubSignals[1] = uint256(uint160(_recipient));
        require(
            this.verifyProof(proof, pubSignals),
            "Proof verification failed"
        );
        return true;
    }

    function activateRecovery(
        uint256 blocks,
        bytes calldata proof,
        address _recipient
    )
        external
        onlyGateway
        returns (
            address,
            address,
            address
        )
    {
        require(_recipient != address(0), "Null address");
        require(!isActive, "Already active");
        require(blocks >= minBlocks, "Inactivity too short");
        verifyZkProof(proof, _recipient);
        isActive = true;
        recipient = _recipient;
        return (EOA, address(this), _recipient);
    }
}
