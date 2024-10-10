"use strict";

/**
 * Example JavaScript code that interacts with the page and Web3 wallets
 */

// Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;

const BASE_API_URL_PLACEHOLDER = null;
const BASE_API_URL = BASE_API_URL_PLACEHOLDER || "http://localhost:3003/panel";

let web3Modal;

let provider;

let selectedAccount;

let sessionKey;
let discordUsername;
let discordUserId;

function validate_txhash(txhash) {
  return /^0x([A-Fa-f0-9]{64})$/.test(txhash);
}

function storeReturningUserFlag() {
  localStorage.setItem('hasConnectedBefore', 'true');
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
  const dUserid = urlParams.get("discordUserId");

  if (key) {
    sessionKey = key;
  }

  if(dUserid){
    discordUserId = dUserid;
  }

  if (discordUser) {
    discordUsername = discordUser;
    document.querySelector("#url-discord-user").textContent = discordUser;
  } else {
    document.querySelector("#url-discord-user").textContent = "Not provided";

    // hide all-content
    const allContent = document.getElementById("all-content");
    allContent.style.display = "none"; // Unhide the message

    return;
  }

  

  if (key && discordUser) {
    refreshVerifiedWallets();
    refreshContributions();
    refreshContributionSpecs();
  }

  configureVerifyButton();

  const hasConnectedBefore = localStorage.getItem('hasConnectedBefore');

  // Check if a cached provider exists
  const cachedProvider = web3Modal.cachedProvider;
  if (cachedProvider && hasConnectedBefore) {
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
    const signature = await web3.eth.personal.sign(
      message,
      selectedAccount,
      ""
    );

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
        discordUserId: discordUserId,
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
            showSuccessToast("Password copied to clipboard!");
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

function showSuccessToast(message) {
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

function showErrorToast(errorMessage) {
  const toastElement = document.getElementById('error-toast');

  // Set the message inside the toast body
  const toastBody = toastElement.querySelector('.toast-body');
  if (toastBody) {
    toastBody.textContent = errorMessage;
  }

  // Create a new Bootstrap toast instance and show it with a longer delay (e.g., 10 seconds)
  const toast = new bootstrap.Toast(toastElement, {
    delay: 15000 // Display for 10 seconds (10000ms)
  });
  
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
                showSuccessToast("Transaction hash copied to clipboard!");
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
                showSuccessToast("Transaction hash copied to clipboard!");
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

function setContributionValue(value) {
  // Save the user's chosen contribution value to localStorage
  localStorage.setItem('contributionValue', value);
}

function getContributionValue() {
  // Retrieve the stored contribution value from localStorage, or return the default value of 15
  const storedValue = localStorage.getItem('contributionValue');
  return storedValue ? parseInt(storedValue, 10) : 15;
}

async function refreshContributionSpecs() {
  const response = await fetch(
    `${BASE_API_URL}/getContributionSpecs?discord_username=${discordUsername}&session_key=${sessionKey}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (response.ok) {

    const web3 = new Web3(provider);
    const currentChainId = await web3.eth.getChainId();
    
    const data = await response.json();
    
    if (data) {
      const { chains, recipients } = data;
      const selectedChain = chains.find(chain => chain.chainId == currentChainId);
      const recipient = recipients[0]; // Use the first recipient address

      // Get the container where the content will be added
      const contributionSpecsDiv = document.getElementById('contribution-specs');
      contributionSpecsDiv.innerHTML = ''; // Clear previous content

      // Add wallet address (moved above the cards)
      const recipientAddressDiv = document.createElement('div');
      recipientAddressDiv.innerHTML = `<h6>Send funds to: <span class="text-primary">${recipient}</span></h6>`;
      contributionSpecsDiv.appendChild(recipientAddressDiv);  // Append to main container

      // Create a Bootstrap row to hold two sections
      const rowDiv = document.createElement('div');
      rowDiv.classList.add('row', 'mt-4');

      // === Left Section: Automated Contribution ===
      const leftColDiv = document.createElement('div');
      leftColDiv.classList.add('col-md-6', 'd-flex', 'align-items-stretch'); // Ensure the column stretches

      const automatedCard = document.createElement('div');
      automatedCard.classList.add('card', 'p-2', 'shadow-sm', 'mb-3', 'h-100', 'hover-lift', 'w-100'); // Card with h-100 to stretch

      const automatedTitle = document.createElement('h5');
      automatedTitle.classList.add('card-title');
      automatedTitle.textContent = 'Automated Contribution';
      automatedCard.appendChild(automatedTitle);

      // Create USDC balance element
      const balanceElement = document.createElement('p');
      balanceElement.id = 'usdc-balance';
      balanceElement.textContent = 'Balance: --'
      automatedCard.appendChild(balanceElement);

      // Create input field for contribution value
      const inputContainer = document.createElement('div');
      inputContainer.classList.add('form-group', 'mt-3', 'mb-3');
      
      const inputLabel = document.createElement('label');
      inputLabel.setAttribute('for', 'contributionValue');
      inputLabel.classList.add('form-label');
      inputLabel.textContent = 'Contribution Value ($):';
      
      const inputField = document.createElement('input');
      inputField.type = 'number';
      inputField.classList.add('form-control', 'w-100');
      inputField.value = getContributionValue();  // Use stored value or default value
      inputField.id = 'contributionValue';

       // Listen for changes and save the new value to localStorage
      inputField.addEventListener('input', (event) => {
        setContributionValue(event.target.value);
      });

      const txhashSpan = document.createElement('span')
      txhashSpan.id = 'txhashResult'
      txhashSpan.classList.add('fs-6')

      inputContainer.appendChild(inputLabel);
      inputContainer.appendChild(inputField);
      inputContainer.appendChild(txhashSpan);
      automatedCard.appendChild(inputContainer);

      if (!selectedAccount) {
        const connectButton = document.createElement('button');
        connectButton.classList.add('btn', 'btn-primary');
        connectButton.textContent = 'Connect Wallet';
        connectButton.addEventListener('click', async () => {
          await onConnect(); // Connect wallet on button click
          refreshContributionSpecs(); // Re-render the contribution buttons after wallet is connected
        });
        automatedCard.appendChild(connectButton);
      } else {
        // Create buttons for each chain and add event listeners if the wallet is connected
        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('d-flex', 'flex-wrap', 'gap-2', 'mt-3', 'justify-content-center', 'align-items-center');
        


        chains.forEach(async (chain) => {
          const button = document.createElement('button');
          button.classList.add('btn', 'disable-on-action'); // Add general button styles

          if(selectedChain?.name === chain.name){
            button.classList.add('btn-success');
          }else{
            button.classList.add('btn-secondary');
          }

          // Add custom styling based on the chain name
          // switch (chain.name) {
          //   case 'polygon':
          //     button.classList.add('btn-primary');
          //     break;
          //   case 'bsc':
          //     button.classList.add('btn-success');
          //     break;
          //   case 'vitruveo':
          //     button.classList.add('btn-info');
          //     break;
          // }

          button.textContent = `Send on ${chain.name}`;
          button.addEventListener('click', async () => {
            // Select all elements with the class 'disable-on-action'
            const elements = document.querySelectorAll('.disable-on-action');

            // Iterate over each element and disable it
            elements.forEach(element => {
              element.disabled = true;
            });
            try{
              await sendContribution(chain, recipient, inputField.value);
            }finally{
              elements.forEach(element => {
                element.disabled = false;
              });
            }
            await updateUSDCBalance(chain);  // Refresh the balance after contribution
          });

          // Ensure the button gets appended after the balance is fetched
          buttonContainer.appendChild(button);
        });

        automatedCard.appendChild(buttonContainer);
      }

      leftColDiv.appendChild(automatedCard);

      // === Right Section: Manual Contribution ===
      const rightColDiv = document.createElement('div');
      rightColDiv.classList.add('col-md-6', 'd-flex', 'align-items-stretch'); // Ensure the column stretches

      const manualCard = document.createElement('div');
      manualCard.classList.add('card', 'p-2', 'shadow-sm', 'mb-3', 'h-100', 'hover-lift', 'w-100'); // Card with h-100 to stretch

      const manualTitle = document.createElement('h5');
      manualTitle.classList.add('card-title');
      manualTitle.textContent = 'Manual Contribution';
      manualCard.appendChild(manualTitle);

      // Add manual steps
      const stepsList = document.createElement('ul');
      stepsList.innerHTML = `
        <li>Step 1: Complete the transfer to the specified address.</li>
        <li>Step 2: After the transfer is done, enter the transaction hash in the field below.</li>
        <li>Step 3: Press the submit button to complete the process.</li>
      `;
      manualCard.appendChild(stepsList);

      // Add USDC addresses for each chain (small text)
      const usdcAddressDiv = document.createElement('ul');
      usdcAddressDiv.innerHTML = `<h6>USDC Addresses for Manual Transfer:</h6>`;
      chains.forEach(chain => {
        const addressInfo = document.createElement('li');
        addressInfo.innerHTML = `<strong>${chain.name.toUpperCase()}:</strong> ${chain.usdcAddress}`;
        addressInfo.classList.add('text-muted', 'small'); // Make text smaller
        usdcAddressDiv.appendChild(addressInfo);
      });

      manualCard.appendChild(usdcAddressDiv);
      rightColDiv.appendChild(manualCard);

      // Append both sections to the row
      rowDiv.appendChild(leftColDiv);
      rowDiv.appendChild(rightColDiv);

      // Finally, append the row to the main container
      contributionSpecsDiv.appendChild(rowDiv);

      // const web3 = new Web3(provider); // Use the provider from Web3Modal
      // const currentChainId = await web3.eth.getChainId();
      // const chain = chains.find(chain => chain.chainId == currentChainId);
      await updateUSDCBalance(selectedChain); 
    }
  }
}

async function updateUSDCBalance(chain) {
  if (!selectedAccount || !provider) {
    console.error("Wallet not connected.");
    return;
  }

  if (!chain) {
    document.getElementById('usdc-balance').textContent = 'USDC not supported on this network.';
    return;
  }
  
  try {
    const web3 = new Web3(provider); // Use the provider from Web3Modal

    // Instantiate the USDC contract using the ABI provided
    const usdcContract = new web3.eth.Contract(
      [{
        constant: true,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        payable: false,
        stateMutability: 'view',
        type: 'function',
      }],
      chain.usdcAddress
    );

    // Fetch the USDC balance for the connected account
    const tokenBalance = await usdcContract.methods.balanceOf(selectedAccount).call();

    // Convert the balance to a human-readable format
    const readableBalance = (parseFloat(tokenBalance) / Math.pow(10, chain.decimals)).toFixed(2);

    // Display the balance in the UI
    document.getElementById('usdc-balance').textContent = `Balance: ${readableBalance} USDC on ${chain.name}`;
  } catch (error) {
    console.error(`Error fetching USDC balance:`, error);
    document.getElementById('usdc-balance').textContent = 'Error fetching balance.';
  }
}



async function sendContribution(chain, recipient, contributionValue) {
  const txHashInput = document.getElementById('tx-hash-input')
  txHashInput.value = '';
  
  // Ensure decimals is provided and valid
  const decimals = chain.decimals || 18; // Default to 18 if decimals is not provided
  if (isNaN(decimals) || !contributionValue) {
    console.error(`Invalid decimal or contribution value for ${chain.name}`);
    return;
  }

  // Convert the contribution value into the correct WEI format based on chain decimals
  const valueInWei = Web3.utils.toWei(contributionValue.toString(), 'ether') / Math.pow(10, (18 - decimals));

  console.log(`Sending ${valueInWei} to ${recipient} on ${chain.name} via ${chain.usdcAddress}`);

  try {
    const web3 = new Web3(provider); // Use the provider from Web3Modal

    const accounts = await web3.eth.getAccounts(); // Fetch connected accounts
    const fromAccount = accounts[0]; // Use the first connected account

    const currentChainId = await web3.eth.getChainId();
    const desiredChainId = parseInt(chain.chainId); // Convert chainId to number

    // Switch chain if needed
    if (currentChainId !== desiredChainId) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: Web3.utils.toHex(desiredChainId) }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          try {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: Web3.utils.toHex(desiredChainId),
                chainName: chain.name,
                rpcUrls: [chain.rpcUrl],
                nativeCurrency: {
                  name: chain.nativeCurrency.name,
                  symbol: chain.nativeCurrency.symbol,
                  decimals: chain.nativeCurrency.decimals,
                },
                blockExplorerUrls: [chain.blockExplorerUrl],
              }],
            });
          } catch (addError) {
            console.error(`Failed to add ${chain.name} chain`, addError);
            showErrorToast(`Failed to add ${chain.name} chain: ${addError.message}`);
            return;
          }
        } else {
          console.error(`Failed to switch chain: ${switchError.message}`);
          showErrorToast(`Failed to switch chain: ${switchError.message}`);
          return;
        }
      }
    }

    // Check account's token balance
    const tokenContract = new web3.eth.Contract([{
      constant: true,
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      type: 'function'
    }], chain.usdcAddress);

    const tokenBalance = await tokenContract.methods.balanceOf(fromAccount).call();

    // Convert token balance (BigInt) to human-readable format by dividing by 10^decimals
    const readableBalance = BigInt(tokenBalance) / BigInt(Math.pow(10, decimals));

    // Check if the account has enough balance
    if (BigInt(tokenBalance) < BigInt(valueInWei)) {
      showErrorToast(`Insufficient balance! You only have ${readableBalance} USDC`);
      return;
    }

    // Create the transaction data using the ERC-20 transfer function
    const txData = web3.eth.abi.encodeFunctionCall({
      name: 'transfer',
      type: 'function',
      inputs: [{
        type: 'address',
        name: '_to',
      }, {
        type: 'uint256',
        name: '_value',
      }]
    }, [recipient, valueInWei.toString()]); // Arguments: recipient address and value in WEI

    // Prepare the transaction object
    const tx = {
      from: fromAccount,
      to: chain.usdcAddress, // USDC contract address on the current chain
      data: txData, // Encoded transfer data
      gas: await estimateGas(fromAccount, chain.usdcAddress, txData), // Gas estimate
      gasPrice: web3.utils.toWei('5', 'gwei'), // Gas price in Gwei
      chainId: desiredChainId, // Desired chain ID
    };

    // Send the transaction

    web3.eth.sendTransaction(tx)
      .on('transactionHash', function(hash){
        txHashInput.value = hash;
      })
      .on('receipt', function(receipt){
          console.log('receipt', receipt)
      })
      .on('confirmation', function(confirmationNumber, receipt){ 
          console.log('confirmation', confirmationNumber, receipt)
       })
      .on('error', function(error){
        if (error && !error.message?.includes('transaction indexing is in progress')) {
          console.error(`Error sending transaction on ${chain.name}:`, error);
          showErrorToast(`Error: ${error.message}`);
        }        
      }); 


  } catch (error) {
    console.error(`Error sending transaction on ${chain.name}:`, error);
    showErrorToast(`Error: ${error.message}`);
  }
}


// Helper function to estimate gas for the transaction
async function estimateGas(from, to, data) {
  try {
    const web3 = new Web3(provider); // Use the provider from Web3Modal
    const gas = await web3.eth.estimateGas({
      from: from,
      to: to,
      data: data,
    });

    return gas;
  } catch (error) {
    console.error('Gas estimation failed:', error);
    return 23000; 
  }
}


function setupProviderListeners() {
  if (provider) {
    provider.on("accountsChanged",async () => {
      await refreshAccountData();
      await refreshContributionSpecs();
    });

    provider.on("chainChanged", async () => {
      await refreshAccountData();
      await refreshContributionSpecs();
    });

    provider.on("networkChanged", async () => {
      await refreshAccountData();
      await refreshContributionSpecs();
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

    storeReturningUserFlag();
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

  // Re-render the contribution section to show the "Connect Wallet" button again
  refreshContributionSpecs();
}

async function onSubmitTransaction() {
  const txhashInput = document.getElementById("tx-hash-input");
  const submitBtn = document.getElementById("btn-submit-tx");
  try {
    const txhash = txhashInput.value.trim();

    // Step 1: Validate the transaction hash
    if (!validate_txhash(txhash)) {
      showSuccessToast("Invalid transaction hash. Please enter a valid one.");
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
      showSuccessToast(result.message);

      await refreshContributions();
    } else {
      const errorResult = await response.json();
      showErrorToast(
        `${errorResult.error || "Failed to submit transaction"}`
      );
    }
  } catch (e) {
    console.error("Error while submitting transaction", e);
    showSuccessToast("An unexpected error occurred. Please try again.");
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
    // await web3Modal?.clearCachedProvider();
    await init();
  }, 1000);
  document.querySelector("#btn-connect").addEventListener("click", async ()=>{
    await onConnect()
    await refreshContributionSpecs();
  });
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
