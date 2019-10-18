declare module 'node-stream-zip' {
    export = main;
}

declare const main: NodeStreamZip;

interface NSZOpitons {
    file: string;
    storeEntries?: boolean;
    skipEntryNameValidation?: boolean
}

interface NSZEntry {
    isDirectory: boolean;
    size: number;
    name: string;
}

interface NodeStreamZip {
    new(options: NSZOpitons): NodeStreamZip;
    on(name: 'ready' | 'extract', callback: () => void): void;
    entries(): NSZEntry[];
    entry(name: string): NSZEntry;
    stream(entry: string, cb: (err: Error, stm: any) => void): void;
    entryDataSync(entry: string): any;
    close(): void;
    entriesCount: number;
}