import * as vscode from 'vscode';

import { promises as fs } from 'fs';
import * as path from 'path';

import NamespaceDetector from '../namespaceDetector';

export default abstract class Template {
    private _name: string;
    private _command: string;

    constructor(name: string, command: string) {
        this._name = name;
        this._command = command;
    }

    public getName(): string { return this._name; }
    public getCommand(): string {
        return `csharpextensions.${this._command}`;
    }
  
    public async getExistingFiles(pathWithoutExtension: string): Promise<string[]> {
        const extensions = this.getExtensions();
        const existingFiles: string[] = [];

        for (let i = 0; i < extensions.length; i++) {
            const fullPath = `${pathWithoutExtension}${extensions[i]}`;

            try {
                await fs.access(fullPath);

                existingFiles.push(fullPath);
            } catch { }
        }

        return existingFiles;
    }

    private async getNamespace(pathWithoutExtension: string): Promise<string> {
        const namespaceDetector = new NamespaceDetector(pathWithoutExtension);

        return await namespaceDetector.getNamespace();
    }

    protected async _createFile(templatePath: string, filePath: string, filename: string, namespaces: string = '') {
        try {
            const doc = await fs.readFile(templatePath, 'utf-8');
            const namespace = await this.getNamespace(filePath);
            const includeNamespaces = vscode.workspace.getConfiguration().get('csharpextensions.includeNamespaces', true);

            let text = doc
                .replace(Template.NamespaceRegex, namespace)
                .replace(Template.ClassnameRegex, filename);

            if (includeNamespaces) text = text.replace('${namespaces}', namespaces);

            const cursorPosition = this._findCursorInTemplate(text);

            text = text.replace('${cursor}', '');

            await fs.writeFile(filePath, text);

            const openedDoc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(openedDoc);

            if (cursorPosition) {
                const newSelection = new vscode.Selection(cursorPosition, cursorPosition);

                editor.selection = newSelection;
            }
        } catch (errTryingToCreate) {
            const errorMessage = `Error trying to create file '${filePath}' from template '${templatePath}'`;

            console.error(errorMessage, errTryingToCreate);

            vscode.window.showErrorMessage(errorMessage);
        }
    }

    protected _getTemplatePath(templatesPath: string, templateName: string): string {
        return path.join(templatesPath, `${templateName}.tmpl`);
    }

    public abstract getExtensions(): string[];
    public abstract create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void>;

    private _findCursorInTemplate(text: string): vscode.Position | null {
        const cursorPos = text.indexOf('${cursor}');
        const preCursor = text.substr(0, cursorPos);
        const matchesForPreCursor = preCursor.match(/\n/gi);

        if (matchesForPreCursor === null) return null;

        const lineNum = matchesForPreCursor.length;
        const charNum = preCursor.substr(preCursor.lastIndexOf('\n')).length;

        return new vscode.Position(lineNum, charNum);
    }

    private static ClassnameRegex = new RegExp(/\${classname}/, 'g');
    private static NamespaceRegex = new RegExp(/\${namespace}/, 'g');
}
