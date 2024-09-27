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

// Web3modal instance
let web3Modal;

// Chosen wallet provider given by the dialog window
let provider;

// Address of the selected account
let selectedAccount;

let sessionKey;
let discordUsername;

/**
 * Setup the orchestra
 */
async function init() {
  console.log("Initializing example");

  // Tell Web3modal what providers we have available.
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {},
    },
  };

  web3Modal = new Web3Modal({
    cacheProvider: true, // Enable caching of the provider
    providerOptions,
    disableInjectedProvider: false,
  });

  console.log("Web3Modal instance is", web3Modal);

  // Extract URL parameters
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
    provider = await web3Modal.connect();
    setupProviderListeners(); // Set up event listeners for provider
    await refreshAccountData();
    await fetchAccountData();
  }
}

const refreshVerifiedWallets = async (discordUser, key) => {
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
    const walletsContainer = document.querySelector("#wallets"); // Make sure this line is within the function

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
      clone.querySelector(".password").textContent = wallet.password; // Example: if wallets have a label

      // Append the cloned row to the container
      walletsContainer.appendChild(clone);
    });
  } catch (error) {
    console.error("Error refreshing verified wallets:", error.message);
    // Optionally, display an error message in the UI
    const walletsContainer = document.querySelector("#wallets"); // Ensure this line is included here as well
    walletsContainer.innerHTML =
      '<tr><td colspan="2">Failed to load verified wallets.</td></tr>';
  }
};

/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchAccountData() {
  const web3 = new Web3(provider);
  console.log("Web3 instance is", web3);

  const accounts = await web3.eth.getAccounts();
  console.log("Got accounts", accounts);

  selectedAccount = accounts[0];
  document.querySelector("#selected-account").textContent = selectedAccount;

  // Fetch verification status of the selected account
  await checkValidatorStatus(selectedAccount);

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
    // Update the UI based on the verification result
    const statusMessage = document.createElement("span");
    statusMessage.style.color = "red"; // Set the text color to red
    const statusText = data.found ? "" : "   (Not a validator address)";
    statusMessage.textContent = statusText;

    // Create and append the Verify Wallet button (hidden by default)
    const verifyButton = document.createElement("button");
    verifyButton.textContent = "Verify Wallet";
    verifyButton.style.display = "none"; // Hide button by default
    verifyButton.style.marginLeft = "10px"; // Add some space between the message and the button
    document.querySelector("#selected-account").appendChild(verifyButton);

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
          // Handle successful confirmation
          const confirmData = await confirmResponse.json();
          console.log("Ownership confirmed:", confirmData);
          refreshVerifiedWallets(discordUsername, sessionKey);
        } else {
          // Handle errors
          console.error(
            "Error confirming ownership:",
            confirmResponse.statusText
          );
        }
      });
    }

    // Append the message next to the selected account
    const accountElement = document.querySelector("#selected-account");
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
  console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();
    setupProviderListeners(); // Set up event listeners for provider
  } catch (e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  await refreshAccountData();
}

/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {
  console.log("Killing the wallet connection", provider);

  if (provider.close) {
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
window.addEventListener("load", async () => {
  await init();
  document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document
    .querySelector("#btn-disconnect")
    .addEventListener("click", onDisconnect);
});
