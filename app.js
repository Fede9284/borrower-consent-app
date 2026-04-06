let borrowerPdfHash = "";
let borrowerSigner = null;
let borrowerContract = null;
let borrowerWalletAddr = null;

let lenderSigner = null;
let lenderContract = null;
let lenderWalletAddr = null;
let lenderProofContext = null;

const CONTRACT_ADDRESS = "0xf8e81D47203A594245E36C48e151709F0C19fBe8";
let contractAddress = CONTRACT_ADDRESS;

const ABI = [
  "function grantConsent(address _lender, uint256 _expiry, string memory _pdfHash)",
  "function revokeConsent()",
  "function hasValidConsent(address borrower, address lender) view returns (bool)",
  "function getPdfHash(address borrower) view returns (string memory)",
  "function consents(address borrower) view returns (bool granted, address lender, uint256 expiry, string pdfHash)"
];

function setStatus(target, msg, type = "idle", txHash = null) {
  const bar = document.getElementById(target.barId);
  const text = document.getElementById(target.textId);
  const link = target.linkId ? document.getElementById(target.linkId) : null;
  bar.className = `status-bar ${type}`;

  const icons = { idle: "·", ok: "✓", error: "✕", loading: "" };
  const dot = bar.querySelector(".dot");

  if (type === "loading") {
    dot.innerHTML = '<span class="spinner"></span>';
  } else {
    dot.innerHTML = icons[type] || "·";
  }
  text.textContent = msg;

  if (!link) {
    return;
  }

  if (txHash) {
    link.href = `https://sepolia.etherscan.io/tx/${txHash}`;
    link.textContent = `View on Etherscan -> ${txHash.slice(0, 18)}...`;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
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

function setActiveTab(tab) {
  const borrowerPanel = document.getElementById("borrowerPanel");
  const lenderPanel = document.getElementById("lenderPanel");
  const borrowerTab = document.getElementById("tabBorrower");
  const lenderTab = document.getElementById("tabLender");

  if (tab === "borrower") {
    borrowerPanel.classList.remove("hidden");
    lenderPanel.classList.add("hidden");
    borrowerTab.classList.add("active");
    lenderTab.classList.remove("active");
    borrowerTab.setAttribute("aria-selected", "true");
    lenderTab.setAttribute("aria-selected", "false");
  } else {
    borrowerPanel.classList.add("hidden");
    lenderPanel.classList.remove("hidden");
    borrowerTab.classList.remove("active");
    lenderTab.classList.add("active");
    borrowerTab.setAttribute("aria-selected", "false");
    lenderTab.setAttribute("aria-selected", "true");
  }
}

function setExpiryToFiveMinutesFromNow() {
  const expiryInput = document.getElementById("expiryInput");
  const expiryHuman = document.getElementById("expiryHuman");
  const defaultExpiry = Math.floor(Date.now() / 1000) + 300;

  expiryInput.value = String(defaultExpiry);
  expiryHuman.textContent = new Date(defaultExpiry * 1000).toUTCString();
}

function syncFixedContract() {
  document.getElementById("contractInput").value = CONTRACT_ADDRESS;
  document.getElementById("contractInput").readOnly = true;
  document.getElementById("setContractBtn").classList.add("hidden");
  document.getElementById("contractNotice").style.display = "none";
  badge("contractBadge", "FIXED", "ok");
  markStep("step0", true);

  if (borrowerSigner) {
    borrowerContract = new ethers.Contract(contractAddress, ABI, borrowerSigner);
  }
  if (lenderSigner) {
    lenderContract = new ethers.Contract(contractAddress, ABI, lenderSigner);
  }
}

async function connectBorrowerWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Install it from metamask.io");
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    borrowerSigner = await provider.getSigner();
    borrowerWalletAddr = await borrowerSigner.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      alert("Switch MetaMask to the Sepolia testnet.");
      return;
    }

    borrowerContract = new ethers.Contract(contractAddress, ABI, borrowerSigner);

    const short = `${borrowerWalletAddr.slice(0, 6)}...${borrowerWalletAddr.slice(-4)}`;
    document.getElementById("borrowerWalletChip").innerHTML = `<span class="wallet-chip">${short}</span>`;
    document.getElementById("borrowerWalletChip").classList.remove("hidden");
    document.getElementById("borrowerConnectBtn").classList.add("hidden");
    badge("walletBadge", "CONNECTED", "ok");
    markStep("step1", true);
  } catch (e) {
    console.error(e);
    alert("Wallet connection failed.");
  }
}

