import {
    commands,
    window,
    workspace,
    TextEdit,
    Uri,
    WorkspaceEdit,
} from 'vscode';

export function showAndLogErrorMessage(
    errorMessage: string,
    error: object | string | unknown | undefined
) {
    if (error) {
        const errLog: { error: unknown; internalError: unknown } = {
            error,
            internalError: undefined,
        };

        if (error instanceof ExtensionError) {
            errLog.internalError = (error as ExtensionError).getInternalError();
        }

        console.error(errorMessage, errLog);

        window.showErrorMessage(
            `${errorMessage} - See extension log for more info`
        );
    } else {
        console.error(errorMessage);

        window.showErrorMessage(errorMessage);
    }
}

export class ExtensionError extends Error {
    protected _internalError: Error | unknown | undefined;

    constructor(
        message: string,
        internalError: Error | unknown | undefined = undefined
    ) {
        super(message);

        this._internalError = internalError;
    }

    public getInternalError(): Error | unknown | undefined {
        return this._internalError;
    }
}

export async function formatDocument(
    uri: Uri,
    respectSetting: boolean = true
): Promise<boolean> {
    if (respectSetting) {
        const shouldFormat = workspace
            .getConfiguration()
            .get('csharpextensions.reFormatAfterChange', true);

        if (!shouldFormat) return false;
    }

    const formatEdits = await commands.executeCommand<TextEdit[]>(
        'vscode.executeFormatDocumentProvider',
        uri,
        {}
    );

    if (!formatEdits?.length) return false;

    const fullFormatEdit = new WorkspaceEdit();

    fullFormatEdit.set(uri, formatEdits);

    return await workspace.applyEdit(fullFormatEdit);
}
