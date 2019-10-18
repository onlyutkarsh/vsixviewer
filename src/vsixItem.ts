import { TreeItem, TreeItemCollapsibleState } from "vscode";

export class VsixItem extends TreeItem {
    constructor(public readonly label: string, public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
    }

    private _tooltip: string = "";
    get tooltip(): string {
        return this._tooltip;
    }

    set tooltip(v: string) {
        this._tooltip = v;
    }
    private _size: number = 0;
    public get size(): number {
        return this._size;
    }
    public set size(v: number) {
        this._size = v;
    }
    private _isDirectory: boolean = false;
    public get isDirectory(): boolean {
        return this._isDirectory;
    }
    public set isDirectory(v: boolean) {
        this._isDirectory = v;
    }
    private _children: VsixItem[] = [];
    public get children(): VsixItem[] {
        return this._children;
    }
    public set children(v: VsixItem[]) {
        this._children = v;
    }


    private _iconType: string = "";
    public get iconType(): string {
        return this._iconType;
    }
    public set iconType(v: string) {
        this._iconType = v;
    }


    contextValue = 'vsixItem';
}