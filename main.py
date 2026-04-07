from typing import Optional

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from web3 import Web3

app = FastAPI(title="Consent API")

DEFAULT_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"

CONSENT_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "borrower", "type": "address"},
            {"internalType": "address", "name": "lender", "type": "address"},
        ],
        "name": "hasValidConsent",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_web3(rpc_url: Optional[str]) -> Web3:
    provider_url = rpc_url or DEFAULT_RPC_URL
    web3 = Web3(Web3.HTTPProvider(provider_url))
    if not web3.is_connected():
        raise HTTPException(status_code=502, detail="Unable to connect to RPC provider")
    return web3


def _to_checksum_address(web3: Web3, value: str, field_name: str) -> str:
    if not web3.is_address(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} address")
    return web3.to_checksum_address(value)


def _read_consent_value(web3: Web3, contract_address: str, borrower: str, lender: str) -> int:
    contract = web3.eth.contract(address=contract_address, abi=CONSENT_ABI)
    try:
        has_consent = bool(contract.functions.hasValidConsent(borrower, lender).call())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Contract call failed: {exc}") from exc
    return 1 if has_consent else 0


@app.get("/")
def read_root():
    return {
        "status": "Active",
        "message": "Consent API is running",
    }


@app.post("/evaluate-consent")
def evaluate_consent(
    borrower: str = Body(..., embed=True),
    lender: str = Body(..., embed=True),
    contract_address: str = Body(..., embed=True),
    rpc_url: Optional[str] = Body(None, embed=True),
):
    web3 = _build_web3(rpc_url)
    borrower_address = _to_checksum_address(web3, borrower, "borrower")
    lender_address = _to_checksum_address(web3, lender, "lender")
    contract_checksum = _to_checksum_address(web3, contract_address, "contract")

    return {
        "result": _read_consent_value(web3, contract_checksum, borrower_address, lender_address)
    }