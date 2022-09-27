// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./IERC20.sol";
import "hardhat/console.sol";

contract RecoveryContract {
    address public recipient;
    address public EOA;
    address public gatewayContract;
    uint256 public minBlocks;
    bool public isActive;

    constructor(
        address _recipient,
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA
    ) {
        recipient = _recipient;
        EOA = _EOA;
        minBlocks = _minBlocks;
        gatewayContract = _gatewayContract;
    }

    modifier onlyGateway {
        require(msg.sender == gatewayContract, "Not gateway");
        _;
    }

    function claimAssets(address[] calldata erc20contracts, uint256[] calldata amounts, address caller, address to)
        external onlyGateway
    {
        require(caller == recipient, "Only recipient");
        require(isActive, "Not active");
        require(erc20contracts.length == amounts.length, "Wrong length");
        for (uint256 i = 0; i < erc20contracts.length; i++) {
            address erc20contract = erc20contracts[i];
            uint256 amount = amounts[i];
            IERC20(erc20contract).transferFrom(EOA, to, amount);
        }
    }

    function activateRecovery(uint256 blocks) external onlyGateway {
        require(!isActive, "Already active");
        require(blocks >= minBlocks, "Inactivity too short");
        isActive = true;
        emit ActiveRecovery(address(this), recipient, block.timestamp);
    }

    event ActiveRecovery(
        address contractAddress,
        address recipient,
        uint256 activationTime
    );
}