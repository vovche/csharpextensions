import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import { promises as fs } from 'fs';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector from './namespaceDetector';
import { CsprojWriter, BuildActions } from './csprojWriter';

const classnameRegex = new RegExp(/\${classname}/, 'g');
const namespaceRegex = new RegExp(/\${namespace}/, 'g');
const knownExtensionNames = [
    'kreativ-software.csharpextensions',
    'jsw.csharpextensions'
];

export function activate(context: vscode.ExtensionContext): void {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.changeBuildAction', changeBuildAction));

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createClass',
        async (args: any) => await promptAndSave(args, 'class')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createInterface',
        async (args: any) => await promptAndSave(args, 'interface')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createEnum',
        async (args: any) => await promptAndSave(args, 'enum')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createController',
        async (args: any) => await promptAndSave(args, 'controller')));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createApiController',
        async (args: any) => await promptAndSave(args, 'apicontroller')));

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

                await onCreateFiles({ files: stackedFiles });

                stackedFiles = [];
            }
            
            timeLeft -= 1;
        }, 10);
    }

    const watcher = vscode.workspace.createFileSystemWatcher("**");

    watcher.onDidCreate(event => { fileStack(event); });

    //vscode.workspace.onDidCreateFiles(onCreateFiles);
    vscode.workspace.onDidDeleteFiles(onDeleteFiles);
    vscode.workspace.onDidRenameFiles(onRenameFiles);
}

async function onCreateFiles(event: vscode.FileCreateEvent) {
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
            isPerFileAction = await yesNoPickAsync('Would you like to select the build action for each file individually?');

            if (isPerFileAction === undefined) return;
        }

        if (isPerFileAction) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const proj = projs[i];
                const buildAction = await selectBuildActionAsync(proj, false, path.basename(file));

                if (buildAction != undefined) await csproj.add(proj, [file], buildAction);
            }
        } else {
            const uniqueProjs = projs.filter((item, pos, self) => self.indexOf(item) == pos);

            for (let i = 0; i < uniqueProjs.length; i++) {
                const proj = uniqueProjs[i];
                const buildAction = await selectBuildActionAsync(proj, true, '');

                if (buildAction != undefined) await csproj.add(proj, files, buildAction);
            }
        }
    });
}

async function onDeleteFiles(event: vscode.FileDeleteEvent) {
    const csproj = new CsprojWriter();
    const files = event.files;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const proj = await csproj.getProjFilePath(file.fsPath);

        if (proj !== undefined) await csproj.remove(proj, file.fsPath);
    }
}

async function onRenameFiles(event: vscode.FileRenameEvent) {
    const csproj = new CsprojWriter();
    const files = event.files;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const proj = await csproj.getProjFilePath(file.oldUri.fsPath);

        if (proj !== undefined) await csproj.rename(proj, file.oldUri.fsPath, file.newUri.fsPath);
    }
}

async function changeBuildAction(args: any) {
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
        const buildAction = await selectBuildActionAsync(proj, false, path.basename(incomingPath));

        if (buildAction != undefined) await csproj.add(proj, [incomingPath], buildAction);
    }
}

async function selectBuildActionAsync(proj: string, multiple: boolean, name: string): Promise<BuildActions | undefined> {
    if (proj === undefined) return;

    const items = Object.keys(BuildActions).filter(key => key !== 'Folder');
    const buildAction = await vscode.window.showQuickPick(
        items,
        { ignoreFocusOut: true, placeHolder: 'Please select build action for ' + (multiple ? 'files' : "'" + name + "'") }
    );

    if (buildAction === undefined) return;

    return BuildActions[buildAction as keyof typeof BuildActions];
}

async function promptAndSave(args: any, templatetype: string) {
    if (!args) {
        args = {
            _fsPath: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
                ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined
        };
    }

    const incomingpath: string = args._fsPath || args.fsPath || args.path;

    try {
        const newfilename = await vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter filename', value: 'new' + templatetype + '.cs' });

        if (typeof newfilename === 'undefined' || newfilename === '') return;

        let newfilepath = incomingpath + path.sep + newfilename;

        newfilepath = correctExtension(newfilepath);

        try {
            await fs.access(newfilepath);

            vscode.window.showErrorMessage(`File already exists: ${EOL}${newfilepath}`);

            return;
        } catch { }

        const namespaceDetector = new NamespaceDetector(newfilepath);
        const namespace = await namespaceDetector.getNamespace();
        const typename = path.basename(newfilepath, '.cs');

        await openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
    } catch (errOnInput) {
        console.error('Error on input', errOnInput);

        vscode.window.showErrorMessage('Error on input. See extensions log for more info');
    }
}

function correctExtension(filename: string) {
    if (path.extname(filename) !== '.cs') {
        if (filename.endsWith('.')) filename = filename + 'cs';
        else filename = filename + '.cs';
    }

    return filename;
}

function findCurrentExtension(): vscode.Extension<any> | undefined {
    for (let i = 0; i < knownExtensionNames.length; i++) {
        const extension = vscode.extensions.getExtension(knownExtensionNames[i]);

        if (extension) return extension;
    }

    return undefined;
}

async function openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
    const templatefileName = type + '.tmpl';
    const extension = findCurrentExtension();

    if (!extension) {
        vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');

        return;
    }

    const templateFilePath = path.join(extension.extensionPath, 'templates', templatefileName);

    try {
        const doc = await fs.readFile(templateFilePath, 'utf-8');
        const includeNamespaces = vscode.workspace.getConfiguration().get('csharpextensions.includeNamespaces', true);
        let namespaces = '';

        if (includeNamespaces) {
            namespaces = [
                'using System;',
                'using System.Collections.Generic;',
                'using System.Linq;',
                'using System.Threading.Tasks;'
            ].join(EOL);

            namespaces = `${namespaces}${EOL}${EOL}`;
        }

        let text = doc
            .replace(namespaceRegex, namespace)
            .replace(classnameRegex, filename)
            .replace('${namespaces}', namespaces);

        const cursorPosition = findCursorInTemplate(text);

        text = text.replace('${cursor}', '');

        await fs.writeFile(originalfilepath, text);

        const openedDoc = await vscode.workspace.openTextDocument(originalfilepath);
        const editor = await vscode.window.showTextDocument(openedDoc);

        if (cursorPosition) {
            const newselection = new vscode.Selection(cursorPosition, cursorPosition);

            editor.selection = newselection;
        }
    } catch (errTryingToCreate) {
        const errorMessage = `Error trying to create file '${originalfilepath}' from template '${templatefileName}'`;

        console.error(errorMessage, errTryingToCreate);

        vscode.window.showErrorMessage(errorMessage);
    }
}

function findCursorInTemplate(text: string): vscode.Position | null {
    const cursorPos = text.indexOf('${cursor}');
    const preCursor = text.substr(0, cursorPos);
    const matchesForPreCursor = preCursor.match(/\n/gi);

    if (matchesForPreCursor === null) return null;

    const lineNum = matchesForPreCursor.length;
    const charNum = preCursor.substr(preCursor.lastIndexOf('\n')).length;

    return new vscode.Position(lineNum, charNum);
}

async function yesNoPickAsync(message: string): Promise<boolean | undefined> {
    let input = await vscode.window.showQuickPick(["No", "Yes"], { ignoreFocusOut: true, placeHolder: message });

    return input === undefined ? undefined : input === 'Yes';
}

export function deactivate(): void { /* Nothing to do here */ }
