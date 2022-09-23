// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.9;

import "./SecretClaimVerifier_plonk.sol";
import "./IERC20.sol";
import "hardhat/console.sol";

// TODO: 2) Factory contract contains the  verify funtion for zk 4) 3 types of  contract -> one of them has inheritance
interface IStarknetCore {
    // Consumes a message that was sent from an L2 contract. Returns the hash of the message
    function consumeMessageFromL2(
        uint256 fromAddress,
        uint256[] calldata payload
    ) external returns (bytes32);
}

contract RecoveryContract {
    address public recipient;
    address public EOA;
    address public gatewayContract;
    uint256 public minBlocks;
    bool public isActive;
    bool public isTerminated;

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

    function claimAssets(address[] calldata erc20contracts, address to)
        external
    {
        require(msg.sender == recipient, "Only recipient");
        require(isActive == true, "Not active");
        require(!isTerminated, "Already terminated");
        for (uint256 i = 0; i < erc20contracts.length; i++) {
            address erc20contract = erc20contracts[i];
            uint256 balance = IERC20(erc20contract).allowance(
                EOA,
                address(this)
            );
            if (balance > 0) {
                IERC20(erc20contract).transferFrom(EOA, to, balance);
            }
        }
    }

    function terminateRecoveryContract() external {
        require(msg.sender == gatewayContract, "Not gateway");
        isTerminated = true;
    }

    function activateRecovery(uint256 blocks) external {
        require(msg.sender == gatewayContract, "Not gateway");
        require(!isActive, "Already active");
        require(!isTerminated, "Already terminated");
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

contract RecoveryContractTrustedAgents is RecoveryContract {
    string public legalDocumentsHash;
    constructor(
        address _recipient,
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA,
        string memory _legalDocumentsHash
    ) RecoveryContract ( _recipient,  _minBlocks,  _gatewayContract , _EOA  ) {
        legalDocumentsHash = _legalDocumentsHash;
    }
}

contract RecoveryContractZkProof is RecoveryContract, SecretClaimVerifier_plonk {
    uint public hashedPassword;

    constructor(
        address _recipient, // default set to 0x
        uint256 _minBlocks,
        address _gatewayContract,
        address _EOA,
        uint _hashedPassword
    ) RecoveryContract ( _recipient,  _minBlocks,  _gatewayContract , _EOA  ) {
        hashedPassword = _hashedPassword;
    }

    function claimAssets(address[] calldata erc20contracts, address to)
        external
    {
        require(msg.sender == recipient, "Only recipient");
        require(isActive == true, "Not active");
        require(!isTerminated, "Already terminated");
        for (uint256 i = 0; i < erc20contracts.length; i++) {
            address erc20contract = erc20contracts[i];
            uint256 balance = IERC20(erc20contract).allowance(
                EOA,
                address(this)
            );
            if (balance > 0) {
                IERC20(erc20contract).transferFrom(EOA, to, balance);
            }
        }
    }

    /// @notice verifies the proof, and confirms that it contains the new recipient.
    function verifyZkProof(bytes calldata proof, address _recipient) internal {
        uint[] memory pubSignals = new uint[](2);
        pubSignals[0] = uint256(hashedPassword);
        pubSignals[1] = uint256(uint160(_recipient));
        // console.log("account", _recipient);
        // console.log("pubsignal uint hash", pubSignals[0]);
        // console.log("pubsignal address", pubSignals[1]);
        // bool result = this.verifyProof("123",pubSignals);
        // console.log("called");
        // console.log("result",result);
        require(this.verifyProof(proof,pubSignals), "Proof verification failed");
    }

    function terminateRecoveryContract() external {
        require(msg.sender == gatewayContract, "Not gateway");
        isTerminated = true;
    }

    function activateRecovery(uint256 blocks, bytes calldata proof, address _recipient) external override {
        require(msg.sender == gatewayContract, "Not gateway");
        require(_recipient != address("0x"), "Null address");
        require(!isActive, "Already active");
        require(!isTerminated, "Already terminated");
        require(blocks >= minBlocks, "Inactivity too short");
        verifyZkProof(proof);
        recipient = _recipient;
        isActive = true;
        emit ActiveRecovery(address(this), recipient, block.timestamp);
    }

    event ActiveRecovery(
        address contractAddress,
        address recipient,
        uint256 activationTime
    );
}

contract GatewayContract {
    // The StarkNet core contract
    IStarknetCore starknetCore;
    address public owner;
    address public trustedAgents;
    uint256 public l2StorageProverAddress;
    bool public proverAddressIsSet = false;
    mapping(address => address) public eoaToRecoveryContract;

    constructor(IStarknetCore _starknetCore, address _trustedAgents) {
        starknetCore = _starknetCore;
        owner = msg.sender;
        trustedAgents = _trustedAgents;
    }

    function setProverAddress(uint256 _l2StorageProverAddress) external {
        require(msg.sender == owner, "Only owner");
        l2StorageProverAddress = _l2StorageProverAddress;
        proverAddressIsSet = true;
    }

    function updateTrustedAgents(address  _trustedAgents) external {
        require(msg.sender == owner, "Only owner");
        trustedAgents = _trustedAgents;
    }

    function receiveFromStorageProver(uint256 userAddress, uint256 blocks)
        external
    {
        // Construct the withdrawal message's payload.
        uint256[] memory payload = new uint256[](2);
        payload[0] = userAddress;
        payload[1] = blocks;

        assert(proverAddressIsSet == true);

        starknetCore.consumeMessageFromL2(l2StorageProverAddress, payload);

        address conversion = address(uint160(userAddress));
        address _recoveryContractAddress = eoaToRecoveryContract[conversion];
        RecoveryContract(_recoveryContractAddress).activateRecovery(blocks);
    }

    function receiveFromStorageProverZkProof(uint256 userAddress, uint256 block, bytes calldata proof)
        external
    {
        // Construct the withdrawal message's payload.
        uint256[] memory payload = new uint256[](2);
        payload[0] = userAddress;
        payload[1] = blocks;

        assert(proverAddressIsSet == true);

        starknetCore.consumeMessageFromL2(l2StorageProverAddress, payload);

        address conversion = address(uint160(userAddress));
        address _recoveryContractAddress = eoaToRecoveryContract[conversion];
        RecoveryContract(_recoveryContractAddress).activateRecovery(blocks, proof, msg.sender);
    }

    function terminateRecoveryContract() external {
        address recoveryContractAddress = eoaToRecoveryContract[msg.sender];
        RecoveryContract(recoveryContractAddress).terminateRecoveryContract();
        emit TerminateRecoveryContract(
            msg.sender,
            recoveryContractAddress,
            block.timestamp
        );
    }

    function deployRecoveryContract(address recipient, uint256 minBlocks)
        external
    {
        require(
            eoaToRecoveryContract[msg.sender] == address(0x0),
            "Recovery contract exists"
        );
        address _recoveryContractAddress = address(
            new RecoveryContract(
                recipient,
                minBlocks,
                address(this),
                msg.sender
            )
        );
        eoaToRecoveryContract[msg.sender] = _recoveryContractAddress;
        emit NewRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            block.timestamp,
            minBlocks
        );
    }

    event NewRecoveryContract(
        address EOA,
        address recoveryContract,
        uint256 creationDate,
        uint256 minBlocks
    );

    event TerminateRecoveryContract(
        address EOA,
        address recoveryContract,
        uint256 terminationDatee
    );
}
