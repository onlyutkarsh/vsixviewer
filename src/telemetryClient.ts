"use strict";
import TelemetryReporter from "vscode-extension-telemetry";
import * as vscode from "vscode";
import { userInfo } from "os";
import { sep } from "path";

let startTime: number;
export default class TelemetryClient {
    private static _instance: TelemetryClient;
    private _reporter?: TelemetryReporter;
    private _appInsightsInstrumentationKey = "ec6a3108-a886-49e7-a6fa-f3fd5318ee0c";
    private _enabled: boolean = false;
    private _lastStackTrackTrace: string = "";

    static get instance(): TelemetryClient {
        if (!TelemetryClient._instance) {
            startTime = Date.now();
            TelemetryClient._instance = new TelemetryClient();
        }
        return TelemetryClient._instance;
    }

    private constructor() {
        const extensionId = "onlyutkarsh.vsix-viewer";
        const extension = vscode.extensions.getExtension(extensionId)!;
        const extensionVersion = extension.packageJSON.version;
        let shouldEnableTelemetry = vscode.workspace.getConfiguration("vsixViewer").get<boolean>("enableTelemetry");
        if (shouldEnableTelemetry) {
            this._enabled = true;
            this._reporter = new TelemetryReporter(extensionId, extensionVersion, this._appInsightsInstrumentationKey);
        }
    }
    public sendEvent(eventName: string, properties?: { [key: string]: string; }): void {
        let final: { [key: string]: string } = {};
        final["os"] = process.env.os || "??";

        if (this._enabled && this._reporter) {
            final = { ...final, ...properties };
            this._reporter.sendTelemetryEvent(eventName, final);
        }
    }

    public sendError(error: Error) {
        if (error.stack) {
            if (error.stack === this._lastStackTrackTrace) {
                return;
            }
            if (this._enabled && this._reporter) {
                let properties: { [key: string]: string } = {};
                properties["os"] = process.env.os || "??";
                error.stack = this.anonymizePaths(error.stack);
                this._reporter.sendTelemetryException(error, properties);
                this._lastStackTrackTrace = error.stack;
            }
        }

    }
    private anonymizePaths(input: string) {
        if (input === null) {
            return input;
        }
        return input.replace(new RegExp(`\\${sep}${userInfo().username}`, "g"), `${sep}****`);
    }

    dispose() {
        let properties: { [key: string]: string } = {};
        properties["os"] = process.env.os || "??";
        properties["totalExtensionActiveTime"] = ((Date.now() - startTime) / 1000).toString();
        TelemetryClient.instance.sendEvent("extensionEnded", properties);

        if (this._reporter) {
            this._reporter.dispose();
        }
    }
}

