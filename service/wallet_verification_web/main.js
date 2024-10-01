"use strict";

/**
 * Example JavaScript code that interacts with the page and Web3 wallets
 */

// Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const Fortmatic = window.Fortmatic;
const evmChains = window.evmChains;

const BASE_API_URL_PLACEHOLDER = null;
const BASE_API_URL = BASE_API_URL_PLACEHOLDER || "http://localhost:3003/panel";

let web3Modal;

let provider;

let selectedAccount;

let sessionKey;
let discordUsername;

function validate_txhash(txhash)
{
  return /^0x([A-Fa-f0-9]{64})$/.test(txhash);
}

async function init() {
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
    },
  };

  web3Modal = new Web3Modal({
    cacheProvider: true,
    providerOptions,
    disableInjectedProvider: false,
  });

  const urlParams = new URLSearchParams(window.location.search);
  const key = urlParams.get("key");
  const discordUser = urlParams.get("discorduser");

  if (key) {
    sessionKey = key;
  }

  if (discordUser) {
    discordUsername = discordUser;
    document.querySelector("#url-discord-user").textContent = discordUser;
  } else {
    document.querySelector("#url-discord-user").textContent = "Not provided";
  }

  if (key && discordUser) {
    refreshVerifiedWallets(discordUser, key);
  }

  configureVerifyButton();

  // Check if a cached provider exists
  const cachedProvider = web3Modal.cachedProvider;
  if (cachedProvider) {
    try {
      provider = await web3Modal.connect();
      setupProviderListeners(); // Set up event listeners for provider
      await refreshAccountData();
      await fetchAccountData();
    } catch (e) {}
  }
}

const configureVerifyButton = () => {
  const verifyButton = document.getElementById("btn-verify");

  verifyButton.addEventListener("click", async () => {
    const message = `I am the owner of this wallet (Session Key: ${sessionKey})`;
    const web3 = new Web3(provider);
    const signature = await web3.eth.personal.sign(message, selectedAccount);

    const confirmResponse = await fetch(`${BASE_API_URL}/confirmOwnership`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signedMessage: signature,
        message: message,
        sessionKey: sessionKey,
        discordUsername: discordUsername,
        address: selectedAccount,
      }),
    });

    if (confirmResponse.ok) {
      await confirmResponse.json();
      setTimeout(() => {
        refreshVerifiedWallets(discordUsername, sessionKey);
      }, 500);
    } else {
      console.error("Error confirming ownership:", confirmResponse.statusText);
    }
  });
};

