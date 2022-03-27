import * as vscode from 'vscode';

import { promises as fs } from 'fs';
import { EOL } from 'os';
import * as path from 'path';
import { sortBy, uniq } from 'lodash';

import CsprojReader from '../project/csprojReader';
import NamespaceDetector from '../namespaceDetector';
import fileScopedNamespaceConverter from '../fileScopedNamespaceConverter';

export default abstract class Template {
    private static readonly ClassnameRegex = new RegExp(/\${classname}/, 'g');
    private static readonly NamespaceRegex = new RegExp(/\${namespace}/, 'g');
    private static readonly EolRegex = new RegExp(/\r?\n/g);

    private _name: string;
    private _command: string;
    private _requiredUsings: string[];

    constructor(name: string, command: string, requiredUsings: string[] = []) {
        this._name = name;
        this._command = command;
        this._requiredUsings = requiredUsings;
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

    private async _useImplicitUsings(filePath: string): Promise<boolean> {
        const skipImplicitUsings = vscode.workspace.getConfiguration().get('csharpextensions.usings.implicit', false);

        if (skipImplicitUsings === false) return false;

        const csprojReader = await CsprojReader.createFromPath(filePath); // project.json not supported for > .net6

        return await csprojReader?.useImplicitUsings() === true;
    }

    protected async _createFile(templatePath: string, filePath: string, filename: string): Promise<void> {
        try {
            const doc = await fs.readFile(templatePath, 'utf-8');
            const namespace = await this.getNamespace(filePath);
            const useImplicitUsings = await this._useImplicitUsings(filePath);
            const eolSetting = vscode.workspace.getConfiguration().get('files.eol', EOL);

            let text = await fileScopedNamespaceConverter.getFileScopedNamespaceFormOfTemplateIfNecessary(doc, filePath);

            text = text
                .replace(Template.NamespaceRegex, namespace)
                .replace(Template.ClassnameRegex, filename)
                .replace('${namespaces}', this._getUsings(useImplicitUsings))
                .replace(Template.EolRegex, eolSetting); // EOL should always be last

            // Only find cursor now, because position can be shifted in replacings
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

    private static readonly KnownImplicitUsings = [
        'System',
        'System.Collections.Generic',
        'System.IO',
        'System.Linq',
        'System.Net.Http',
        'System.Threading',
        'System.Threading.Tasks',
    ];

    private _removeImplicitUsings(usings: string[]): string[] {
        return usings.filter(using => !Template.KnownImplicitUsings.includes(using));
    }

    private _getUsings(skipImplicit: boolean): string {
        const includeUsings = vscode.workspace.getConfiguration().get('csharpextensions.usings.include', true);
        let usings = this._requiredUsings;

        if (includeUsings) usings = usings.concat(this.getOptionalUsings());
        if (skipImplicit) usings = this._removeImplicitUsings(usings);

        if (!usings.length) return '';

        usings = uniq(usings);
        usings = sortBy(usings, [(using) => !using.startsWith('System'), (using) => using]);

        const joinedUsings = usings
            .map(using => `using ${using};`)
            .join(EOL);

        return `${joinedUsings}${EOL}${EOL}`;
    }

    protected abstract getExtensions(): string[];
    protected abstract getOptionalUsings(): string[];
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
}
