let pdfHash = "";
let signer = null;
let contract = null;
let walletAddr = null;

const DEPLOYED_CONTRACT_ADDRESS = "0xf8e81D47203A594245E36C48e151709F0C19fBe8";
let contractAddress = DEPLOYED_CONTRACT_ADDRESS;

const ABI = [
  "function grantConsent(address _lender, uint256 _expiry, string memory _pdfHash)",
  "function revokeConsent()",
  "function hasValidConsent(address _borrower, address _lender) view returns (bool)"
];

function setStatus(msg, type = "idle", txHash = null) {
  const bar = document.getElementById("statusBar");
  const text = document.getElementById("statusText");
  const link = document.getElementById("txLink");
  bar.className = `status-bar ${type}`;

  const icons = { idle: "·", ok: "✓", error: "✕", loading: "" };
  const dot = bar.querySelector(".dot");

  if (type === "loading") {
    dot.innerHTML = '<span class="spinner"></span>';
  } else {
    dot.innerHTML = icons[type] || "·";
  }
  text.textContent = msg;

  if (txHash) {
    link.href = `https://sepolia.etherscan.io/tx/${txHash}`;
    link.textContent = `View on Etherscan → ${txHash.slice(0, 18)}…`;
    link.style.display = "block";
  } else {
    link.style.display = "none";
  }
}

function badge(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `step-badge badge-${type}`;
}

function markStep(id, done) {
  document.getElementById(id).className = `step ${done ? "done" : "active"}`;
}

function setExpiryToOneMinuteFromNow() {
  const expiryInput = document.getElementById("expiryInput");
  const expiryHuman = document.getElementById("expiryHuman");
  const defaultExpiry = Math.floor(Date.now() / 1000) + 60;

  expiryInput.value = String(defaultExpiry);
  expiryHuman.textContent = new Date(defaultExpiry * 1000).toUTCString();
}

function setContract(valFromCode = null) {
  const val = (valFromCode ?? document.getElementById("contractInput").value).trim();
  if (!ethers.isAddress(val)) {
    alert("Invalid Ethereum address.");
    return;
  }

  contractAddress = val;
  document.getElementById("contractInput").value = contractAddress;
  document.getElementById("contractNotice").style.display = "none";
  badge("contractBadge", "SET", "ok");
  markStep("step0", true);

  if (signer) {
    contract = new ethers.Contract(contractAddress, ABI, signer);
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Install it from metamask.io");
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    walletAddr = await signer.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      alert("⚠ Switch MetaMask to the Sepolia testnet.");
      return;
    }

    if (contractAddress) {
      contract = new ethers.Contract(contractAddress, ABI, signer);
    }

    const short = `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`;
    document.getElementById("walletChip").innerHTML = `<span class="wallet-chip">${short}</span>`;
    document.getElementById("walletChip").classList.remove("hidden");
    document.getElementById("connectBtn").classList.add("hidden");
    badge("walletBadge", "CONNECTED", "ok");
    markStep("step1", true);
  } catch (e) {
    console.error(e);
    alert("Wallet connection failed.");
  }
}

function onFileChange() {
  pdfHash = "";
  document.getElementById("hashOutput").textContent = "Click Generate Hash.";
  document.getElementById("hashOutput").className = "hash-box";
  badge("hashBadge", "READY", "idle");
}

async function hashFile() {
  const input = document.getElementById("pdfFile");
  const box = document.getElementById("hashOutput");

  if (!input.files.length) {
    alert("Select a PDF first.");
    return;
  }

  box.textContent = "Hashing…";
  box.className = "hash-box";

  const buf = await input.files[0].arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  pdfHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  box.textContent = pdfHash;
  box.className = "hash-box ready";
  badge("hashBadge", "HASHED", "ok");
  markStep("step2", true);
}

async function grantConsent() {
  if (!signer) {
    return setStatus("Connect your wallet first.", "error");
  }
  if (!contractAddress) {
    return setStatus("Set the contract address first.", "error");
  }
  if (!contract) {
    contract = new ethers.Contract(contractAddress, ABI, signer);
  }
  if (!pdfHash) {
    return setStatus("Generate the PDF hash first.", "error");
  }

  const lender = document.getElementById("lenderAddress").value.trim();
  const expiry = document.getElementById("expiryInput").value.trim();

  if (!ethers.isAddress(lender)) {
    return setStatus("Invalid lender address.", "error");
  }
  if (!expiry || Number.isNaN(parseInt(expiry, 10))) {
    return setStatus("Enter a valid Unix timestamp.", "error");
  }
  if (parseInt(expiry, 10) <= Math.floor(Date.now() / 1000)) {
    return setStatus("Expiry must be in the future.", "error");
  }

  try {
    setStatus("Awaiting MetaMask confirmation…", "loading");
    const tx = await contract.grantConsent(lender, expiry, pdfHash);
    setStatus("Transaction sent - waiting for confirmation…", "loading", tx.hash);
    await tx.wait();
    setStatus("Consent granted successfully.", "ok", tx.hash);
    badge("consentBadge", "GRANTED", "ok");
    markStep("step3", true);
  } catch (e) {
    console.error(e);
    setStatus(e.reason || e.message || "Transaction failed.", "error");
  }
}

async function revokeConsent() {
  if (!signer || !contract) {
    return setStatus("Connect wallet and set contract first.", "error");
  }

  try {
    setStatus("Awaiting MetaMask confirmation…", "loading");
    const tx = await contract.revokeConsent();
    setStatus("Revocation sent - waiting for confirmation…", "loading", tx.hash);
    await tx.wait();
    setStatus("Consent revoked.", "ok", tx.hash);
    badge("consentBadge", "REVOKED", "warn");
  } catch (e) {
    console.error(e);
    setStatus(e.reason || e.message || "Revocation failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("setContractBtn").addEventListener("click", () => setContract());
  document.getElementById("connectBtn").addEventListener("click", connectWallet);
  document.getElementById("pdfFile").addEventListener("change", onFileChange);
  document.getElementById("hashBtn").addEventListener("click", hashFile);
  document.getElementById("grantBtn").addEventListener("click", grantConsent);
  document.getElementById("revokeBtn").addEventListener("click", revokeConsent);

  document.getElementById("contractInput").value = DEPLOYED_CONTRACT_ADDRESS;
  setContract(DEPLOYED_CONTRACT_ADDRESS);
  setExpiryToOneMinuteFromNow();

  document.getElementById("expiryInput").addEventListener("input", (e) => {
    const ts = parseInt(e.target.value, 10);
    const el = document.getElementById("expiryHuman");
    if (!Number.isNaN(ts) && ts > 0) {
      el.textContent = new Date(ts * 1000).toUTCString();
    } else {
      el.textContent = "";
    }
  });
});
