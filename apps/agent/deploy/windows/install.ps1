# UNTESTED TEMPLATE. Run in an elevated PowerShell from the agent folder.
# Registers the agent with NSSM (https://nssm.cc), which keeps a Node process
# running as a Windows service and restarts it if it stops.

param(
  [string]$InstallDir = "C:\CStoreFlow\agent",
  [string]$ConfigFile = "C:\CStoreFlow\agent.config.json",
  [string]$Nssm = "C:\CStoreFlow\nssm.exe"
)

$ErrorActionPreference = "Stop"
$npx = (Get-Command npx.cmd).Source

& $Nssm install CStoreFlowAgent $npx "tsx src/main.ts run --config `"$ConfigFile`""
& $Nssm set CStoreFlowAgent AppDirectory $InstallDir
& $Nssm set CStoreFlowAgent Start SERVICE_AUTO_START
& $Nssm set CStoreFlowAgent AppStdout "C:\CStoreFlow\logs\agent.log"
& $Nssm set CStoreFlowAgent AppStderr "C:\CStoreFlow\logs\agent.log"
# Set secrets here instead of in the config file:
# & $Nssm set CStoreFlowAgent AppEnvironmentExtra "CSF_AGENT_KEY=..." "CSF_COMMANDER_PASSWORD=..."

Start-Service CStoreFlowAgent
Get-Service CStoreFlowAgent
