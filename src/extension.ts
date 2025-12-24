import * as vscode from "vscode";
import { VsixOutlineProvider } from "./vsixOutlineProvider";
import { Logger } from "./util/logger";

async function scanWorkspaceForVsixFiles(): Promise<string[]> {
	const vsixFiles = await vscode.workspace.findFiles("**/*.vsix", "**/node_modules/**");
	return vsixFiles.map(uri => uri.fsPath);
}

export function activate(context: vscode.ExtensionContext) {
	const logger = Logger.instance;
	context.subscriptions.push(logger);

	logger.logInfo("Extension activating");

	// Create a single instance of the tree provider
	const vsixOutlineProvider = new VsixOutlineProvider(context);
	const treeView = vscode.window.createTreeView("vsixViewer", {
		treeDataProvider: vsixOutlineProvider
	});
	vsixOutlineProvider.setTreeView(treeView);
	context.subscriptions.push(treeView);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('vsixViewer.showBadge')) {
				logger.logInfo("Badge setting changed, updating view...");
				vsixOutlineProvider.updateBadge();
			}
		})
	);

	// Scan workspace for VSIX files on activation
	scanWorkspaceForVsixFiles().then(async (vsixFiles) => {
		logger.logInfo(`Found ${vsixFiles.length} VSIX file(s) in workspace`);

		// Set context for view welcome
		vscode.commands.executeCommand('setContext', 'vsixViewer.hasFiles', vsixFiles.length > 0);

		if (vsixFiles.length > 0) {
			await vsixOutlineProvider.loadVsixFiles(vsixFiles);
			vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 5000);
		} else {
			vscode.window.setStatusBarMessage('VSIX Viewer: No VSIX files found in workspace', 5000);
		}
	});

	// Watch for new VSIX files
	const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.vsix");

	fileWatcher.onDidCreate(async () => {
		logger.logInfo("New VSIX file detected, refreshing...");
		const vsixFiles = await scanWorkspaceForVsixFiles();
		vscode.commands.executeCommand('setContext', 'vsixViewer.hasFiles', vsixFiles.length > 0);
		await vsixOutlineProvider.loadVsixFiles(vsixFiles);
		vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 3000);
	});

	fileWatcher.onDidDelete(async () => {
		logger.logInfo("VSIX file deleted, refreshing...");
		const vsixFiles = await scanWorkspaceForVsixFiles();
		vscode.commands.executeCommand('setContext', 'vsixViewer.hasFiles', vsixFiles.length > 0);
		await vsixOutlineProvider.loadVsixFiles(vsixFiles);
		vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 3000);
	});

	context.subscriptions.push(fileWatcher);

	// Add refresh command
	context.subscriptions.push(
		vscode.commands.registerCommand("vsixViewer.refresh", async () => {
			const vsixFiles = await scanWorkspaceForVsixFiles();
			vscode.commands.executeCommand('setContext', 'vsixViewer.hasFiles', vsixFiles.length > 0);
			await vsixOutlineProvider.loadVsixFiles(vsixFiles);

			if (vsixFiles.length > 0) {
				vscode.window.showInformationMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`);
			} else {
				vscode.window.showInformationMessage('VSIX Viewer: No VSIX files found in workspace');
			}
		})
	);

	// Command to open a file from the tree view
	let openFileCommand = vscode.commands.registerCommand("vsixViewer.openFile", async (item: any) => {
		try {
			const content = await vsixOutlineProvider.getFileContent(item);
			if (!content) {
				vscode.window.showErrorMessage("Failed to read file content");
				return;
			}

			// Create a virtual document to display the content
			const fileName = item.label;
			const uri = vscode.Uri.parse(`vsix-content:${item.fullPath}?name=${encodeURIComponent(fileName)}`);

			// Register a text document content provider for this virtual document
			const provider = new class implements vscode.TextDocumentContentProvider {
				provideTextDocumentContent(): string {
					// Try to decode as UTF-8 text
					try {
						return new TextDecoder().decode(content);
					} catch {
						return `[Binary file: ${fileName}]\n\nThis file appears to be binary and cannot be displayed as text.\nSize: ${content.length} bytes`;
					}
				}
			};

			context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("vsix-content", provider));

			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, {
				preview: true,
				preserveFocus: false
			});

			// Make the document read-only by listening to text changes and preventing them
			context.subscriptions.push(
				vscode.workspace.onDidChangeTextDocument(e => {
					if (e.document.uri.scheme === "vsix-content") {
						// Show a message that the file is read-only
						if (e.contentChanges.length > 0) {
							vscode.window.showWarningMessage("This file is read-only (from VSIX archive)");
						}
					}
				})
			);
		} catch (error) {
			logger.logError("Failed to open file", error as Error);
			vscode.window.showErrorMessage(`Failed to open file: ${error}`);
		}
	});
	context.subscriptions.push(openFileCommand);

	logger.logInfo("Command registrations complete");
	logger.logInfo("Activation complete");
}

// this method is called when your extension is deactivated
export function deactivate() {
}
