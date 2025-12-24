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

	// Register the content provider once for all files
	const contentMap = new Map<string, Uint8Array>();
	const contentProvider = new class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			const content = contentMap.get(uri.toString());
			if (!content) {
				return "[File content not available]";
			}

			// Try to decode as UTF-8 text
			try {
				return new TextDecoder().decode(content);
			} catch {
				const fileName = new URLSearchParams(uri.query).get("name") || "file";
				return `[Binary file: ${fileName}]\n\nThis file appears to be binary and cannot be displayed as text.\nSize: ${content.length} bytes`;
			}
		}
	};
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("vsix-content", contentProvider));

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("vsixViewer.showBadge")) {
				logger.logInfo("Badge setting changed, updating view...");
				vsixOutlineProvider.updateBadge();
			}
		})
	);

	// Scan workspace for VSIX files on activation
	scanWorkspaceForVsixFiles().then(async (vsixFiles) => {
		logger.logInfo(`Found ${vsixFiles.length} VSIX file(s) in workspace`);

		// Set context for view welcome
		vscode.commands.executeCommand("setContext", "vsixViewer.hasFiles", vsixFiles.length > 0);

		if (vsixFiles.length > 0) {
			await vsixOutlineProvider.loadVsixFiles(vsixFiles);
			vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 5000);
		} else {
			vscode.window.setStatusBarMessage("VSIX Viewer: No VSIX files found in workspace", 5000);
		}
	});

	// Watch for new VSIX files
	const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.vsix");

	fileWatcher.onDidCreate(async () => {
		logger.logInfo("New VSIX file detected, refreshing...");
		const vsixFiles = await scanWorkspaceForVsixFiles();
		vscode.commands.executeCommand("setContext", "vsixViewer.hasFiles", vsixFiles.length > 0);
		await vsixOutlineProvider.loadVsixFiles(vsixFiles);
		vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 3000);
	});

	fileWatcher.onDidDelete(async () => {
		logger.logInfo("VSIX file deleted, refreshing...");
		const vsixFiles = await scanWorkspaceForVsixFiles();
		vscode.commands.executeCommand("setContext", "vsixViewer.hasFiles", vsixFiles.length > 0);
		await vsixOutlineProvider.loadVsixFiles(vsixFiles);
		vscode.window.setStatusBarMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`, 3000);
	});

	context.subscriptions.push(fileWatcher);

	// Add refresh command
	context.subscriptions.push(
		vscode.commands.registerCommand("vsixViewer.refresh", async () => {
			const vsixFiles = await scanWorkspaceForVsixFiles();
			vscode.commands.executeCommand("setContext", "vsixViewer.hasFiles", vsixFiles.length > 0);
			await vsixOutlineProvider.loadVsixFiles(vsixFiles);

			if (vsixFiles.length > 0) {
				vscode.window.showInformationMessage(`VSIX Viewer: Found ${vsixFiles.length} file(s)`);
			} else {
				vscode.window.showInformationMessage("VSIX Viewer: No VSIX files found in workspace");
			}
		})
	);

	// Clean up content map when documents are closed
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(doc => {
			if (doc.uri.scheme === "vsix-content") {
				const uriString = doc.uri.toString();
				const content = contentMap.get(uriString);
				if (content && contentMap.delete(uriString)) {
					const sizeMB = content.length / (1024 * 1024);
					logger.logInfo(`Freed ${sizeMB.toFixed(2)} MB from memory (${contentMap.size} files still open)`);
				}
			}
		})
	);

	// Command to open a file from the tree view
	const openFileCommand = vscode.commands.registerCommand("vsixViewer.openFile", async (item: any) => {
		try {
			const content = await vsixOutlineProvider.getFileContent(item);
			if (!content) {
				vscode.window.showErrorMessage("Failed to read file content");
				return;
			}

			const vsixPath = vsixOutlineProvider.getVsixPathForItem(item);
			if (!vsixPath) {
				vscode.window.showErrorMessage("Could not determine VSIX file for item");
				return;
			}

			// Warn about large files (> 5MB)
			const fileSizeMB = content.length / (1024 * 1024);
			if (fileSizeMB > 5) {
				const proceed = await vscode.window.showWarningMessage(
					`This file is ${fileSizeMB.toFixed(1)} MB. Opening large files may use significant memory. Continue?`,
					{ modal: true },
					"Open Anyway"
				);
				if (proceed !== "Open Anyway") {
					return;
				}
			}

			// Create a unique virtual document URI including the VSIX path to avoid collisions
			const fileName = item.label;
			const vsixHash = Buffer.from(vsixPath).toString("base64").replace(/[/+=]/g, "_");
			const uri = vscode.Uri.parse(`vsix-content:${vsixHash}/${item.fullPath}?name=${encodeURIComponent(fileName)}&vsix=${encodeURIComponent(vsixPath)}`);

			// Store the content in the map for the provider to access
			contentMap.set(uri.toString(), content);
			logger.logInfo(`Loaded ${fileSizeMB.toFixed(2)} MB into memory for ${fileName}`);

			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, {
				preview: true,
				preserveFocus: false
			});
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
