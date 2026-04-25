// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Hackathon escrow for Arc Testnet native USDC settlement.
/// @dev Arc uses USDC as its native gas token. The contract is payable, so the
/// demo can show real escrow create/release/refund transactions without an
/// ERC-20 approval hop.
contract ShopRailsEscrow {
    enum Status {
        None,
        Held,
        Released,
        Refunded
    }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        string offerId;
        string policyDecisionId;
        Status status;
    }

    address public immutable reviewer;
    uint256 public nextEscrowId = 1;

    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        string offerId,
        string policyDecisionId
    );
    event EscrowReleased(uint256 indexed escrowId, address indexed seller, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);

    modifier onlyReviewer() {
        require(msg.sender == reviewer, "SHOPRAILS_NOT_REVIEWER");
        _;
    }

    constructor(address reviewer_) {
        require(reviewer_ != address(0), "SHOPRAILS_REVIEWER_REQUIRED");
        reviewer = reviewer_;
    }

    function createEscrow(
        address seller,
        string calldata offerId,
        string calldata policyDecisionId
    ) external payable returns (uint256 escrowId) {
        require(seller != address(0), "SHOPRAILS_SELLER_REQUIRED");
        require(msg.value > 0, "SHOPRAILS_AMOUNT_REQUIRED");

        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            offerId: offerId,
            policyDecisionId: policyDecisionId,
            status: Status.Held
        });

        emit EscrowCreated(escrowId, msg.sender, seller, msg.value, offerId, policyDecisionId);
    }

    function release(uint256 escrowId) external onlyReviewer {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Held, "SHOPRAILS_NOT_HELD");

        escrow.status = Status.Released;
        (bool ok,) = escrow.seller.call{value: escrow.amount}("");
        require(ok, "SHOPRAILS_RELEASE_FAILED");
        emit EscrowReleased(escrowId, escrow.seller, escrow.amount);
    }

    function refund(uint256 escrowId) external onlyReviewer {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Held, "SHOPRAILS_NOT_HELD");

        escrow.status = Status.Refunded;
        (bool ok,) = escrow.buyer.call{value: escrow.amount}("");
        require(ok, "SHOPRAILS_REFUND_FAILED");
        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount);
    }
}
