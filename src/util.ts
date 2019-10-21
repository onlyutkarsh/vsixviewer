import { window, OutputChannel } from "vscode";

export default class Util {
    private static _instance: Util;

    private _channel: OutputChannel;
    private constructor() {
        this._channel = window.createOutputChannel("VSIX Viewer");
    }

    static get instance(): Util {
        if (!Util._instance) {
            Util._instance = new Util();
        }
        return Util._instance;
    }

    public log(message: string | undefined) {
        if (message) {
            this._channel.appendLine(message);
        }
    }
}