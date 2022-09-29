// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./token/IERC20.sol";
import "hardhat/console.sol";

contract RecoveryContract {
    address public recipient;
    address public EOA;
    address public gatewayContract;
    uint256 public minBlocks;
    bool public isActive = false;

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

    modifier onlyGateway() {
        require(
            msg.sender == gatewayContract,
            "Only callable by gateway contract"
        );
        _;
    }

    function activateRecovery(uint256 blocks)
        external
        onlyGateway
        returns (
            address,
            address,
            address
        )
    {
        require(!isActive, "Already active");
        require(blocks >= minBlocks, "Inactivity too short");
        isActive = true;
        return (EOA, address(this), recipient);
    }

    function claimAssets(
        address[] calldata erc20contracts,
        uint256[] calldata amounts,
        address caller,
        address to
    ) external {
        require(caller == recipient, "Only recipient");
        require(isActive, "Not active");
        require(erc20contracts.length == amounts.length, "Wrong length");
        for (uint256 i = 0; i < erc20contracts.length; i++) {
            address erc20contract = erc20contracts[i];
            uint256 amount = amounts[i];
            IERC20(erc20contract).transferFrom(EOA, to, amount);
        }
    }
}
