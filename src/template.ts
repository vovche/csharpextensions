import * as vscode from 'vscode';

import { promises as fs } from 'fs';
import * as path from 'path';
import { EOL } from 'os';

import NamespaceDetector from './namespaceDetector';

export enum TemplateType {
    Cs,
    Resw,
    Xaml
}

export class Template {
    private _name: string;
    private _command: string;
    private _type: TemplateType;

    constructor(name: string, command: string, type: TemplateType) {
        this._name = name;
        this._command = command;
        this._type = type;
    }

    public getName(): string { return this._name; }
    public getType(): TemplateType { return this._type; }
    public getCommand(): string {
        return `csharpextensions.${this._command}`;
    }

    public getExtensions(): string[] {
        switch (this._type) {
            case TemplateType.Resw:
                return ['.resw'];
            case TemplateType.Xaml:
                return ['.xaml', '.xaml.cs'];
            case TemplateType.Cs:
            default:
                return ['.cs'];
        }
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

    private async _createFile(templatePath: string, filePath: string, filename: string, namespaces: string = '') {
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

    private _getTemplatePath(templatesPath: string, templateName: string): string {
        return path.join(templatesPath, `${templateName}.tmpl`);
    }

    private async _createCs(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const templatePath = this._getTemplatePath(templatesPath, this._name);
        const filePath = `${pathWithoutExtension}.cs`;
        const namespaces = [
            'using System;',
            'using System.Collections.Generic;',
            'using System.Linq;',
            'using System.Threading.Tasks;',
            EOL
        ].join(EOL);

        await this._createFile(templatePath, filePath, filename, namespaces);
    }

    private async _createResw(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const templatePath = this._getTemplatePath(templatesPath, this._name);
        const filePath = `${pathWithoutExtension}.resw`;

        await this._createFile(templatePath, filePath, filename);
    }

    private async _createXaml(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const xamlTemplatePath = this._getTemplatePath(templatesPath, this._name);
        const csTemplatePath = this._getTemplatePath(templatesPath, `${this._name}.cs`);
        const xamlFilePath = `${pathWithoutExtension}.xaml`;
        const csFilePath = `${pathWithoutExtension}.xaml.cs`;
        const namespaces = [
            'using System;',
            'using System.Collections.Generic;',
            'using System.Linq;',
            'using System.Text;',
            'using System.Threading.Tasks;',
            'using System.Windows.Data;',
            'using System.Windows.Documents;',
            'using System.Windows.Input;',
            'using System.Windows.Media;',
            'using System.Windows.Media.Imaging;',
            'using System.Windows.Navigation;',
            'using System.Windows.Shapes;',
            EOL
        ].join(EOL);

        await this._createFile(csTemplatePath, csFilePath, filename, namespaces);
        await this._createFile(xamlTemplatePath, xamlFilePath, filename);
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        switch (this._type) {
            case TemplateType.Resw:
                await this._createResw(templatesPath, pathWithoutExtension, filename);
                break;
            case TemplateType.Xaml:
                await this._createXaml(templatesPath, pathWithoutExtension, filename);
                break;
            case TemplateType.Cs:
            default:
                await this._createCs(templatesPath, pathWithoutExtension, filename);
                break;
        }
    }

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
    private static KnownTemplates: Map<string, Template>;

    static GetKnownTemplates(): Map<string, Template> {
        if (!this.KnownTemplates) {
            this.KnownTemplates = new Map();

            this.KnownTemplates.set('class', new Template('class', 'createClass', TemplateType.Cs));
            this.KnownTemplates.set('interface', new Template('interface', 'createInterface', TemplateType.Cs));
            this.KnownTemplates.set('enum', new Template('enum', 'createEnum', TemplateType.Cs));
            this.KnownTemplates.set('controller', new Template('controller', 'createController', TemplateType.Cs));
            this.KnownTemplates.set('apicontroller', new Template('apicontroller', 'createApiController', TemplateType.Cs));
            this.KnownTemplates.set('uwp_page', new Template('uwp_page', 'createUwpPage', TemplateType.Xaml));
            this.KnownTemplates.set('uwp_window', new Template('uwp_window', 'createUwpWindow', TemplateType.Xaml));
            this.KnownTemplates.set('uwp_usercontrol', new Template('uwp_usercontrol', 'createUwpUserControl', TemplateType.Xaml));
            this.KnownTemplates.set('uwp_resource', new Template('uwp_resource', 'createUwpResourceFile', TemplateType.Resw));
        }

        return this.KnownTemplates;
    }
}