async function connectLenderWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Install it from metamask.io");
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    lenderSigner = await provider.getSigner();
    lenderWalletAddr = await lenderSigner.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      alert("Switch MetaMask to the Sepolia testnet.");
      return;
    }

    lenderContract = new ethers.Contract(contractAddress, ABI, lenderSigner);

    const short = `${lenderWalletAddr.slice(0, 6)}...${lenderWalletAddr.slice(-4)}`;
    document.getElementById("lenderWalletChip").innerHTML = `<span class="wallet-chip">${short}</span>`;
    document.getElementById("lenderWalletChip").classList.remove("hidden");
    document.getElementById("lenderConnectBtn").classList.add("hidden");
    badge("lenderWalletBadge", "CONNECTED", "ok");
    markStep("lenderStep1", true);
  } catch (e) {
    console.error(e);
    alert("Wallet connection failed.");
  }
}

function onFileChange() {
  borrowerPdfHash = "";
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

  box.textContent = "Hashing...";
  box.className = "hash-box";

  const buf = await input.files[0].arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  borrowerPdfHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  box.textContent = borrowerPdfHash;
  box.className = "hash-box ready";
  badge("hashBadge", "HASHED", "ok");
  markStep("step2", true);
}

async function grantConsent() {
  const borrowerStatus = { barId: "statusBar", textId: "statusText", linkId: "txLink" };

  if (!borrowerSigner) {
    return setStatus(borrowerStatus, "Connect your wallet first.", "error");
  }
  if (!borrowerContract) {
    borrowerContract = new ethers.Contract(contractAddress, ABI, borrowerSigner);
  }
  if (!borrowerPdfHash) {
    return setStatus(borrowerStatus, "Generate the PDF hash first.", "error");
  }

  const lender = document.getElementById("lenderAddress").value.trim();
  const expiry = document.getElementById("expiryInput").value.trim();

  if (!ethers.isAddress(lender)) {
    return setStatus(borrowerStatus, "Invalid lender address.", "error");
  }
  if (!expiry || Number.isNaN(parseInt(expiry, 10))) {
    return setStatus(borrowerStatus, "Enter a valid Unix timestamp.", "error");
  }
  if (parseInt(expiry, 10) <= Math.floor(Date.now() / 1000)) {
    return setStatus(borrowerStatus, "Expiry must be in the future.", "error");
  }

  try {
    setStatus(borrowerStatus, "Awaiting MetaMask confirmation...", "loading");
    const tx = await borrowerContract.grantConsent(lender, expiry, borrowerPdfHash);
    setStatus(borrowerStatus, "Transaction sent - waiting for confirmation...", "loading", tx.hash);
    await tx.wait();
    setStatus(borrowerStatus, "Consent granted successfully.", "ok", tx.hash);
    badge("consentBadge", "GRANTED", "ok");
    markStep("step3", true);
  } catch (e) {
    console.error(e);
    setStatus(borrowerStatus, e.reason || e.message || "Transaction failed.", "error");
  }
}

async function revokeConsent() {
  const borrowerStatus = { barId: "statusBar", textId: "statusText", linkId: "txLink" };

  if (!borrowerSigner || !borrowerContract) {
    return setStatus(borrowerStatus, "Connect wallet first.", "error");
  }

  try {
    setStatus(borrowerStatus, "Awaiting MetaMask confirmation...", "loading");
    const tx = await borrowerContract.revokeConsent();
    setStatus(borrowerStatus, "Revocation sent - waiting for confirmation...", "loading", tx.hash);
    await tx.wait();
    setStatus(borrowerStatus, "Consent revoked.", "ok", tx.hash);
    badge("consentBadge", "REVOKED", "warn");
  } catch (e) {
    console.error(e);
    setStatus(borrowerStatus, e.reason || e.message || "Revocation failed.", "error");
  }
}

