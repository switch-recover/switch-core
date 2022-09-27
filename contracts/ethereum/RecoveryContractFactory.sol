// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContractZk.sol";
import "hardhat/console.sol";

contract RecoveryContractFactory {
    address public gatewayContract;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyGatewayContract {
        require(msg.sender == gatewayContract, "Only gateway");
        _;
    }

    function updateGatewayContract (address _gatewayContract) external {
        require(msg.sender == owner, "Only owner");
        gatewayContract = _gatewayContract;
    }

    function deployRecoveryContractZk(address eoa, uint256 minBlocks, uint256 _hashedPassword) external onlyGatewayContract returns (address recoveryContract){
        address _recoveryContractAddress = address(
            new RecoveryContractZkProof(
                address(0x0),
                minBlocks,
                gatewayContract,
                eoa,
                _hashedPassword
            )
        );
        return _recoveryContractAddress;
    }
}