// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./GatewayContract.sol";
import "./RecoveryContract.sol";
import "./RecoveryContractPassword.sol";
import "./RecoveryContractTrustedAgents.sol";
import "hardhat/console.sol";

enum RecoveryContractType {
    Default,
    Password,
    TrustedAgent
}

contract RecoveryContractFactory {
    address public gatewayContract;
    address public owner;
    bool public gatewayAddressIsSet = false;

    event NewRecoveryContract(
        address indexed EOA,
        address recoveryContract,
        uint256 creationDate,
        uint256 minBlocks,
        RecoveryContractType contractType
    );

    constructor() {
        owner = msg.sender;
    }

    modifier gatewayAddrSet() {
        require(gatewayAddressIsSet == true, "Gateway contract not set");
        _;
    }

    modifier noExistingRecoveryContract() {
        address existingContract = GatewayContract(gatewayContract)
            .getRecoveryContract(msg.sender);
        require(existingContract == address(0), "Existing recovery contract");
        _;
    }

    modifier gatewayEnabled() {
        bool enabled = IGatewayContract(gatewayContract).getEnabled();
        require(enabled == true, "Gateway contract is disabled");
        _;
    }

    function setGatewayContract(address _gatewayContract) external {
        require(msg.sender == owner, "Only owner");
        require(gatewayAddressIsSet == false, "Already set");
        gatewayContract = _gatewayContract;
        gatewayAddressIsSet = true;
    }

    function deployRecoveryContract(address recipient, uint256 minBlocks)
        external
        gatewayAddrSet
        noExistingRecoveryContract
        gatewayEnabled
    {
        address _recoveryContractAddress = address(
            new RecoveryContract(
                recipient,
                minBlocks,
                gatewayContract,
                msg.sender
            )
        );

        GatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            GatewayContract.RecoveryContractType.Default
        );

        emit NewRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            block.timestamp,
            minBlocks,
            RecoveryContractType.Default
        );
    }

    function deployPasswordRecoveryContract(
        uint256 _hashedPassword,
        uint256 minBlocks
    ) external gatewayAddrSet noExistingRecoveryContract gatewayEnabled {
        address _recoveryContractAddress = address(
            new RecoveryContractPassword(
                _hashedPassword,
                minBlocks,
                gatewayContract,
                msg.sender
            )
        );

        GatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            GatewayContract.RecoveryContractType.Password
        );

        emit NewRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            block.timestamp,
            minBlocks,
            RecoveryContractType.Password
        );
    }

    function deployTrustedAgentRecoveryContract(
        string memory hashedlegalDocuments,
        uint256 minBlocks
    ) external gatewayAddrSet noExistingRecoveryContract gatewayEnabled {
        address trustedAgentAddress = address(
            GatewayContract(gatewayContract).getTrustedAgent()
        );

        address _recoveryContractAddress = address(
            new RecoveryContractTrustedAgents(
                trustedAgentAddress,
                minBlocks,
                gatewayContract,
                msg.sender,
                hashedlegalDocuments
            )
        );

        GatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            GatewayContract.RecoveryContractType.TrustedAgent
        );

        emit NewRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            block.timestamp,
            minBlocks,
            RecoveryContractType.TrustedAgent
        );
    }
}
