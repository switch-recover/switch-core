// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

contract StarknetCoreFake {
    bool public isValid = true;

    function toggleIsValid() external {
        isValid = !isValid;
    }

    function consumeMessageFromL2(
        uint256 fromAddress,
        uint256[] calldata payload
    ) external returns (bytes32) {
        require(isValid, "INVALID_MESSAGE_TO_CONSUME");
    }
}