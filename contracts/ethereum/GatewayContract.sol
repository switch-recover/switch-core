// SPDX-License-Identifier: MIT.

pragma solidity ^0.8.0;

import "./RecoveryContract.sol";
import "./RecoveryContractPassword.sol";
import "./RecoveryContractTrustedAgents.sol";
import "./RecoveryContractFactory.sol";
import "hardhat/console.sol";

/**
 * @dev Interface for StarkNet core contract, used to consume messages passed from L2 to L1.
 */
interface IStarknetCore {
    /**
     * @dev Consumes a message that was sent from an L2 contract. Returns the hash of the message.
     */
    function consumeMessageFromL2(
        uint256 fromAddress,
        uint256[] calldata payload
    ) external;
}

/**
 * @dev Gateway contract deployed on L1 Ethereum that handles the activation and
 * termination of recovery contracts.
 *
 * The contract is initialised by passing in: (1) the address of the Starknet core
 * contract, (2) the address of the multisig walletowned by the trusted agents, and
 * (3) the address of the recovery contract factory.
 */
contract GatewayContract {
    IStarknetCore starknetCore;
    address public owner;
    address public trustedAgent;
    address public recoveryContractFactory;
    uint256 public l2StorageProverAddress;
    bool public proverAddressIsSet = false;
    bool public trustedAgentIsSet = false;
    bool public enabled = true;
    mapping(address => address) public eoaToRecoveryContract;
    mapping(address => RecoveryContractType) public eoaToContractType;

    enum RecoveryContractType {
        Default,
        Password,
        TrustedAgent
    }

    event ActivateRecoveryContract(
        address EOA,
        address recoveryContract,
        address recipient,
        uint256 activationTime
    );

    event TerminateRecoveryContract(
        address EOA,
        address recoveryContract,
        uint256 terminationDate
    );

    event DisableContract(uint256 disableDate);

    event EnableContract(uint256 enableDate);

    constructor(IStarknetCore _starknetCore, address _recoveryContractFactory) {
        starknetCore = _starknetCore;
        owner = msg.sender;
        recoveryContractFactory = _recoveryContractFactory;
    }

    modifier noExistingRecovery() {
        require(
            eoaToRecoveryContract[msg.sender] == address(0),
            "Recovery already exists"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier proverIsSet() {
        require(proverAddressIsSet == true, "Prover contract address not set");
        _;
    }

    modifier gatewayEnabled() {
        require(enabled == true, "Gateway contract is disabled");
        _;
    }

    /**
     * @dev The L2 storage prover contract must be deployed by passing in the L1 gateway
     * contract address as part of its constructor args. Once deployed, the L2 storage
     * prover contract address is in turn stored in this contract using setProverAddress.
     */
    function setProverAddress(uint256 _l2StorageProverAddress)
        external
        onlyOwner
    {
        l2StorageProverAddress = _l2StorageProverAddress;
        proverAddressIsSet = true;
    }

    /**
     * @dev Get address of multisig wallet owned by trusted agents.
     */
    function getTrustedAgent() external view returns (address) {
        return trustedAgent;
    }

    /**
     * @dev Update address of multisig wallet owned by trusted agents.
     */
    function updateTrustedAgent(address _trustedAgent) external onlyOwner {
        trustedAgent = _trustedAgent;
        trustedAgentIsSet = true;
    }

    /**
     * @dev Retrieve recovery contract tied to particular EOA.
     */
    function getRecoveryContract(address eoa) external view returns (address) {
        return eoaToRecoveryContract[eoa];
    }

    /**
     * @dev Retrieve recovery contract type tied to particular EOA.
     */
    function getRecoveryContractType(address eoa)
        external
        view
        returns (RecoveryContractType)
    {
        return eoaToContractType[eoa];
    }

    /**
     * @dev Update mapping to change the recovery contract stored for a particular EOA.
     */
    function updateRecoveryContract(
        address eoa,
        address recoveryContractAddress,
        RecoveryContractType contractType
    ) external {
        require(
            msg.sender == recoveryContractFactory,
            "Only callable by contract factory"
        );
        eoaToRecoveryContract[eoa] = recoveryContractAddress;
        eoaToContractType[eoa] = contractType;
    }

    /**
     * @dev Consumes message from L2 storage prover contract, where {userAddress} is the
     * lost EOA and {blocks} is the number of blocks for which the account has been inactive.
     */
    function checkRecoveryValid(uint256 userAddress, uint256 blocks)
        internal
        returns (address)
    {
        /**
         * @dev Construct the withdrawal message's payload.
         */
        uint256[] memory payload = new uint256[](2);
        payload[0] = userAddress;
        payload[1] = blocks;

        starknetCore.consumeMessageFromL2(l2StorageProverAddress, payload);

        address conversion = address(uint160(userAddress));
        address _recoveryContractAddress = eoaToRecoveryContract[conversion];
        return _recoveryContractAddress;
    }

    /**
     * @dev Consumes message from L2 storage prover contract and if valid, activates
     * default recovery contract.
     */
    function activateRecoveryContract(uint256 userAddress, uint256 blocks)
        external
        proverIsSet
        gatewayEnabled
    {
        address _recoveryContractAddress = checkRecoveryValid(
            userAddress,
            blocks
        );
        (
            address _eoa,
            address _recoveryContract,
            address _recipient
        ) = RecoveryContract(_recoveryContractAddress).activateRecovery(blocks);
        emit ActivateRecoveryContract(
            _eoa,
            _recoveryContract,
            _recipient,
            block.timestamp
        );
    }

    /**
     * @dev Consumes message from L2 storage prover contract and if valid, activates
     * recovery contract with password.
     */
    function activateRecoveryContractPassword(
        uint256 userAddress,
        uint256 blocks,
        bytes calldata proof,
        address recipient
    ) external proverIsSet gatewayEnabled {
        address _recoveryContractAddress = checkRecoveryValid(
            userAddress,
            blocks
        );
        (
            address _eoa,
            address _recoveryContract,
            address _recipient
        ) = RecoveryContractPassword(_recoveryContractAddress).activateRecovery(
                blocks,
                proof,
                recipient
            );
        emit ActivateRecoveryContract(
            _eoa,
            _recoveryContract,
            _recipient,
            block.timestamp
        );
    }

    /**
     * @dev Terminate recovery contract associated with message sender's EOA.
     */
    function terminateRecoveryContract() external {
        address recoveryContractAddress = eoaToRecoveryContract[msg.sender];
        require(
            recoveryContractAddress != address(0x0),
            "No existing recovery"
        );
        delete eoaToRecoveryContract[msg.sender];
        delete eoaToContractType[msg.sender];
        emit TerminateRecoveryContract(
            msg.sender,
            recoveryContractAddress,
            block.timestamp
        );
    }

    /**
     * @dev Disable all recovery contracts (kill switch).
     */
    function disable() external onlyOwner {
        enabled = false;
        emit DisableContract(block.timestamp);
    }

    /**
     * @dev Re-enable all recovery contracts (disable kill switch).
     */
    function enable() external onlyOwner {
        enabled = true;
        emit EnableContract(block.timestamp);
    }

    function getEnabled() external view returns (bool) {
        return enabled;
    }
}
