// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract BehavioralConsentManager {

    struct Consent {
        bool granted;
        address lender;
        uint256 expiry;
        string pdfHash;
    }

    mapping(address => Consent) public consents;

    function grantConsent(address _lender, uint256 _expiry, string memory _pdfHash) public {
        require(_expiry > block.timestamp, "Expiry must be in future");

        consents[msg.sender] = Consent({
            granted: true,
            lender: _lender,
            expiry: _expiry,
            pdfHash: _pdfHash
        });
    }

    function revokeConsent() public {
        delete consents[msg.sender];
    }

    function hasValidConsent(address borrower, address lender) public view returns (bool) {
        Consent memory c = consents[borrower];
        return c.granted && c.lender == lender && c.expiry > block.timestamp;
    }

    function getPdfHash(address borrower) public view returns (string memory) {
        return consents[borrower].pdfHash;
    }
}