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

function validate_txhash(txhash) {
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
    refreshVerifiedWallets();
    refreshContributions();
  }

  configureVerifyButton();

  // Check if a cached provider exists
  // const cachedProvider = web3Modal.cachedProvider;
  // if (cachedProvider) {
  //   try {
  //     provider = await web3Modal.connect();
  //     setupProviderListeners(); // Set up event listeners for provider
  //     await refreshAccountData();
  //     await fetchAccountData();
  //   } catch (e) {}
  // }
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
        refreshVerifiedWallets();
      }, 500);
    } else {
      console.error("Error confirming ownership:", confirmResponse.statusText);
    }
  });
};

const refreshVerifiedWallets = async (retries = 3, delay = 500) => {
  try {
    // Fetch verified wallets for the discord user
    const response = await fetch(
      `${BASE_API_URL}/getVerifiedWallets?discord_username=${discordUsername}&session_key=${sessionKey}`,
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
      const allContent = document.getElementById("all-content");
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

      // Populate the template with wallet data (address and password)
      const addressElement = clone.querySelector(".address");
      const passwordElement = clone.querySelector(".password");

      // Set the text content
      addressElement.textContent = wallet.address + "  ";

      // Set the password content and append the clipboard icon
      const passwordContainer = document.createElement("span");
      passwordContainer.textContent = wallet.password;

      // Add copy icon to the password field
      const copyIcon = document.createElement("i");
      copyIcon.classList.add("bi", "bi-clipboard"); // Bootstrap clipboard icon
      passwordContainer.appendChild(copyIcon);

      passwordElement.appendChild(passwordContainer);

      // Add click event to copy the full password to clipboard
      passwordElement.addEventListener("click", () => {
        navigator.clipboard
          .writeText(wallet.password)
          .then(() => {
            // Use the reusable toast function to notify copy success
            showToast("Password copied to clipboard!");
          })
          .catch((err) => {
            console.error("Failed to copy the password: ", err);
          });
      });

      // Create a new span element for the badge
      const badgeSpan = document.createElement("span");
      badgeSpan.classList.add("badge", "text-bg-success", "ms-2"); // Add classes
      badgeSpan.textContent = "Validator"; // Set the text content

      // Append the badge after the address text
      addressElement.appendChild(badgeSpan);

      // Append the cloned row to the container
      walletsContainer.appendChild(clone);
    });

    // Iterate over the wallets and append them to the table
    data.wallets?.forEach((wallet) => {
      const clone = template.content.cloneNode(true);

      // Populate the template with wallet data (address and metadata)
      clone.querySelector(".address").textContent = wallet.address;
      clone.querySelector(".password").textContent = "N/A";

      // Append the cloned row to the container
      walletsContainer.appendChild(clone);
    });
  } catch (error) {
    console.error("Error refreshing verified wallets:", error.message);

    if (retries > 0) {
      console.log(`Retrying... (${retries} attempts left)`);
      setTimeout(() => {
        refreshVerifiedWallets(retries - 1, delay);
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

  if (!selectedAccount || selectedAccount == "") {
    await onDisconnect();
    document.querySelector("#prepare").style.display = "block";
    document.querySelector("#connected").style.display = "none";
    return;
  }

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

function showToast(message) {
  const toastElement = document.getElementById("toast");

  // Set the message inside the toast body (optional if you want dynamic messages)
  const toastBody = toastElement.querySelector(".toast-body");
  if (toastBody) {
    toastBody.textContent = message;
  }

  // Create a new Bootstrap toast instance and show it
  const toast = new bootstrap.Toast(toastElement);
  toast.show();
}

async function refreshContributions() {
  const response = await fetch(
    `${BASE_API_URL}/getContributions?discord_username=${discordUsername}&session_key=${sessionKey}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  if (response.ok) {
    const data = await response.json();

    if (data.contributions) {
      const template = document.querySelector("#template-contributions");
      const contributionsContainer = document.querySelector("#contributions");

      // Clear any previously loaded wallets
      contributionsContainer.innerHTML = "";

      if (data.contributions.length === 0) {
        contributionsContainer.innerHTML =
          '<tr><td colspan="7" style="text-align: center">No contributions found.</td></tr>';
      } else {
        data.contributions?.forEach((contribution) => {
          const clone = template.content.cloneNode(true);

          const txhashElement = clone.querySelector(".contribution-txhash");

          // Truncate the displayed txhash
          const truncatedTxhash = `${contribution.txhash.slice(
            0,
            6
          )}...${contribution.txhash.slice(-10)}`;
          txhashElement.textContent = truncatedTxhash;

          // Add a copy icon (optional if not using the icon in the HTML template)
          const copyIcon = document.createElement("i");
          copyIcon.classList.add("bi", "bi-clipboard"); // Bootstrap clipboard icon
          txhashElement.appendChild(copyIcon);

          // Add click event to copy the full txhash to clipboard
          txhashElement.addEventListener("click", () => {
            navigator.clipboard
              .writeText(contribution.txhash)
              .then(() => {
                // Use the reusable toast function
                showToast("Transaction hash copied to clipboard!");
              })
              .catch((err) => {
                console.error("Failed to copy the txhash: ", err);
              });
          });

          clone.querySelector(".contribution-date").textContent = new Date(
            contribution.txdate * 1000
          ).toLocaleString();
          clone.querySelector(".contribution-address").textContent =
            contribution.address;
          clone.querySelector(".contribution-chain").textContent =
            contribution.chain;
          clone.querySelector(".contribution-amount").textContent =
            parseFloat(contribution.amount).toFixed(2) + " $";
          clone.querySelector(".contribution-additionalDays").textContent =
            contribution.additional_days;
          clone.querySelector(".contribution-expiry").textContent = new Date(
            contribution.access_expiry * 1000
          ).toLocaleString();

          // Append the cloned row to the container
          contributionsContainer.appendChild(clone);
        });
      }
    }

    if (data.pendingContributions) {
      const template = document.querySelector("#template-pendingContributions");
      const contributionsContainer = document.querySelector(
        "#pendingContributions"
      );

      // Clear any previously loaded wallets
      contributionsContainer.innerHTML = "";

      if (data.pendingContributions.length === 0) {
        contributionsContainer.innerHTML =
          '<tr><td colspan="3" style="text-align: center">No pending contributions found.</td></tr>';
      } else {
        let refreshRequired = false;
        data.pendingContributions?.forEach((contribution) => {
          const clone = template.content.cloneNode(true);
          const txhashElement = clone.querySelector(".contribution-txhash");

          // Truncate the displayed txhash
          const truncatedTxhash = `${contribution.txhash.slice(
            0,
            6
          )}...${contribution.txhash.slice(-10)}`;
          txhashElement.textContent = truncatedTxhash;

          // Add a copy icon (optional if not using the icon in the HTML template)
          const copyIcon = document.createElement("i");
          copyIcon.classList.add("bi", "bi-clipboard"); // Bootstrap clipboard icon
          txhashElement.appendChild(copyIcon);

          // Add click event to copy the full txhash to clipboard
          txhashElement.addEventListener("click", () => {
            navigator.clipboard
              .writeText(contribution.txhash)
              .then(() => {
                // Use the reusable toast function
                showToast("Transaction hash copied to clipboard!");
              })
              .catch((err) => {
                console.error("Failed to copy the txhash: ", err);
              });
          });

          clone.querySelector(".contribution-date").textContent = new Date(
            contribution.created_at * 1000
          ).toLocaleString();
          clone.querySelector(".contribution-status").textContent =
            contribution.is_pending
              ? "Pending"
              : !contribution.is_valid
              ? contribution.reason
              : "";

          if (contribution.is_pending) {
            const spinner = document.createElement("span");
            spinner.classList.add(
              "spinner-border",
              "spinner-border-sm",
              "ms-1"
            );
            spinner.setAttribute("role", "status"); // Accessibility

            // Optionally, you can add spinner text for accessibility (screen readers)
            const spinnerText = document.createElement("span");
            spinnerText.classList.add("visually-hidden");
            spinnerText.textContent = "Loading...";

            spinner.appendChild(spinnerText); // Append visually-hidden text for accessibility
            clone.querySelector(".contribution-status").appendChild(spinner);
          }

          if (contribution.is_pending) {
            refreshRequired = true;
          }

          // Append the cloned row to the container
          contributionsContainer.appendChild(clone);
        });

        if (refreshRequired) {
          setTimeout(refreshContributions, 2000);
        }
      }
    }
  }
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
  const txhashInput = document.getElementById("tx-hash-input");
  const submitBtn = document.getElementById("btn-submit-tx");
  try {
    const txhash = txhashInput.value.trim();

    // Step 1: Validate the transaction hash
    if (!validate_txhash(txhash)) {
      showToast("Invalid transaction hash. Please enter a valid one.");
      return; // Stop the function if the txhash is invalid
    }

    txhashInput.disabled = true;
    submitBtn.disabled = true;

    // Step 2: Make the POST request to submit the transaction
    let response = await fetch(`${BASE_API_URL}/submitTransaction`, {
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
      let result = await response.json();
      showToast(result.message);

      await refreshContributions();
    } else {
      const errorResult = await response.json();
      showToast(
        `Error: ${errorResult.error || "Failed to submit transaction"}`
      );
    }
  } catch (e) {
    console.error("Error while submitting transaction", e);
    showToast("An unexpected error occurred. Please try again.");
  } finally {
    setTimeout(() => {
      txhashInput.value = "";
      txhashInput.disabled = false;
      submitBtn.disabled = false;
    }, 1000);
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
    .getElementById("tx-hash-input")
    .addEventListener("keydown", function (event) {
      // Check if the pressed key is "Enter"
      if (event.key === "Enter") {
        // Prevent the default form submission if the input is inside a form
        event.preventDefault();

        // Call the function when "Enter" is pressed
        onSubmitTransaction();
      }
    });
  // document
  //   .querySelector("#btn-disconnect")
  //   .addEventListener("click", onDisconnect);
});
