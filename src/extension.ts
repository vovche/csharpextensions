import * as vscode from 'vscode';

import * as path from 'path';
import { EOL } from 'os';

import CodeActionProvider from './codeActionProvider';
import { isExistingDirectory } from './pathHelpers';
import BuildActions from './project/buildActions';
import CsprojWriter from './project/csprojWriter';
import CshtmlTemplate from './template/cshtmlTemplate';
import CsTemplate from './template/csTemplate';
import ReswTemplate from './template/reswTemplate';
import Template from './template/template';
import XamlTemplate from './template/xamlTemplate';



export function activate(context: vscode.ExtensionContext): void {
    const extension = Extension.GetInstance();

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.changeBuildAction',
        async (args: VscodeCommandArgs) => await extension.changeBuildAction(args)));

    Extension.GetKnownTemplates().forEach(template => {
        context.subscriptions.push(vscode.commands.registerCommand(template.getCommand(),
            async (args: VscodeCommandArgs) => await extension.createFromTemplate(args, template)));
    });

    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };
    const codeActionProvider = new CodeActionProvider();
    const disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);

    let stackedFiles: vscode.Uri[] = [];
    let timeLeft: number;
    let timer: NodeJS.Timeout;

    function fileStack(file: vscode.Uri) {
        stackedFiles.push(file);
        timeLeft = 100;
        clearInterval(timer);

        timer = setInterval(async () => {
            if (timeLeft <= 0) {
                clearInterval(timer);

                await extension.onCreateFiles({ files: stackedFiles });

                stackedFiles = [];
            }

            timeLeft -= 1;
        }, 10);
    }

    const watcher = vscode.workspace.createFileSystemWatcher('**');

    watcher.onDidCreate(event => { fileStack(event); });

    //vscode.workspace.onDidCreateFiles(onCreateFiles);
    vscode.workspace.onDidDeleteFiles(extension.onDeleteFiles);
    vscode.workspace.onDidRenameFiles(extension.onRenameFiles);
}

export function deactivate(): void { /* Nothing to do here */ } //TODO: Remove watchers?

export class Extension {
    private static HasShownFolderWarning = false;
    private constructor() { /**/ }

    private _getIncomingPath(args: VscodeCommandArgs): string | undefined {
        if (args) {
            return args._fsPath || args.fsPath || args.path;
        }

        return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
            ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    }

    public async createFromTemplate(args: VscodeCommandArgs, template: Template): Promise<void> {
        const incomingPath = this._getIncomingPath(args);

        if (!incomingPath) {
            vscode.window.showErrorMessage(`Could not find the path for this action.${EOL}If this problem persists, please create an issue in the github repository.`);

            return;
        }

        const extension = Extension.GetCurrentVscodeExtension();

        if (!extension) {
            vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');

            return;
        }

        try {
            let newFilename = await vscode.window.showInputBox({
                ignoreFocusOut: true,
                prompt: 'Please enter a name for the new file(s)',
                value: `new${template.getName()}`
            });

            if (typeof newFilename === 'undefined' || newFilename === '') {
                console.info('Filename request: User did not provide any input');

                return;
            }

            if (newFilename.endsWith('.cs'))
                newFilename = newFilename.substring(0, newFilename.length - 3);

            const pathWithoutExtension = `${incomingPath}${path.sep}${newFilename}`;
            const existingFiles = await template.getExistingFiles(pathWithoutExtension);

            if (existingFiles.length) {
                vscode.window.showErrorMessage(`File(s) already exists: ${EOL}${existingFiles.join(EOL)}`);

                return;
            }

            const templatesPath = path.join(extension.extensionPath, Extension.TemplatesPath);

            await template.create(templatesPath, pathWithoutExtension, newFilename);
        } catch (errOnInput) {
            console.error('Error on input', errOnInput);

            vscode.window.showErrorMessage('Error on input. See extension log for more info');
        }
    }

