// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContract.sol";

contract RecoveryContractTrustedAgents is RecoveryContract {
    string public legalDocumentsHash;

    constructor(
        address _recipient,
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA,
        string memory _legalDocumentsHash
    ) RecoveryContract(_recipient, _minBlocks, _gatewayContract, _EOA) {
        legalDocumentsHash = _legalDocumentsHash;
    }

    // TODO
}
