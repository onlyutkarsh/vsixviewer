import * as vscode from "vscode";
import { VsixOutlineProvider } from "./vsixOutlineProvider";
import Util from "./util";
import TelemetryClient from "./telemetryClient";

export function activate(context: vscode.ExtensionContext) {

	Util.instance.log("Extension activating");
	let commandReference = vscode.commands.registerCommand("vsixViewer.showInVSIXViewer", (selectedFile: vscode.Uri) => {
		if (!selectedFile) {
			TelemetryClient.instance.sendEvent("useContextMenuWarning");
			vscode.window.showWarningMessage("Please right click on a VSIX file in the Explorer and select 'Show in VSIX Viewer'.");
			return;
		}
		TelemetryClient.instance.sendEvent("showInVSIXViewerClicked");
		const vsixOutlineProvider = new VsixOutlineProvider(context, selectedFile.fsPath);
		vscode.window.registerTreeDataProvider("vsixViewer", vsixOutlineProvider);
		vsixOutlineProvider.triggerParsing();
	});
	context.subscriptions.push(commandReference);
	Util.instance.log("Command registrations complete");
	Util.instance.log("Activation complete");
	TelemetryClient.instance.sendEvent("extensionInitialized");
}

// this method is called when your extension is deactivated
export function deactivate() {
	TelemetryClient.instance.dispose();
}