    private async _yesNoPickAsync(message: string): Promise<boolean | undefined> {
        const input = await vscode.window.showQuickPick(['No', 'Yes'], { ignoreFocusOut: true, placeHolder: message });

        return input === undefined ? undefined : input === 'Yes';
    }

    private async _isPerFileAction(itemCount: number): Promise<boolean | undefined> {
        if (itemCount > 1)
            return await this._yesNoPickAsync('Would you like to select the build action for each file individually?');

        return false;
    }

    private _showFolderWarning() {
        if (!Extension.HasShownFolderWarning) {
            vscode.window.showWarningMessage('Changing folder build actions currently isn\'t supported');

            Extension.HasShownFolderWarning = true;
        }
    }

    public async onCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
        const filePaths: string[] = [];
        const projectPaths: string[] = [];

        for (const fileUri of event.files) {
            if (await isExistingDirectory(fileUri.fsPath)) {
                const csprojWriter = await CsprojWriter.CreateWriterFromPath(fileUri.fsPath, true);

                if (csprojWriter && !await csprojWriter.hasBuildActionsForFile(fileUri.fsPath)) {
                    filePaths.push(fileUri.fsPath);
                    projectPaths.push(csprojWriter.getFilePath());
                }
            } else {
                this._showFolderWarning();
            }
        }

        if (!filePaths.length) return;

        const message = filePaths.length > 1 ? 'You can choose build actions on the newly added files' : 'You can choose a build action on the newly added file';
        const button = filePaths.length > 1 ? 'Choose build actions' : 'Choose a build action';

        if (!await vscode.window.showInformationMessage(message, button)) return;

