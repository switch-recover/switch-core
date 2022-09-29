// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./GatewayContract.sol";
import "./RecoveryContract.sol";
import "./RecoveryContractPassword.sol";
import "./RecoveryContractTrustedAgents.sol";
import "hardhat/console.sol";

/**
 * @dev Interface for gateway contract, used to update mapping of EOAs to recovery contracts.
 */
interface IGatewayContract {
    function getRecoveryContract(address eoa) external returns (address);

    function updateRecoveryContract(
        address eoa,
        address recoveryContractAddress
    ) external;

    function getTrustedAgent() external returns (address);
}

contract RecoveryContractFactory {
    address public gatewayContract;
    address public owner;
    bool public gatewayAddressIsSet = false;

    enum RecoveryContractType {
        Default,
        Password,
        TrustedAgent
    }

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
        address existingContract = IGatewayContract(gatewayContract)
            .getRecoveryContract(msg.sender);
        require(existingContract == address(0), "Existing recovery contract");
        _;
    }

    function updateGatewayContract(address _gatewayContract) external {
        require(msg.sender == owner, "Only owner");
        gatewayContract = _gatewayContract;
        gatewayAddressIsSet = true;
    }

    function deployRecoveryContract(address recipient, uint256 minBlocks)
        external
        gatewayAddrSet
        noExistingRecoveryContract
    {
        address _recoveryContractAddress = address(
            new RecoveryContract(
                recipient,
                minBlocks,
                gatewayContract,
                msg.sender
            )
        );

        IGatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress
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
    ) external gatewayAddrSet noExistingRecoveryContract {
        address _recoveryContractAddress = address(
            new RecoveryContractPassword(
                _hashedPassword,
                minBlocks,
                gatewayContract,
                msg.sender
            )
        );

        IGatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress
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
    ) external gatewayAddrSet noExistingRecoveryContract {
        address trustedAgentAddress = address(
            IGatewayContract(gatewayContract).getTrustedAgent()
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

        IGatewayContract(gatewayContract).updateRecoveryContract(
            msg.sender,
            _recoveryContractAddress
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
