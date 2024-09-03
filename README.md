# Geth Monitor Agent installation guide
The agent installed on your system will manage the communication of metrics to the master agent. A service will be configured on your VPS to ensure it runs continuously, even after a reboot.

Initially, only one metric will be communicated: the Peer Count. Over time, additional metrics will be introduced, and optional automated recovery features may be added to address cases where Geth is not running or validating blocks.

Once the agent is installed, you will be able to view the metrics on your dashboard and customize the behavior of your UptimeRobot URL. For example, you can configure it to trigger alerts based on a Peer Count of zero.

## Installation steps
Run this single command. 
```shell
curl -fsSL https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-agent/main/service/agent/install.sh -o /tmp/install.sh && sudo bash /tmp/install.sh && rm /tmp/install.sh

```