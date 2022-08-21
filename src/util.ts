import { OutputChannel, window } from 'vscode';

let logChannel: OutputChannel | undefined;

function getLogChannel(): OutputChannel {
    if (!logChannel) {
        logChannel = window.createOutputChannel('csharpextensions');
    }

    return logChannel;
}

function combineMessage(message: string, error: object | string | unknown | undefined): string {
    if (!error) return message;

    const errLog: { error: unknown, internalError: unknown } = {
        error,
        internalError: undefined
    };

    if (error instanceof ExtensionError) {
        errLog.internalError = (error as ExtensionError).getInternalError();
    }

    const errLogJson = JSON.stringify(errLog);

    return `${message} - ${errLogJson}`;
}

export function log(message: string, error: object | string | unknown | undefined = undefined) {
    const log = getLogChannel();
    const combinedMessage = combineMessage(message, error);

    log.appendLine(combinedMessage);
}

export function showAndLogErrorMessage(errorMessage: string, error: object | string | unknown | undefined) {
    log(errorMessage, error);

    if (error) window.showErrorMessage(`${errorMessage} - See extension log for more info`);
    else window.showErrorMessage(errorMessage);
}

export class ExtensionError extends Error {
    protected _internalError: Error | unknown | undefined;

    constructor(message: string, internalError: Error | unknown | undefined = undefined) {
        super(message);

        this._internalError = internalError;
    }

    public getInternalError(): Error | unknown | undefined {
        return this._internalError;
    }
}