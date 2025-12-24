import { TreeItem, TreeItemCollapsibleState } from "vscode";

export class VsixItem extends TreeItem {
    constructor(public readonly label: string, public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
    }

    public size: number = 0;
    public isDirectory: boolean = false;
    public children: VsixItem[] = [];
    public iconType: string = "";
    public fullPath: string = "";

    contextValue = "vsixItem";
}