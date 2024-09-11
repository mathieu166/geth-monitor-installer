# Authentication Process
The agent installed on your system will manage the communication of the peer count to the master agent. A service will be configured on your VPS to ensure it runs continuously, even after a reboot.

Once the agent is installed, you will be able to view the peer count on your dashboard and customize the behavior of your UptimeRobot URL. For example, you can configure it to trigger alerts based on a Peer Count of zero.

## Installation steps
Open a session on your VPS and execute this command:
```shell
curl -fsSL https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-agent/main/service/agent/install.sh -o /tmp/install.sh && sudo bash /tmp/install.sh && rm /tmp/install.sh
```
The installation script can be reviewed here, if desired: 
[install.sh](https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-agent/main/service/agent/install.sh)

## Uninstallation steps
To unsintall the agent, simply execute these commands (can be executed all at once):
```shell
sudo systemctl stop vitruveo-monitor-agent.timer
sudo systemctl disable vitruveo-monitor-agent.timer
sudo systemctl stop vitruveo-monitor-agent.service
sudo systemctl disable vitruveo-monitor-agent.service
sudo rm /etc/systemd/system/vitruveo-monitor-agent.service
sudo rm /etc/systemd/system/vitruveo-monitor-agent.timer
```
## Technical notes
The agent is a bash script that runs as a systemd service and is triggered every 15 seconds by a timer.

Some useful commands:
| Description | Command |
| ----------- | ----------- |
| Stop Agent | ```sudo systemctl stop vitruveo-monitor-agent.timer```|
| Restart Agent | ```sudo systemctl restart vitruveo-monitor-agent.timer```|
| Disable on reboot | ```sudo systemctl disable vitruveo-monitor-agent.timer```|