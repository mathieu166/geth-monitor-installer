# Geth Monitor Agent installation guide
The agent installed on your system will manage the communication of metrics to the master agent. A service will be configured on your VPS to ensure it runs continuously, even after a reboot.

Initially, only one metric will be communicated: the Peer Count. Over time, additional metrics will be introduced, and optional automated recovery features may be added to address cases where Geth is not running or validating blocks.

Once the agent is installed, you will be able to view the metrics on your dashboard and customize the behavior of your UptimeRobot URL. For example, you can configure it to trigger alerts based on a Peer Count of zero.

## Installation steps
1. Install Node JS <div class="code-container">
    <pre><code id="code-to-copy">curl -fsSL https://fnm.vercel.app/install | bash && source ~/.bashrc && export PATH=$HOME/.fnm:$PATH && eval "$(fnm env)" && fnm use --install-if-missing 20 && node -v && npm -v</code></pre>
    <button class="copy-button" onclick="copyToClipboard()">Copy Script</button>
</div>

<script>
    function copyToClipboard() {
        const code = document.getElementById("code-to-copy").textContent;
        navigator.clipboard.writeText(code).then(() => {
            alert("Code copied to clipboard!");
        }, () => {
            alert("Failed to copy code to clipboard.");
        });
    }
</script>