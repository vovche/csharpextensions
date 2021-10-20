import * as vscode from 'vscode';

import { promises as fs } from 'fs';
import * as path from 'path';
import { EOL } from 'os';

import Template from './template/template';
import CsTemplate from './template/csTemplate';
import CshtmlTemplate from './template/cshtmlTemplate';
import ReswTemplate from './template/reswTemplate';
import XamlTemplate from './template/xamlTemplate';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector from './namespaceDetector';
import { CsprojWriter, BuildActions } from './csprojWriter';


export function activate(context: vscode.ExtensionContext): void {
    const extension = Extension.GetInstance();

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.changeBuildAction', extension.changeBuildAction));

    Extension.GetKnownTemplates().forEach(template => {
        context.subscriptions.push(vscode.commands.registerCommand(template.getCommand(),
            async (args: any) => await extension.createFromTemplate(args, template)));
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

    const watcher = vscode.workspace.createFileSystemWatcher("**");

    watcher.onDidCreate(event => { fileStack(event); });

    //vscode.workspace.onDidCreateFiles(onCreateFiles);
    vscode.workspace.onDidDeleteFiles(extension.onDeleteFiles);
    vscode.workspace.onDidRenameFiles(extension.onRenameFiles);
}

export function deactivate(): void { /* Nothing to do here */ }

export class Extension {
    private constructor() { /**/ }

    private _getIncomingPath(args: any): string | undefined {
        if (args) {
            return args._fsPath || args.fsPath || args.path;
        }

        return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
            ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    }

    public async createFromTemplate(args: any, template: Template): Promise<void> {
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

            if (newFilename.endsWith('.cs')) newFilename = newFilename.substring(0, newFilename.length - 3);

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
        let input = await vscode.window.showQuickPick(["No", "Yes"], { ignoreFocusOut: true, placeHolder: message });
    
        return input === undefined ? undefined : input === 'Yes';
    }

    public async onCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
        const csproj = new CsprojWriter();
        let files: string[] = [];
        let projs: string[] = [];
    
        for (let i = 0; i < event.files.length; i++) {
            const file = event.files[i];
            const proj = await csproj.getProjFilePath(file.fsPath);
            const fileStat = await fs.lstat(file.fsPath)
    
            if (proj !== undefined && !fileStat.isDirectory()) {
                const alreadyInProj = await csproj.get(proj, file.fsPath) != undefined;
    
                if (!alreadyInProj) {
                    files.push(file.fsPath);
                    projs.push(proj);
                }
            }
        }
    
        if (files.length < 1) return;
    
        const message = files.length > 1 ? "You can choose build actions on the newly added files" : "You can choose a build action on the newly added file";
        const button = files.length > 1 ? "Choose build actions" : "Choose a build action";
    
        await vscode.window.showInformationMessage(message, button).then(async event => {
            if (event == undefined) return;
    
            let isPerFileAction: boolean | undefined = false;
    
            if (files.length > 1) {
                isPerFileAction = await this._yesNoPickAsync('Would you like to select the build action for each file individually?');
    
                if (isPerFileAction === undefined) return;
            }
    
            if (isPerFileAction) {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const proj = projs[i];
                    const buildAction = await this._selectBuildActionAsync(proj, false, path.basename(file));
    
                    if (buildAction != undefined) await csproj.add(proj, [file], buildAction);
                }
            } else {
                const uniqueProjs = projs.filter((item, pos, self) => self.indexOf(item) == pos);
    
                for (let i = 0; i < uniqueProjs.length; i++) {
                    const proj = uniqueProjs[i];
                    const buildAction = await this._selectBuildActionAsync(proj, true, '');
    
                    if (buildAction != undefined) await csproj.add(proj, files, buildAction);
                }
            }
        });
    }
    
    public async onDeleteFiles(event: vscode.FileDeleteEvent): Promise<void> {
        const csproj = new CsprojWriter();
        const files = event.files;
    
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const proj = await csproj.getProjFilePath(file.fsPath);
    
            if (proj !== undefined) await csproj.remove(proj, file.fsPath);
        }
    }
    
    public async onRenameFiles(event: vscode.FileRenameEvent): Promise<void> {
        const csproj = new CsprojWriter();
        const files = event.files;
    
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const proj = await csproj.getProjFilePath(file.oldUri.fsPath);
    
            if (proj !== undefined) await csproj.rename(proj, file.oldUri.fsPath, file.newUri.fsPath);
        }
    }
    
    public async changeBuildAction(args: any): Promise<void> {
        if (args == null) return;
    
        //TODO: Add support to change multiple files --> https://github.com/microsoft/vscode/issues/3553 
    
        const incomingPath: string = args.fsPath || args.path;
        const isDir = (await fs.lstat(incomingPath)).isDirectory();
    
        if (isDir) {
            vscode.window.showErrorMessage("The folder's build action cannot be changed");
            return;
        }
    
        if (incomingPath.endsWith('.sln') ||
            incomingPath.endsWith('.shproj') ||
            incomingPath.endsWith('.projitems') ||
            incomingPath.endsWith('.csproj') ||
            incomingPath.endsWith('.user') ||
            incomingPath === 'project.json') {
            vscode.window.showErrorMessage("The build action of this file cannot be changed");
            return;
        }
    
        const csproj = new CsprojWriter();
        const proj = await csproj.getProjFilePath(incomingPath);
    
        if (proj != undefined) {
            const buildAction = await this._selectBuildActionAsync(proj, false, path.basename(incomingPath));
    
            if (buildAction != undefined) await csproj.add(proj, [incomingPath], buildAction);
        }
    }
    
    private async _selectBuildActionAsync(proj: string, multiple: boolean, name: string): Promise<BuildActions | undefined> {
        if (proj === undefined) return;
    
        const items = Object.keys(BuildActions).filter(key => key !== 'Folder');
        const buildAction = await vscode.window.showQuickPick(
            items,
            { ignoreFocusOut: true, placeHolder: 'Please select build action for ' + (multiple ? 'files' : "'" + name + "'") }
        );
    
        if (buildAction === undefined) return;
    
        return BuildActions[buildAction as keyof typeof BuildActions];
    }

    private static TemplatesPath = 'templates';
    private static KnownTemplates: Map<string, Template>;
    private static CurrentVscodeExtension: vscode.Extension<any> | undefined = undefined;
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

    private static GetCurrentVscodeExtension(): vscode.Extension<any> | undefined {
        if (!this.CurrentVscodeExtension) {
            for (let i = 0; i < this.KnownExtensionNames.length; i++) {
                const extension = vscode.extensions.getExtension(this.KnownExtensionNames[i]);

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