        if (await this._isPerFileAction(filePaths.length)) {
            for (let i = 0; i < filePaths.length; i++) {
                const filePath = filePaths[i];
                const projectPath = projectPaths[i];
                const buildAction = await this._selectBuildAction(false, path.basename(filePath));

                if (buildAction) {
                    const csprojWriter = new CsprojWriter(projectPath);

                    await csprojWriter.addBuildActionsForFile(filePath, buildAction);
                }
            }
        } else {
            const uniqueProjectPaths = projectPaths.filter((item, pos, self) => self.indexOf(item) === pos);

            for (const projectPath of uniqueProjectPaths) {
                const buildAction = await this._selectBuildAction(true, '');

                if (buildAction) {
                    const csprojWriter = new CsprojWriter(projectPath);

                    await csprojWriter.addBuildActionsForFiles(filePaths, buildAction);
                }
            }
        }
    }

    public async onDeleteFiles(event: vscode.FileDeleteEvent): Promise<void> {
        for (const fileUri of event.files) {
            const csprojWriter = await CsprojWriter.CreateWriterFromPath(fileUri.fsPath);

            if (csprojWriter)
                await csprojWriter.removeBuildActionsForFile(fileUri.fsPath);
            //TODO: else warn - csproj not found?
        }
    }

    public async onRenameFiles(event: vscode.FileRenameEvent): Promise<void> {
        for (const renamedFileUris of event.files) {
            const csprojWriter = await CsprojWriter.CreateWriterFromPath(renamedFileUris.oldUri.fsPath);

            if (csprojWriter)
                await csprojWriter.handleBuildActionsForRenamedFile(renamedFileUris.oldUri.fsPath, renamedFileUris.newUri.fsPath);
            //TODO: else warn - csproj not found?
        }
    }

    public async changeBuildAction(args: VscodeCommandArgs): Promise<void> {
        //TODO: Add support to change multiple files --> https://github.com/microsoft/vscode/issues/3553 

        const incomingPath = this._getIncomingPath(args);

        if (!incomingPath) {
            vscode.window.showErrorMessage(`Could not find the path for this action.${EOL}If this problem persists, please create an issue in the github repository.`);

            return;
        }

        if (await isExistingDirectory(incomingPath)) {
            this._showFolderWarning();

            return;
        }

        if (incomingPath.endsWith('.sln') ||
            incomingPath.endsWith('.shproj') ||
            incomingPath.endsWith('.projitems') ||
            incomingPath.endsWith('.csproj') ||
            incomingPath.endsWith('.user') ||
            incomingPath === 'project.json') {
            vscode.window.showErrorMessage('The build action of this file type cannot be changed');

            return;
        }

        const csprojWriter = await CsprojWriter.CreateWriterFromPath(incomingPath);

        if (!csprojWriter) {
            vscode.window.showErrorMessage(`Cannot find a project file for path '${incomingPath}'`);

            return;
        }

        const buildAction = await this._selectBuildAction(false, path.basename(incomingPath));

        if (buildAction)
            await csprojWriter.addBuildActionsForFile(incomingPath, buildAction);
    }

    private async _selectBuildAction(multiple: boolean, name: string): Promise<BuildActions | undefined> {
        const items = Object.keys(BuildActions).filter(key => key !== 'Folder');
        const buildAction = await vscode.window.showQuickPick(
            items,
            {
                ignoreFocusOut: true,
                placeHolder: 'Please select build action for ' + (multiple ? 'files' : '\'' + name + '\'')
            }
        );

        if (!buildAction) return;

        return BuildActions[buildAction as keyof typeof BuildActions];
    }

    private static TemplatesPath = 'templates';
    private static KnownTemplates: Map<string, Template>;
    private static CurrentVscodeExtension: vscode.Extension<Extension> | undefined = undefined;
    private static Instance: Extension;
    private static KnownExtensionNames = [
        'kreativ-software.csharpextensions',
        'jsw.csharpextensions'
    ];

    public static GetInstance(): Extension {
        if (!this.Instance) {
            this.Instance = new Extension();
        }

        return this.Instance;
    }

    private static GetCurrentVscodeExtension(): vscode.Extension<Extension> | undefined {
        if (!this.CurrentVscodeExtension) {
            for (const extensionName of this.KnownExtensionNames) {
                const extension = vscode.extensions.getExtension(extensionName);

                if (extension) {
                    this.CurrentVscodeExtension = extension;

                    break;
                }
            }
        }

        return this.CurrentVscodeExtension;
    }

    static GetKnownTemplates(): Map<string, Template> {
        if (!this.KnownTemplates) {
            this.KnownTemplates = new Map();

            this.KnownTemplates.set('class', new CsTemplate('class', 'createClass'));
            this.KnownTemplates.set('interface', new CsTemplate('interface', 'createInterface'));
            this.KnownTemplates.set('enum', new CsTemplate('enum', 'createEnum'));
            this.KnownTemplates.set('controller', new CsTemplate('controller', 'createController', [
                'System.Diagnostics',
                'Microsoft.AspNetCore.Mvc',
                'Microsoft.Extensions.Logging',
            ]));
            this.KnownTemplates.set('apicontroller', new CsTemplate('apicontroller', 'createApiController', ['Microsoft.AspNetCore.Mvc']));
            this.KnownTemplates.set('razor_page', new CshtmlTemplate('razor_page', 'createRazorPage', [
                'Microsoft.AspNetCore.Mvc',
                'Microsoft.AspNetCore.Mvc.RazorPages',
                'Microsoft.Extensions.Logging',
            ]));
            this.KnownTemplates.set('uwp_page', new XamlTemplate('uwp_page', 'createUwpPage'));
            this.KnownTemplates.set('uwp_window', new XamlTemplate('uwp_window', 'createUwpWindow'));
            this.KnownTemplates.set('uwp_usercontrol', new XamlTemplate('uwp_usercontrol', 'createUwpUserControl'));
            this.KnownTemplates.set('uwp_resource', new ReswTemplate('uwp_resource', 'createUwpResourceFile'));
        }

        return this.KnownTemplates;
    }
}


interface VscodeCommandArgs {
    _fsPath?: string
    fsPath?: string
    path?: string
}