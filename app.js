let borrowerPdfHash = "";
let borrowerPdfContentBase64 = "";
let borrowerSigner = null;
let borrowerContract = null;
let borrowerWalletAddr = null;

let lenderSigner = null;
let lenderContract = null;
let lenderWalletAddr = null;
let lenderProofContext = null;

const DEFAULT_CONTRACT_ADDRESS = "0xaa717FC983342Ea4bE59075C2E2b383AF6AF6De3";
let contractAddress = DEFAULT_CONTRACT_ADDRESS;
const API_BASE_URL = "https://your-api-service.onrender.com";

const ABI = [
  "function grantConsent(address _lender, uint256 _expiry, string memory _pdfHash)",
  "function revokeConsent()",
  "function hasValidConsent(address borrower, address lender) view returns (bool)",
  "function getPdfHash(address borrower) view returns (string memory)"
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

function getWalletConnectErrorMessage(error) {
  if (!error) {
    return "Wallet connection failed.";
  }

  if (error.code === 4001) {
    return "Wallet connection request was rejected in MetaMask.";
  }

  if (error.code === -32002) {
    return "MetaMask already has a pending wallet request. Open MetaMask and complete it.";
  }

  if (error.code === "ACTION_REJECTED") {
    return "Wallet action was rejected.";
  }

  return error.reason || error.shortMessage || error.message || "Wallet connection failed.";
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

function applyContractAddressToInstances() {
  if (borrowerSigner) {
    borrowerContract = new ethers.Contract(contractAddress, ABI, borrowerSigner);
  }
  if (lenderSigner) {
    lenderContract = new ethers.Contract(contractAddress, ABI, lenderSigner);
  }
}

function setContractAddress() {
  const input = document.getElementById("contractInput");
  const value = input.value.trim();

  if (!ethers.isAddress(value)) {
    badge("contractBadge", "INVALID", "warn");
    markStep("step0", false);
    document.getElementById("contractNotice").style.display = "block";
    document.getElementById("contractNotice").innerHTML = "<strong>Invalid address.</strong><br>Enter a valid 0x address and set it again.";
    return;
  }

  contractAddress = ethers.getAddress(value);
  input.value = contractAddress;
  document.getElementById("contractNotice").style.display = "none";
  badge("contractBadge", "SET", "ok");
  markStep("step0", true);

  lenderProofContext = null;
  document.getElementById("lenderDownloadBtn").classList.add("hidden");
  document.getElementById("lenderConsentBool").textContent = "false";
  document.getElementById("lenderConsentBool").className = "hash-box";
  document.getElementById("lenderConsentData").textContent = "Contract address updated. Re-run consent check.";
  document.getElementById("lenderConsentData").className = "hash-box";

  applyContractAddressToInstances();
}

function initializeContractAddressInput() {
  document.getElementById("contractInput").value = contractAddress;

  if (ethers.isAddress(contractAddress)) {
    contractAddress = ethers.getAddress(contractAddress);
    document.getElementById("contractInput").value = contractAddress;
    badge("contractBadge", "SET", "ok");
    markStep("step0", true);
  } else {
    badge("contractBadge", "NOT SET", "idle");
    markStep("step0", false);
  }

  applyContractAddressToInstances();
}

async function runNetworkContractCheck() {
  const result = document.getElementById("contractCheckResult");

  if (!window.ethereum) {
    result.textContent = "MetaMask not found. Install it from metamask.io";
    result.className = "hash-box";
    return;
  }

  try {
    result.textContent = "Running diagnostics...";
    result.className = "hash-box";

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    const chainId = network.chainId.toString();
    const code = await provider.getCode(contractAddress);
    const hasCode = code !== "0x";

    const networkLine = chainId === "11155111" ? "Network: Sepolia (11155111)" : `Network: chainId ${chainId} (not Sepolia)`;
    const codeLine = hasCode ? "Contract bytecode: found at fixed address" : "Contract bytecode: NOT found (0x)";

    result.textContent = `${networkLine}\n${codeLine}\nAddress: ${contractAddress}`;
    result.className = hasCode && chainId === "11155111" ? "hash-box ready" : "hash-box";
  } catch (e) {
    console.error(e);
    result.textContent = e.reason || e.shortMessage || e.message || "Diagnostic check failed.";
    result.className = "hash-box";
  }
}

async function connectBorrowerWallet() {
  const borrowerStatus = { barId: "statusBar", textId: "statusText", linkId: "txLink" };

  if (!window.ethereum) {
    setStatus(borrowerStatus, "MetaMask not found. Install it from metamask.io", "error");
    return;
  }

  try {
    setStatus(borrowerStatus, "Requesting wallet connection...", "loading");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    borrowerSigner = await provider.getSigner();
    borrowerWalletAddr = await borrowerSigner.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      borrowerSigner = null;
      borrowerWalletAddr = null;
      borrowerContract = null;
      setStatus(borrowerStatus, "Switch MetaMask to the Sepolia testnet.", "error");
      return;
    }

    borrowerContract = new ethers.Contract(contractAddress, ABI, borrowerSigner);

    const short = `${borrowerWalletAddr.slice(0, 6)}...${borrowerWalletAddr.slice(-4)}`;
    document.getElementById("borrowerWalletChip").innerHTML = `<span class="wallet-chip">${short}</span>`;
    document.getElementById("borrowerWalletChip").classList.remove("hidden");
    document.getElementById("borrowerConnectBtn").classList.add("hidden");
    badge("walletBadge", "CONNECTED", "ok");
    markStep("step1", true);
    setStatus(borrowerStatus, "Borrower wallet connected.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(borrowerStatus, getWalletConnectErrorMessage(e), "error");
  }
}

async function connectLenderWallet() {
  const lenderStatus = { barId: "lenderStatusBar", textId: "lenderStatusText" };

  if (!window.ethereum) {
    setStatus(lenderStatus, "MetaMask not found. Install it from metamask.io", "error");
    return;
  }

  try {
    setStatus(lenderStatus, "Requesting wallet connection...", "loading");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    lenderSigner = await provider.getSigner();
    lenderWalletAddr = await lenderSigner.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      lenderSigner = null;
      lenderWalletAddr = null;
      lenderContract = null;
      setStatus(lenderStatus, "Switch MetaMask to the Sepolia testnet.", "error");
      return;
    }

    lenderContract = new ethers.Contract(contractAddress, ABI, lenderSigner);

    const short = `${lenderWalletAddr.slice(0, 6)}...${lenderWalletAddr.slice(-4)}`;
    document.getElementById("lenderWalletChip").innerHTML = `<span class="wallet-chip">${short}</span>`;
    document.getElementById("lenderWalletChip").classList.remove("hidden");
    document.getElementById("lenderConnectBtn").classList.add("hidden");
    badge("lenderWalletBadge", "CONNECTED", "ok");
    markStep("lenderStep1", true);
    setStatus(lenderStatus, "Lender wallet connected.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(lenderStatus, getWalletConnectErrorMessage(e), "error");
  }
}

function onFileChange() {
  borrowerPdfHash = "";
  borrowerPdfContentBase64 = "";
  document.getElementById("hashOutput").textContent = "Click Generate Hash.";
  document.getElementById("hashOutput").className = "hash-box";
  badge("hashBadge", "READY", "idle");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function savePdfRecordToApi() {
  if (!borrowerPdfHash || !borrowerPdfContentBase64) {
    return;
  }

  const response = await fetch(`${API_BASE_URL}/pdf-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdf_hash: borrowerPdfHash,
      content_base64: borrowerPdfContentBase64
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API save failed: ${response.status} ${message}`);
  }
}

async function evaluateConsentViaApi() {
  if (!lenderProofContext) {
    throw new Error("Lender proof context not ready");
  }

  const response = await fetch(`${API_BASE_URL}/evaluate-consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      borrower: lenderProofContext.borrower,
      lender: lenderProofContext.lender,
      contract_address: lenderProofContext.contract
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API evaluate failed: ${response.status} ${message}`);
  }

  return response.json();
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
  borrowerPdfContentBase64 = arrayBufferToBase64(buf);

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

    try {
      await savePdfRecordToApi();
      setStatus(borrowerStatus, "Consent granted and PDF record sent to hosted API.", "ok", tx.hash);
    } catch (apiError) {
      console.error(apiError);
      setStatus(
        borrowerStatus,
        "Consent granted on-chain, but hosted API save failed.",
        "error",
        tx.hash
      );
    }

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
  const boolOutput = document.getElementById("lenderConsentBool");

  if (!lenderSigner || !lenderWalletAddr) {
    boolOutput.textContent = "false";
    boolOutput.className = "hash-box";
    return setStatus(lenderStatus, "Connect lender wallet first.", "error");
  }

  const borrower = document.getElementById("lenderBorrowerAddress").value.trim();
  if (!ethers.isAddress(borrower)) {
    boolOutput.textContent = "false";
    boolOutput.className = "hash-box";
    return setStatus(lenderStatus, "Invalid borrower address.", "error");
  }

  try {
    setStatus(lenderStatus, "Checking on-chain consent...", "loading");

    // Use a fresh provider each check so network/account changes in MetaMask are reflected.
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      boolOutput.textContent = "false";
      boolOutput.className = "hash-box";
      downloadBtn.classList.add("hidden");
      details.className = "hash-box";
      details.textContent = "Switch MetaMask to Sepolia before checking consent.";
      return setStatus(lenderStatus, "Wrong network. Use Sepolia.", "error");
    }

    const code = await provider.getCode(contractAddress);
    if (code === "0x") {
      boolOutput.textContent = "false";
      boolOutput.className = "hash-box";
      downloadBtn.classList.add("hidden");
      details.className = "hash-box";
      details.textContent = "No contract bytecode found at the fixed address on current network.";
      return setStatus(lenderStatus, "Contract not found at fixed address.", "error");
    }

    const readContract = new ethers.Contract(contractAddress, ABI, provider);
    const hasConsent = await readContract.hasValidConsent(borrower, lenderWalletAddr);

    if (!hasConsent) {
      lenderProofContext = null;
      boolOutput.textContent = "false";
      boolOutput.className = "hash-box";
      details.textContent = "No active consent for this borrower-lender pair. Confirm the lender wallet matches the address used by the borrower during grant.";
      details.className = "hash-box";
      downloadBtn.classList.add("hidden");
      badge("lenderConsentBadge", "DENIED", "warn");
      markStep("lenderStep2", false);
      return setStatus(lenderStatus, "Consent is not active.", "error");
    }

    const pdfHash = await readContract.getPdfHash(borrower);
    lenderProofContext = {
      borrower,
      lender: lenderWalletAddr,
      contract: contractAddress,
      pdfHash,
      checkedAt: new Date().toISOString()
    };

    boolOutput.textContent = "true";
    boolOutput.className = "hash-box ready";
    details.textContent = `Borrower: ${borrower}\nLender: ${lenderWalletAddr}\nPDF hash: ${pdfHash}`;
    details.className = "hash-box ready";
    downloadBtn.classList.remove("hidden");
    badge("lenderConsentBadge", "VALID", "ok");
    markStep("lenderStep2", true);
    setStatus(lenderStatus, "Consent is valid. You can download proof.", "ok");
  } catch (e) {
    console.error(e);
    boolOutput.textContent = "false";
    boolOutput.className = "hash-box";
    if (e.code === "BAD_DATA") {
      details.className = "hash-box";
      details.textContent = "Call returned empty data. Run Network + Contract Check to verify chain and deployment.";
      downloadBtn.classList.add("hidden");
      return setStatus(lenderStatus, "Unable to decode call data on current network/address.", "error");
    }
    setStatus(lenderStatus, e.reason || e.message || "Consent check failed.", "error");
  }
}

async function downloadLenderConsentProof() {
  if (!lenderProofContext) {
    return;
  }

  let apiResultText = "API evaluation unavailable.";

  try {
    const apiResult = await evaluateConsentViaApi();
    apiResultText = [
      `API has_consent: ${apiResult.has_consent}`,
      `API signature_valid: ${apiResult.signature_valid}`,
      `API content: ${apiResult.content ?? ""}`,
      `API content_plus_one: ${apiResult.content_plus_one ?? ""}`
    ].join("\n");
  } catch (apiError) {
    console.error(apiError);
    apiResultText = `API evaluation error: ${apiError.message}`;
  }

  const content = [
    "Behavioral Consent Proof",
    `Checked at: ${lenderProofContext.checkedAt}`,
    `Contract: ${lenderProofContext.contract}`,
    `Borrower: ${lenderProofContext.borrower}`,
    `Lender: ${lenderProofContext.lender}`,
    `PDF hash: ${lenderProofContext.pdfHash}`,
    "",
    apiResultText
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
  document.getElementById("contractCheckBtn").addEventListener("click", runNetworkContractCheck);
  document.getElementById("setContractBtn").addEventListener("click", setContractAddress);

  initializeContractAddressInput();
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
