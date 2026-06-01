module walrus_exchange::marketplace;

use std::string::{Self, String};
use std::vector;
use sui::balance;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const E_INACTIVE: u64 = 0;
const E_INSUFFICIENT_PAYMENT: u64 = 1;
const E_ZERO_PRICE: u64 = 2;
const E_NO_ACCESS: u64 = 3;

public struct OperatorCap has key, store {
    id: UID,
}

public struct Product has key, store {
    id: UID,
    seller: address,
    price: u64,
    title: String,
    description: String,
    manifest_blob_id: String,
    encrypted_blob_id: String,
    file_name: String,
    file_type: String,
    file_size: u64,
    original_sha256: String,
    encrypted_sha256: String,
    seal_id: vector<u8>,
    created_at_ms: u64,
    active: bool,
    purchase_count: u64,
}

public struct Receipt has key, store {
    id: UID,
    product_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    settlement: String,
    channel: u8,
    paid_at_ms: u64,
}

public struct ProductCreated has copy, drop {
    product_id: ID,
    seller: address,
    price: u64,
    created_at_ms: u64,
}

public struct PurchaseRecorded has copy, drop {
    product_id: ID,
    receipt_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    channel: u8,
    paid_at_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        OperatorCap {
            id: object::new(ctx),
        },
        tx_context::sender(ctx),
    );
}

public fun create_product(
    _cap: &OperatorCap,
    seller: address,
    price: u64,
    title: String,
    description: String,
    manifest_blob_id: String,
    encrypted_blob_id: String,
    file_name: String,
    file_type: String,
    file_size: u64,
    original_sha256: String,
    encrypted_sha256: String,
    seal_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(price > 0, E_ZERO_PRICE);

    let product = Product {
        id: object::new(ctx),
        seller,
        price,
        title,
        description,
        manifest_blob_id,
        encrypted_blob_id,
        file_name,
        file_type,
        file_size,
        original_sha256,
        encrypted_sha256,
        seal_id,
        created_at_ms: clock::timestamp_ms(clock),
        active: true,
        purchase_count: 0,
    };

    let product_id = object::id(&product);
    event::emit(ProductCreated {
        product_id,
        seller,
        price,
        created_at_ms: product.created_at_ms,
    });

    transfer::share_object(product);
}

#[allow(lint(self_transfer))]
public fun purchase(
    product: &mut Product,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(product.active, E_INACTIVE);

    let buyer = tx_context::sender(ctx);
    let price = product.price;
    let amount = coin::value(&payment);
    assert!(amount >= price, E_INSUFFICIENT_PAYMENT);

    let mut payment_balance = coin::into_balance(payment);
    let seller_balance = balance::split(&mut payment_balance, price);
    transfer::public_transfer(coin::from_balance(seller_balance, ctx), product.seller);

    if (balance::value(&payment_balance) > 0) {
        transfer::public_transfer(coin::from_balance(payment_balance, ctx), buyer);
    } else {
        balance::destroy_zero(payment_balance);
    };

    record_purchase(product, buyer, price, string::utf8(b"contract"), 0, clock, ctx);
}

public fun record_agent_purchase(
    _cap: &OperatorCap,
    product: &mut Product,
    buyer: address,
    amount: u64,
    settlement: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(product.active, E_INACTIVE);
    assert!(amount >= product.price, E_INSUFFICIENT_PAYMENT);

    record_purchase(product, buyer, amount, settlement, 1, clock, ctx);
}

entry fun seal_approve_access(
    id: vector<u8>,
    product: &Product,
    receipt: &Receipt,
    ctx: &TxContext,
) {
    assert!(product.active, E_INACTIVE);
    assert!(receipt.product_id == object::id(product), E_NO_ACCESS);
    assert!(receipt.buyer == tx_context::sender(ctx), E_NO_ACCESS);
    assert!(receipt.amount >= product.price, E_INSUFFICIENT_PAYMENT);
    assert!(bytes_equal(&id, &product.seal_id), E_NO_ACCESS);
}

fun record_purchase(
    product: &mut Product,
    buyer: address,
    amount: u64,
    settlement: String,
    channel: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    product.purchase_count = product.purchase_count + 1;

    let product_id = object::id(product);
    let paid_at_ms = clock::timestamp_ms(clock);
    let receipt = Receipt {
        id: object::new(ctx),
        product_id,
        buyer,
        seller: product.seller,
        amount,
        settlement,
        channel,
        paid_at_ms,
    };
    let receipt_id = object::id(&receipt);

    event::emit(PurchaseRecorded {
        product_id,
        receipt_id,
        buyer,
        seller: product.seller,
        amount,
        channel,
        paid_at_ms,
    });

    transfer::transfer(receipt, buyer);
}

fun bytes_equal(left: &vector<u8>, right: &vector<u8>): bool {
    let left_len = vector::length(left);
    if (left_len != vector::length(right)) {
        return false
    };

    let mut index = 0;
    while (index < left_len) {
        if (*vector::borrow(left, index) != *vector::borrow(right, index)) {
            return false
        };
        index = index + 1;
    };

    true
}