async function checkLenderConsent() {
  const lenderStatus = { barId: "lenderStatusBar", textId: "lenderStatusText" };
  const downloadBtn = document.getElementById("lenderDownloadBtn");
  const details = document.getElementById("lenderConsentData");

  if (!lenderSigner || !lenderWalletAddr) {
    return setStatus(lenderStatus, "Connect lender wallet first.", "error");
  }

  const borrower = document.getElementById("lenderBorrowerAddress").value.trim();
  if (!ethers.isAddress(borrower)) {
    return setStatus(lenderStatus, "Invalid borrower address.", "error");
  }

  if (!lenderContract) {
    lenderContract = new ethers.Contract(contractAddress, ABI, lenderSigner);
  }

  try {
    setStatus(lenderStatus, "Checking on-chain consent...", "loading");
    let hasConsent = false;

    // Primary path: use the contract's dedicated validator.
    try {
      hasConsent = await lenderContract.hasValidConsent(borrower, lenderWalletAddr);
    } catch (_) {
      hasConsent = false;
    }

    // Fallback path: read raw consent data and evaluate it client-side.
    if (!hasConsent) {
      const consent = await lenderContract.consents(borrower);
      const now = Math.floor(Date.now() / 1000);
      hasConsent =
        consent.granted &&
        consent.lender.toLowerCase() === lenderWalletAddr.toLowerCase() &&
        Number(consent.expiry) > now;
    }

    if (!hasConsent) {
      lenderProofContext = null;
      details.textContent = "No active consent for this borrower-lender pair. Confirm the lender wallet matches the address used by the borrower during grant.";
      details.className = "hash-box";
      downloadBtn.classList.add("hidden");
      badge("lenderConsentBadge", "DENIED", "warn");
      markStep("lenderStep2", false);
      return setStatus(lenderStatus, "Consent is not active.", "error");
    }

    const pdfHash = await lenderContract.getPdfHash(borrower);
    lenderProofContext = {
      borrower,
      lender: lenderWalletAddr,
      contract: contractAddress,
      pdfHash,
      checkedAt: new Date().toISOString()
    };

    details.textContent = `Borrower: ${borrower}\nLender: ${lenderWalletAddr}\nPDF hash: ${pdfHash}`;
    details.className = "hash-box ready";
    downloadBtn.classList.remove("hidden");
    badge("lenderConsentBadge", "VALID", "ok");
    markStep("lenderStep2", true);
    setStatus(lenderStatus, "Consent is valid. You can download proof.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(lenderStatus, e.reason || e.message || "Consent check failed.", "error");
  }
}

function downloadLenderConsentProof() {
  if (!lenderProofContext) {
    return;
  }

  const content = [
    "Behavioral Consent Proof",
    `Checked at: ${lenderProofContext.checkedAt}`,
    `Contract: ${lenderProofContext.contract}`,
    `Borrower: ${lenderProofContext.borrower}`,
    `Lender: ${lenderProofContext.lender}`,
    `PDF hash: ${lenderProofContext.pdfHash}`
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `consent-proof-${lenderProofContext.borrower.slice(2, 10)}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tabBorrower").addEventListener("click", () => setActiveTab("borrower"));
  document.getElementById("tabLender").addEventListener("click", () => setActiveTab("lender"));

  document.getElementById("borrowerConnectBtn").addEventListener("click", connectBorrowerWallet);
  document.getElementById("pdfFile").addEventListener("change", onFileChange);
  document.getElementById("hashBtn").addEventListener("click", hashFile);
  document.getElementById("grantBtn").addEventListener("click", grantConsent);
  document.getElementById("revokeBtn").addEventListener("click", revokeConsent);

  document.getElementById("lenderConnectBtn").addEventListener("click", connectLenderWallet);
  document.getElementById("checkConsentBtn").addEventListener("click", checkLenderConsent);
  document.getElementById("lenderDownloadBtn").addEventListener("click", downloadLenderConsentProof);

  syncFixedContract();
  setExpiryToFiveMinutesFromNow();
  setActiveTab("borrower");

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
