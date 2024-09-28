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

async function init() {
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider
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
    document.querySelector("#url-key").textContent = key;
  } else {
    document.querySelector("#url-key").textContent = "Not provided";
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
    if (!data.wallets || data.wallets.length === 0) {
      walletsContainer.innerHTML =
        '<tr><td colspan="2">No verified wallets found.</td></tr>';
      return;
    }

    // Iterate over the wallets and append them to the table
    data.wallets.forEach((wallet) => {
      const clone = template.content.cloneNode(true);

      // Populate the template with wallet data (address and metadata)
      clone.querySelector(".address").textContent = wallet.address;
      clone.querySelector(".password").textContent = wallet.password;

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

  // Fetch verification status of the selected account
  checkValidatorStatus(selectedAccount);

  document.querySelector("#prepare").style.display = "none";
  document.querySelector("#connected").style.display = "block";
}

// New function to check if the address is a validator
async function checkValidatorStatus(address) {
  try {
    const response = await fetch(
      `${BASE_API_URL}/verifyWallet?discord_username=${discordUsername}&session_key=${sessionKey}&address=${address}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    // Select the account element
    const accountElement = document.querySelector("#selected-account");

    // Remove existing status message and button if they exist
    const existingStatusMessage = accountElement.querySelector("span");
    const existingVerifyButton = accountElement.querySelector("button");

    if (existingStatusMessage) {
      existingStatusMessage.remove();
    }
    if (existingVerifyButton) {
      existingVerifyButton.remove();
    }

    // Create a new status message
    const statusMessage = document.createElement("span");
    statusMessage.style.color = "red"; // Set the text color to red
    const statusText = data.found ? "" : "   (Not a validator address)";
    statusMessage.textContent = statusText;


    // <button class="btn btn-primary " id="btn-connect">
    //                         Verify Wallet
    //                     </button>

    // Create the Verify Wallet button (hidden by default)
    const verifyButton = document.createElement("button");
    verifyButton.textContent = "Verify Wallet";
    verifyButton.className = "btn btn-primary verify-button";
    verifyButton.style.display = "none"; // Hide button by default
    verifyButton.style.marginLeft = "10px"; // Add space between the message and the button
    accountElement.appendChild(verifyButton);

    if (data.found) {
      // Unhide the button when data.found is true
      verifyButton.style.display = "inline-block"; // or "block" depending on your layout

      // Event listener for the button
      verifyButton.addEventListener("click", async () => {
        // Sign the message
        const message = `I am the owner of this wallet (Session Key: ${sessionKey})`;
        const web3 = new Web3(provider);
        const signature = await web3.eth.personal.sign(
          message,
          selectedAccount
        );

        // Send the signed message to /confirmOwnership
        const confirmResponse = await fetch(
          `${BASE_API_URL}/confirmOwnership`,
          {
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
          }
        );

        if (confirmResponse.ok) {
          await confirmResponse.json();
          setTimeout(() => {
            refreshVerifiedWallets(discordUsername, sessionKey);
          }, 500);
        } else {
          // Handle errors
          console.error(
            "Error confirming ownership:",
            confirmResponse.statusText
          );
        }
      });
    }

    // Append the status message to the account element
    accountElement.appendChild(statusMessage);
  } catch (error) {
    console.error("Error checking validator status:", error.message);
  }
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
    .querySelector("#btn-disconnect")
    .addEventListener("click", onDisconnect);
});
