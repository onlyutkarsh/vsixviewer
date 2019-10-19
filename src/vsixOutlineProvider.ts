import * as vscode from 'vscode';
import Util from "./util";
import { TreeItemCollapsibleState } from "vscode";
import * as path from "path";
import { VsixItem } from "./vsixItem";
import * as fs from "fs";
import TelemetryClient from './telemetryClient';
import * as jszip from "jszip";


export class VsixOutlineProvider implements vscode.TreeDataProvider<VsixItem>{
    private _onDidChangeTreeData: vscode.EventEmitter<VsixItem> = new vscode.EventEmitter<VsixItem>();
    readonly onDidChangeTreeData: vscode.Event<VsixItem> = this._onDidChangeTreeData.event;
    private _vsixPath: string;
    private _context: vscode.ExtensionContext;
    constructor(context: vscode.ExtensionContext, vsixPath: string) {
        Util.instance.log("VsixOutlineProvider initialized");
        this._vsixPath = vsixPath;
        this._context = context;
    }

    async getChildren(element?: VsixItem): Promise<VsixItem[]> {
        if (!element) {
            Util.instance.log("Getting contents of VSIX");
            let root = await this.parseVsix(this._vsixPath);
            root.children.sort((item1, item2) => {
                return (item1.isDirectory > item2.isDirectory ? 0 : 1);
            });
            return Promise.resolve([root]);
        }
        else {
            Util.instance.log(`Getting contents of '${element.label}'`);
            return Promise.resolve(element.children);
        }
    }

    getTreeItem(element: VsixItem): vscode.TreeItem {
        let extension = path.extname(element.label).replace(".", "");
        element.iconType = element.isDirectory ? "dir" : extension;
        element.iconPath = this.getIcon(element.iconType);
        return element;
    }

    buildTree(rootItem: VsixItem, entryPath: string[], isDirectory: boolean, index: number) {

        if (index < entryPath.length) {
            let item = entryPath[index];
            let exists = rootItem.children.find(child => child.label === item);
            if (!exists) {
                exists = new VsixItem(item);
                exists.collapsibleState = isDirectory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
                exists.isDirectory = isDirectory;
                rootItem.children.push(exists);
            }
            this.buildTree(exists, entryPath, isDirectory, index + 1);
        }
    }
    getIcon(contextValue: string): string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri; } | vscode.ThemeIcon | undefined {
        switch (contextValue) {
            case "dir":
                {
                    return vscode.ThemeIcon.Folder;
                }
            default:
                {
                    //icon based on extension
                    if (["png", "gif", "jpg", "jpeg", "bmp"].indexOf(contextValue) > -1) {
                        return this.toIcon("image");
                    }
                    if (["md", "markdown"].indexOf(contextValue) > -1) {
                        return this.toIcon("markdown");
                    }
                    if (["gitignore"].indexOf(contextValue) > -1) {
                        return this.toIcon("git");
                    }
                    if (["txt"].indexOf(contextValue) > -1) {
                        return this.toIcon("text");
                    }
                    let iconForExtension = this.toIcon(contextValue);
                    if (!iconForExtension) {
                        return this.toIcon("file");
                    }
                    return iconForExtension;
                }
        }
    }
    toIcon(extension: string): string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri; } | vscode.ThemeIcon | undefined {
        let lightPath = this._context.asAbsolutePath(path.join('images', 'light', `${extension}.svg`));
        let darkPath = this._context.asAbsolutePath(path.join('images', 'dark', `${extension}.svg`));

        if (fs.existsSync(lightPath) && fs.existsSync(darkPath)) {
            return {
                light: this._context.asAbsolutePath(path.join('images', 'light', `${extension}.svg`)),
                dark: this._context.asAbsolutePath(path.join('images', 'dark', `${extension}.svg`))
            };
        }
        return;
    }

    async parseVsix(selectedItem: string): Promise<VsixItem> {
        let that = this;
        let fileName = path.basename(this._vsixPath);

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Scanning ${fileName}`,
        }, (progress, token) => {
            Util.instance.log(`Selected item: ${selectedItem}`);
            let root = new VsixItem(fileName, TreeItemCollapsibleState.Expanded);
            root.tooltip = this._vsixPath;
            root.iconType = "vsix";
            root.iconPath = this.getIcon(root.iconType);
            return new Promise<VsixItem>((resolve, reject) => {
                fs.readFile(this._vsixPath, function (err, data) {
                    if (err) {
                        Util.instance.log('Error occurred while reading VSIX');
                        Util.instance.log(err.message);
                        TelemetryClient.instance.sendError(err);
                        reject(err);
                    }
                    jszip.loadAsync(data, {
                        createFolders: true
                    }).then(zip => {
                        let files = Object.keys(zip.files);
                        let startTime = Date.now();
                        Util.instance.log(`Entries read: ${files.length}`);
                        files.forEach(entry => {
                            let file = zip.files[entry];
                            Util.instance.log(`Entry ${file}`);
                            let path = file.name.split("/").filter(v => {
                                return v && v.length > 0;
                            });
                            that.buildTree(root, path, file.dir, 0);
                        });
                        TelemetryClient.instance.sendEvent("vsixParsingTime", {
                            ["totalSecondsParsing"]: ((Date.now() - startTime) / 1000).toString()
                        });
                        resolve(root);
                    });
                });
            });
        });
    }
}
