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
    ) external view {
        require(isValid, "INVALID_MESSAGE_TO_CONSUME");
    }
}

// Original contract:
// function consumeMessageFromL2(uint256 fromAddress, uint256[] calldata payload)
//     external
//     override
//     returns (bytes32)
// {
//     bytes32 msgHash = keccak256(
//         abi.encodePacked(
//             fromAddress,
//             uint256(uint160(address(msg.sender))),
//             payload.length,
//             payload
//         )
//     );

//     require(l2ToL1Messages()[msgHash] > 0, "INVALID_MESSAGE_TO_CONSUME");
//     emit ConsumedMessageToL1(fromAddress, msg.sender, payload);
//     l2ToL1Messages()[msgHash] -= 1;
//     return msgHash;
// }
