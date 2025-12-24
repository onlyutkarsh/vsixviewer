import * as vscode from "vscode";
import { VsixOutlineProvider } from "./vsixOutlineProvider";
import { Logger } from "./util/logger";

export function activate(context: vscode.ExtensionContext) {
	const logger = Logger.instance;
	context.subscriptions.push(logger);

	logger.logInfo("Extension activating");
	let commandReference = vscode.commands.registerCommand("vsixViewer.showInVSIXViewer", (selectedFile: vscode.Uri) => {
		if (!selectedFile) {
			vscode.window.showWarningMessage("Please right click on a VSIX file in the Explorer and select 'Show in VSIX Viewer'.");
			return;
		}
		const vsixOutlineProvider = new VsixOutlineProvider(context, selectedFile.fsPath);
		vscode.window.registerTreeDataProvider("vsixViewer", vsixOutlineProvider);
		vsixOutlineProvider.triggerParsing();
	});
	context.subscriptions.push(commandReference);
	logger.logInfo("Command registrations complete");
	logger.logInfo("Activation complete");
}

// this method is called when your extension is deactivated
export function deactivate() {
}
