%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.alloc import alloc
from starkware.cairo.common.math import assert_lt_felt, assert_le, assert_not_zero
from starkware.starknet.common.messages import send_message_to_l1

// INTERFACES

// Fossil FactsRegistry contract
@contract_interface
namespace IFactsRegistry {
    func get_verified_account_nonce(account_160: felt, block: felt) -> (res: felt) {
    }
}

// Fossil L1HeadersStore contract
@contract_interface
namespace IL1HeadersStore {
    func get_latest_l1_block() -> (number: felt) {
    }
}

// STORAGE

// Deployed address of FactsRegistry contract on StarkNet - immutable value set on contract deployment
@storage_var
func fact_registry_address() -> (res: felt) {
}

// Deployed address of StarkNet contract on L1HeadersStore - immutable value set on contract deployment
@storage_var
func L1_headers_store_address() -> (res: felt) {
}

// Deployed address of L1 gateway contract - immutable value set on contract deployment
@storage_var
func L1_gateway_address() -> (res: felt) {
}

// EVENTS

@event
func log_notify_L1_contract(user_address: felt, block_diff: felt) {
}

@event
func log_nonce(block: felt, address: felt, nonce: felt) {
}

// FUNCTIONS

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    _fact_registry_address: felt, _L1_headers_store_address: felt, _L1_gateway_address: felt
) {
    fact_registry_address.write(_fact_registry_address);
    L1_headers_store_address.write(_L1_headers_store_address);
    L1_gateway_address.write(_L1_gateway_address);
    return ();
}

@view
func get_fact_registry_address{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    ) -> (res: felt) {
    let (res) = fact_registry_address.read();
    return (res=res);
}

@view
func get_L1_headers_store_address{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    ) -> (res: felt) {
    let (res) = L1_headers_store_address.read();
    return (res=res);
}

@view
func get_L1_gateway_address{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (
    res: felt
) {
    let (res) = L1_gateway_address.read();
    return (res=res);
}

// Checks if account balance is unchanged, and if so, notifies L1 recovery contract
// block_end must be within 256 blocks (~1 hour) of the latest block
// block_end - block_start must be greater than the minimum block duration as specified in the L1 recovery contract
@external
func prove_balance_unchanged{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    user_address: felt, block_start: felt, block_end: felt
) -> (bool: felt) {
    alloc_locals;

    let (latest_block) = get_latest_eth_block();
    let threshold = latest_block - 256;

    with_attr error_message("block_end must be within 256 blocks of the latest block") {
        assert_le(threshold, block_end);
    }

    with_attr error_message("block_end must be greater than block_start") {
        assert_le(block_start, block_end);
    }

    let block_diff = block_end - block_start;
    let (nonce_start) = get_nonce(address=user_address, block=block_start);
    let (nonce_end) = get_nonce(address=user_address, block=block_end);
    let (equals) = compare_nonce(a=nonce_start, b=nonce_end);

    if (equals == 1) {
        notify_L1_recovery_contract(user_address, block_diff);
        return (bool=1);
    }

    return (bool=0);
}

// Retrieves latest L1 block.
func get_latest_eth_block{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (
    number: felt
) {
    let (addr) = L1_headers_store_address.read();
    let (number) = IL1HeadersStore.get_latest_l1_block(addr);
    return (number,);
}

// Retrieves nonce of L1 account at a particular block.
func get_nonce{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    address: felt, block: felt
) -> (nonce: felt) {
    alloc_locals;

    assert_lt_felt(address, 2 ** 160);
    let (fact_registry_addr) = fact_registry_address.read();

    let (nonce) = IFactsRegistry.get_verified_account_nonce(fact_registry_addr, address, block);

    log_nonce.emit(block, address, nonce);

    return (nonce,);
}

// Compares two nonces for equality
func compare_nonce(a: felt, b: felt) -> (bool: felt) {
    with_attr error_message("nonce cannot be 0, check if API is working") {
        assert_not_zero(a);
        assert_not_zero(b);
    }
    
    if (a == b) {
        return (1,);
    } else {
        return (0,);
    }
}

// Notify Ethereum recovery contract
func notify_L1_recovery_contract{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    user_address: felt, block_diff: felt
) {
    let (gateway_addr) = L1_gateway_address.read();

    let (message_payload: felt*) = alloc();
    assert message_payload[0] = user_address;
    assert message_payload[1] = block_diff;

    send_message_to_l1(to_address=gateway_addr, payload_size=2, payload=message_payload);

    log_notify_L1_contract.emit(user_address, block_diff);

    return ();
}