const refreshVerifiedWallets = async (
  discordUser,
  key,
  retries = 3,
  delay = 500
) => {
  try {
    // Fetch verified wallets for the discord user
    const response = await fetch(
      `${BASE_API_URL}/getVerifiedWallets?discord_username=${discordUser}&session_key=${key}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Check if the response is successful
    if (response.status === 403) {
      // Hide the content if a 403 response is received
      const contentElement = document.getElementById("content");
      contentElement.style.display = "none";

      // Unhide the session expiration message
      const sessionExpiredMessage = document.getElementById(
        "session-expired-message"
      );
      sessionExpiredMessage.style.display = "block"; // Unhide the message

      // hide all-content
      const allContent = document.getElementById(
        "all-content"
      );
      allContent.style.display = "none"; // Unhide the message

      
      return; // Exit the function
    }

    // Check if the response is successful
    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    // Parse the JSON response
    const data = await response.json();

    // Select the template and the container for the verified wallets
    const template = document.querySelector("#template-verified-wallet");
    const walletsContainer = document.querySelector("#wallets");

    // Clear any previously loaded wallets
    walletsContainer.innerHTML = "";

    // If no wallets are found, show a message or leave the table empty
    if (
      (!data.validators || data.validators.length === 0) &&
      (!data.wallets || data.wallets.length === 0)
    ) {
      walletsContainer.innerHTML =
        '<tr><td colspan="2">No verified wallets found.</td></tr>';
      return;
    }

    // Iterate over the wallets and append them to the table
    data.validators?.forEach((wallet) => {
      const clone = template.content.cloneNode(true);

      // Populate the template with wallet data (address and metadata)
      clone.querySelector(".address").textContent = wallet.address;
      clone.querySelector(".password").textContent = wallet.password;

      // Append the cloned row to the container
      walletsContainer.appendChild(clone);
    });

    // Iterate over the wallets and append them to the table
    data.wallets?.forEach((wallet) => {
      const clone = template.content.cloneNode(true);

      // Populate the template with wallet data (address and metadata)
      clone.querySelector(".address").textContent =
        wallet.address + " (Not a validator)";
      clone.querySelector(".password").textContent = "N/A";

      // Append the cloned row to the container
      walletsContainer.appendChild(clone);
    });
  } catch (error) {
    console.error("Error refreshing verified wallets:", error.message);

    if (retries > 0) {
      console.log(`Retrying... (${retries} attempts left)`);
      setTimeout(() => {
        refreshVerifiedWallets(discordUser, key, retries - 1, delay);
      }, delay);
    } else {
      // If retries are exhausted, display an error message
      const walletsContainer = document.querySelector("#wallets");
      walletsContainer.innerHTML =
        '<tr><td colspan="2">Failed to load verified wallets after multiple attempts.</td></tr>';
    }
  }
};

/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchAccountData() {
  if (!provider || provider.close) {
    return;
  }

  const web3 = new Web3(provider);

  const accounts = await web3.eth.getAccounts();

  selectedAccount = accounts[0];
  document.querySelector("#selected-account").textContent = selectedAccount;

  document.querySelector("#prepare").style.display = "none";
  document.querySelector("#connected").style.display = "block";
}

/**
 * Fetch account data for UI when user switches accounts in wallet,
 * switches networks in wallet, or connects wallet initially.
 */
async function refreshAccountData() {
  document.querySelector("#connected").style.display = "none";
  document.querySelector("#prepare").style.display = "block";

  document.querySelector("#btn-connect").setAttribute("disabled", "disabled");
  await fetchAccountData();
  document.querySelector("#btn-connect").removeAttribute("disabled");
}

function setupProviderListeners() {
  if (provider) {
    provider.on("accountsChanged", () => {
      refreshAccountData();
    });

    provider.on("chainChanged", () => {
      refreshAccountData();
    });

    provider.on("networkChanged", () => {
      refreshAccountData();
    });
  }
}

/**
 * Connect wallet button pressed.
 */
async function onConnect() {
  try {
    console.log("onConnect");
    provider = await web3Modal.connect();
    setupProviderListeners(); // Set up event listeners for provider
  } catch (e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  refreshAccountData();
}

/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {
  if (provider && provider.close) {
    await provider.close();
    await web3Modal.clearCachedProvider();
    provider = null;
  }

  selectedAccount = null;
  document.querySelector("#prepare").style.display = "block";
  document.querySelector("#connected").style.display = "none";
}

async function onSubmitTransaction() {
    try {
        const txhashInput = document.getElementById("tx-hash-input");
        const txhash = txhashInput.value.trim();

        // Step 1: Validate the transaction hash
        if (!validate_txhash(txhash)) {
            alert("Invalid transaction hash. Please enter a valid one.");
            return; // Stop the function if the txhash is invalid
        }

        // Step 2: Make the POST request to submit the transaction
        const response = await fetch(`${BASE_API_URL}/submitTransaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                session_key: sessionKey, // use the global sessionKey
                discord_username: discordUsername, // use the global discordUsername
                txhash: txhash,
            }),
        });

        // Step 3: Handle the response
        if (response.ok) {
            const result = await response.json();
            alert(result.message); // Show success or existing message
        } else {
            const errorResult = await response.json();
            alert(`Error: ${errorResult.error || 'Failed to submit transaction'}`);
        }
    } catch (e) {
        console.error("Error while submitting transaction", e);
        alert("An unexpected error occurred. Please try again.");
    }
}

/**
 * Main entry point.
 */
window.addEventListener("load", () => {
  setTimeout(async () => {
    await web3Modal?.clearCachedProvider();
    await init();
  }, 1000);
  document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document
    .querySelector("#btn-submit-tx")
    .addEventListener("click", onSubmitTransaction);

  document
    .querySelector("#btn-disconnect")
    .addEventListener("click", onDisconnect);
});
