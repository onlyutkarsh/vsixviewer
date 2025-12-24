import * as vscode from "vscode";
import { Logger } from "./util/logger";
import { TreeItemCollapsibleState } from "vscode";
import * as path from "path";
import { VsixItem } from "./vsixItem";
import * as fs from "fs";
import * as jszip from "jszip";

export class VsixOutlineProvider implements vscode.TreeDataProvider<VsixItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<VsixItem | undefined | null | void> = new vscode.EventEmitter<VsixItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<VsixItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private _vsixFiles: Map<string, { root: VsixItem; zip: jszip }> = new Map();
    private _context: vscode.ExtensionContext;
    private _logger = Logger.instance;
    private _treeView: vscode.TreeView<VsixItem> | undefined;
    private _extensionIconMap: Map<string, string> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this._logger.logInfo("VsixOutlineProvider initialized");
        this._context = context;
        this.loadIconConfiguration();
    }

    public setTreeView(treeView: vscode.TreeView<VsixItem>) {
        this._treeView = treeView;
    }

    public updateBadge() {
        if (this._treeView) {
            const count = this._vsixFiles.size;
            const config = vscode.workspace.getConfiguration('vsixViewer');
            const showBadge = config.get<boolean>('showBadge', true);

            if (showBadge) {
                this._treeView.badge = {
                    tooltip: count === 1 ? "1 VSIX file in workspace" : `${count} VSIX files in workspace`,
                    value: count
                };
            } else {
                this._treeView.badge = undefined;
            }

            this._logger.logInfo(`Updated badge: ${showBadge ? count : 'disabled'}`);
        }
    }

    public async loadVsixFiles(vsixPaths: string[]) {
        this._logger.logInfo(`Loading ${vsixPaths.length} VSIX file(s)`);
        this._vsixFiles.clear();

        for (const vsixPath of vsixPaths) {
            try {
                await this.loadSingleVsix(vsixPath);
            } catch (error) {
                this._logger.logError(`Failed to load ${vsixPath}`, error as Error);
            }
        }

        // Update tree view with file count
        if (this._treeView) {
            const count = this._vsixFiles.size;

            // Update badge
            this.updateBadge();

            // Set description
            const description = count === 1 ? "1 in workspace" : `${count} in workspace`;
            this._treeView.description = description;
            this._logger.logInfo(`Set tree view description to: ${description}`);
        }

        this._onDidChangeTreeData.fire(undefined);
    }

    private async loadSingleVsix(vsixPath: string): Promise<void> {
        const root = await this.parseVsix(vsixPath);
        const zip = await this.loadZip(vsixPath);
        this._vsixFiles.set(vsixPath, { root, zip });
    }

    public async getFileContent(item: VsixItem): Promise<Uint8Array | undefined> {
        // Find which VSIX this item belongs to
        for (const [, data] of this._vsixFiles.entries()) {
            if (this.itemBelongsToRoot(item, data.root)) {
                const file = data.zip.file(item.fullPath);
                if (!file) {
                    return undefined;
                }
                return await file.async("uint8array");
            }
        }
        return undefined;
    }

    private itemBelongsToRoot(item: VsixItem, root: VsixItem): boolean {
        let current: VsixItem | undefined = item;
        while (current) {
            if (current === root) {
                return true;
            }
            // Traverse up by checking if this item is in any parent's children
            let found = false;
            for (const data of this._vsixFiles.values()) {
                const parent = this.findParent(current, data.root);
                if (parent) {
                    current = parent;
                    found = true;
                    break;
                }
            }
            if (!found) {
                break;
            }
        }
        return false;
    }

    private findParent(item: VsixItem, root: VsixItem): VsixItem | undefined {
        if (root.children.includes(item)) {
            return root;
        }
        for (const child of root.children) {
            const parent = this.findParent(item, child);
            if (parent) {
                return parent;
            }
        }
        return undefined;
    }

    public refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }


    sort(item1: VsixItem) {
        if (item1.isDirectory) {
            item1.children.sort((item1, item2) => {
                return (item1.isDirectory > item2.isDirectory ? -1 : 1);
            });
            item1.children.forEach(child => {
                this.sort(child);
            });
        }
    }

    async getChildren(element?: VsixItem): Promise<VsixItem[]> {
        if (!element) {
            // Return all VSIX roots
            const roots: VsixItem[] = [];
            for (const data of this._vsixFiles.values()) {
                roots.push(data.root);
            }
            return Promise.resolve(roots);
        }
        else {
            return Promise.resolve(element.children);
        }
    }

    getTreeItem(element: VsixItem): vscode.TreeItem {
        let extension = path.extname(element.label).replace(".", "");
        element.iconType = element.isDirectory ? (element.iconType === "vsix" ? "vsix" : "dir") : extension;
        element.iconPath = this.getIcon(element.iconType);

        // Make files clickable
        if (!element.isDirectory && element.fullPath) {
            element.command = {
                command: "vsixViewer.openFile",
                title: "Open File",
                arguments: [element]
            };
        }

        return element;
    }

    buildTree(rootItem: VsixItem, entryPath: string[], isDirectory: boolean, index: number, fullPath: string) {

        if (index < entryPath.length) {
            let item = entryPath[index];
            let exists = rootItem.children.find(child => child.label === item);
            if (!exists) {
                exists = new VsixItem(item);
                exists.collapsibleState = isDirectory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
                exists.isDirectory = isDirectory;
                rootItem.children.push(exists);
            }

            // Set fullPath for files (when we're at the last element)
            if (index === entryPath.length - 1) {
                exists.fullPath = fullPath;
            }

            this.buildTree(exists, entryPath, isDirectory, index + 1, fullPath);
        }
    }
    getIcon(contextValue: string): string | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri; } | vscode.ThemeIcon | undefined {
        switch (contextValue) {
            case "dir":
                {
                    const folderIcon = this.resolveIconFromConfig("dir");
                    return folderIcon ?? vscode.ThemeIcon.Folder;
                }
            default:
                {
                    const mappedIcon = this.resolveIconFromConfig(contextValue);
                    if (mappedIcon) {
                        return mappedIcon;
                    }
                    const iconForExtension = this.toIcon(contextValue);
                    return iconForExtension ?? this.toIcon("file");
                }
        }
    }

    private resolveIconFromConfig(extension: string): string | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri; } | vscode.ThemeIcon | undefined {
        if (!extension) {
            return undefined;
        }
        const iconName = this._extensionIconMap.get(extension.toLowerCase());
        if (!iconName) {
            return undefined;
        }
        return this.toIcon(iconName);
    }

    toIcon(extension: string): string | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri; } | vscode.ThemeIcon | undefined {
        let lightPath = this._context.asAbsolutePath(path.join("images", "light", `${extension}.svg`));
        let darkPath = this._context.asAbsolutePath(path.join("images", "dark", `${extension}.svg`));

        if (fs.existsSync(lightPath) && fs.existsSync(darkPath)) {
            return {
                light: vscode.Uri.file(lightPath),
                dark: vscode.Uri.file(darkPath)
            };
        }
        return;
    }

    private loadIconConfiguration(): void {
        const configPath = this._context.asAbsolutePath(path.join("images", "icons.json"));
        try {
            if (!fs.existsSync(configPath)) {
                this._logger.logInfo(`Icon configuration not found at ${configPath}`);
                return;
            }
            const raw = fs.readFileSync(configPath, "utf8");
            const config = JSON.parse(raw) as { groups?: Array<{ icon: string; extensions: string[] }>; };
            config.groups?.forEach(group => {
                if (!group?.icon || !Array.isArray(group.extensions)) {
                    return;
                }
                group.extensions.forEach(extension => {
                    if (typeof extension === "string" && extension.trim().length > 0) {
                        this._extensionIconMap.set(extension.toLowerCase(), group.icon);
                    }
                });
            });
            this._logger.logInfo(`Loaded ${this._extensionIconMap.size} icon mappings`);
        } catch (error) {
            this._logger.logError("Failed to load icon configuration", error as Error);
        }
    }

    private async loadZip(vsixPath: string): Promise<jszip> {
        const data = fs.readFileSync(vsixPath);
        return await jszip.loadAsync(data, { createFolders: true });
    }

    async parseVsix(selectedItem: string): Promise<VsixItem> {
        let that = this;
        let fileName = path.basename(selectedItem);

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Scanning ${fileName}`,
        }, () => {
            this._logger.logInfo(`Selected item: ${selectedItem}`);
            let root = new VsixItem(fileName, TreeItemCollapsibleState.Expanded);
            root.isDirectory = true;
            root.tooltip = selectedItem;
            root.iconType = "vsix";
            root.iconPath = this.getIcon(root.iconType);
            return new Promise<VsixItem>((resolve, reject) => {
                fs.readFile(selectedItem, (err, data) => {
                    if (err) {
                        this._logger.logError("Error occurred while reading VSIX", err);
                        reject(err);
                        return;
                    }
                    jszip.loadAsync(data, {
                        createFolders: true
                    }).then(zip => {
                        let files = Object.keys(zip.files);
                        this._logger.logInfo(`Entries read: ${files.length}`);
                        files.forEach(entry => {
                            let file = zip.files[entry];
                            this._logger.logDebug("ParseVsix", `Entry ${file.name}`);
                            let pathArray = file.name.split("/").filter(v => {
                                return v && v.length > 0;
                            });
                            that.buildTree(root, pathArray, file.dir, 0, file.name);
                        });
                        that.sort(root);
                        resolve(root);
                    });
                });
            });
        });
    }
}
