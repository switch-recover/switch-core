// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContractFactory.sol";
import "./RecoveryContract.sol";
import "./RecoveryContractTrustedAgents.sol";
import "./RecoveryContractZk.sol";
import "hardhat/console.sol";

interface IStarknetCore {
    // Consumes a message that was sent from an L2 contract. Returns the hash of the message
    function consumeMessageFromL2(
        uint256 fromAddress,
        uint256[] calldata payload
    ) external returns (bytes32);
}

interface IRecoveryContract {
    function claimAssets(address[] calldata erc20contracts, address caller, address to) external;
}

interface IRecoveryContractFactory {
    function deployRecoveryContractZk(uint256 minBlocks, uint256 _hashedPassword) external returns (address recoveryContract);
}

contract GatewayContract {
    // The StarkNet core contract
    IStarknetCore starknetCore;
    address public owner;
    address public trustedAgents;
    address public recoveryContractFactory;
    uint256 public l2StorageProverAddress;
    bool public proverAddressIsSet = false;
    mapping(address => address) public eoaToRecoveryContract;

    constructor(IStarknetCore _starknetCore, address _trustedAgents, address _recoveryContractFactory) {
        starknetCore = _starknetCore;
        owner = msg.sender;
        trustedAgents = _trustedAgents;
        recoveryContractFactory = _recoveryContractFactory;
    }

    modifier noExistingRecovery {
        require(
            eoaToRecoveryContract[msg.sender] == address(0x0),
            "Recovery already exists"
        );
        _;
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function setProverAddress(uint256 _l2StorageProverAddress) external onlyOwner {
        l2StorageProverAddress = _l2StorageProverAddress;
        proverAddressIsSet = true;
    }

    function updateTrustedAgents(address  _trustedAgents) external onlyOwner{
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

    function receiveFromStorageProverZkProof(uint256 userAddress, uint256 blocks, bytes calldata proof)
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
        RecoveryContractZkProof(_recoveryContractAddress).activateRecovery(blocks, proof, msg.sender);
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
        external noExistingRecovery
    {
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

    function deployRecoveryContractTrustedAgents(uint256 minBlocks, string memory _legalDocumentsHash)
        external noExistingRecovery
    {
        address _recoveryContractAddress = address(
            new RecoveryContractTrustedAgents(
                trustedAgents,
                minBlocks,
                msg.sender,
                address(this),
                _legalDocumentsHash
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

    function deployRecoveryContractZk(uint256 minBlocks, uint256 _hashedPassword)
        external noExistingRecovery
    {
        address _recoveryContractAddress = IRecoveryContractFactory(recoveryContractFactory).deployRecoveryContractZk(minBlocks, _hashedPassword);
        eoaToRecoveryContract[msg.sender] = _recoveryContractAddress;
        emit NewRecoveryContract(
            msg.sender,
            _recoveryContractAddress,
            block.timestamp,
            minBlocks
        );
    }

    function claimAssets(address[] calldata erc20contracts, address to) external {
        address recoveryContract = eoaToRecoveryContract[msg.sender];
        require(
            recoveryContract != address(0x0),
            "Recovery doesn't exist"
        );
        IRecoveryContract(recoveryContract).claimAssets(erc20contracts, msg.sender, to);
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
