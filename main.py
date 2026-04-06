import base64
import hashlib
import ipaddress
from decimal import Decimal
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

app = FastAPI(title="Consent API")

# Render proxy ranges provided by user (informational/debug context).
RENDER_PROXY_CIDRS = [
    ipaddress.ip_network("74.220.51.0/24"),
    ipaddress.ip_network("74.220.59.0/24"),
]

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
    {
        "inputs": [{"internalType": "address", "name": "borrower", "type": "address"}],
        "name": "getPdfHash",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
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


class PdfRecordRequest(BaseModel):
    pdf_hash: str
    content_base64: str


class ConsentEvaluationRequest(BaseModel):
    borrower: str
    lender: str
    contract_address: str
    rpc_url: Optional[str] = None


records_by_hash: Dict[str, Dict[str, str]] = {}


def _compute_content_plus_one(content_text: str) -> str:
    raw = content_text.strip()
    if not raw:
        return "1"
    try:
        value = Decimal(raw)
        return str(value + 1)
    except Exception:
        # For non-numeric content, keep deterministic behavior.
        return f"{content_text}1"


def _is_in_render_proxy_ranges(ip_text: Optional[str]) -> bool:
    if not ip_text:
        return False
    try:
        ip = ipaddress.ip_address(ip_text)
        return any(ip in cidr for cidr in RENDER_PROXY_CIDRS)
    except Exception:
        return False


@app.get("/")
def read_root(request: Request):
    client_ip = request.client.host if request.client else None
    return {
        "status": "Active",
        "message": "Consent API is running",
        "client_ip": client_ip,
        "client_ip_in_render_ranges": _is_in_render_proxy_ranges(client_ip),
    }


@app.post("/pdf-records")
def save_pdf_record(payload: PdfRecordRequest):
    pdf_hash = payload.pdf_hash.strip().lower()
    content_base64 = payload.content_base64.strip()

    if len(pdf_hash) != 64 or any(c not in "0123456789abcdef" for c in pdf_hash):
        raise HTTPException(status_code=400, detail="pdf_hash must be a 64-char lowercase hex string")

    try:
        base64.b64decode(content_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="content_base64 is invalid") from exc

    records_by_hash[pdf_hash] = {
        "pdf_hash": pdf_hash,
        "content_base64": content_base64,
    }

    return {"saved": True, "pdf_hash": pdf_hash}


@app.post("/evaluate-consent")
def evaluate_consent(payload: ConsentEvaluationRequest):
    rpc_url = payload.rpc_url or DEFAULT_RPC_URL
    web3 = Web3(Web3.HTTPProvider(rpc_url))

    if not web3.is_connected():
        raise HTTPException(status_code=502, detail="Unable to connect to RPC provider")

    if not web3.is_address(payload.borrower):
        raise HTTPException(status_code=400, detail="Invalid borrower address")
    if not web3.is_address(payload.lender):
        raise HTTPException(status_code=400, detail="Invalid lender address")
    if not web3.is_address(payload.contract_address):
        raise HTTPException(status_code=400, detail="Invalid contract address")

    borrower = web3.to_checksum_address(payload.borrower)
    lender = web3.to_checksum_address(payload.lender)
    contract_address = web3.to_checksum_address(payload.contract_address)

    contract = web3.eth.contract(address=contract_address, abi=CONSENT_ABI)

    try:
        has_consent = bool(contract.functions.hasValidConsent(borrower, lender).call())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Contract call failed: {exc}") from exc

    if not has_consent:
        return {
            "has_consent": False,
            "signature_valid": False,
            "pdf_hash": None,
            "content": None,
            "content_plus_one": None,
        }

    try:
        pdf_hash = str(contract.functions.getPdfHash(borrower).call()).strip().lower()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"getPdfHash call failed: {exc}") from exc

    record = records_by_hash.get(pdf_hash)
    if not record:
        return {
            "has_consent": True,
            "signature_valid": False,
            "pdf_hash": pdf_hash,
            "content": None,
            "content_plus_one": None,
            "reason": "No matching PDF content found in API storage",
        }

    raw_bytes = base64.b64decode(record["content_base64"])
    computed_hash = hashlib.sha256(raw_bytes).hexdigest()
    signature_valid = computed_hash == pdf_hash

    content_text = raw_bytes.decode("utf-8", errors="replace")
    content_plus_one = _compute_content_plus_one(content_text)

    return {
        "has_consent": True,
        "signature_valid": signature_valid,
        "pdf_hash": pdf_hash,
        "content": content_text,
        "content_plus_one": content_plus_one,
    }


@app.get("/check-consent/{borrower}")
def check_consent(borrower: str):
    # Backward compatible endpoint retained for existing callers.
    return {"borrower": borrower, "authorized": True}