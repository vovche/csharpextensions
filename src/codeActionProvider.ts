import {
    commands,
    window,
    workspace,
    CodeAction,
    CodeActionKind,
    Position,
    Range,
    TextDocument,
    TextEdit,
    Uri,
    WorkspaceEdit,
    CodeActionProvider as VSCodeCodeActionProvider
} from 'vscode';
import * as os from 'os';

export default class CodeActionProvider implements VSCodeCodeActionProvider {
    private _commandIds = {
        ctorFromProperties: 'csharpextensions.ctorFromProperties',
    };

    private static readonly ReadonlyRegex = new RegExp(/(public|private|protected)\s(\w+)\s(\w+)\s?{\s?(get;)\s?(private\s)?(set;)?\s?}/g);
    private static readonly ClassRegex = new RegExp(/(private|internal|public|protected)\s?(static)?\sclass\s(\w*)/g);

    constructor() {
        commands.registerCommand(this._commandIds.ctorFromProperties, this.executeCtorFromProperties, this);
    }

    public provideCodeActions(document: TextDocument): CodeAction[] {
        const codeActions = new Array<CodeAction>();
        const ctorPAction = this.getCtorpAction(document);

        if (ctorPAction) codeActions.push(ctorPAction);

        return codeActions;
    }

    private camelize(str: string) {
        return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
            if (+match === 0) return ''; // or if (/\s+/.test(match)) for white spaces

            return index === 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }

    private async executeCtorFromProperties(args: ConstructorFromPropertiesArgument) {
        const tabSize = workspace.getConfiguration().get('editor.tabSize', 4);
        const ctorParams = new Array<string>();

        if (!args.properties)
            return;

        args.properties.forEach((p) => {
            ctorParams.push(`${p.type} ${this.camelize(p.name)}`);
        });

        const assignments = args.properties
            .map(prop => `${Array(tabSize * 1).join(' ')} this.${prop.name} = ${this.camelize(prop.name)};${os.EOL}`);

        const firstPropertyLine = args.properties.sort((a, b) => a.lineNumber - b.lineNumber)[0].lineNumber;

        const ctorStatement = `${Array(tabSize * 2).join(' ')} ${args.classDefinition.modifier} ${args.classDefinition.className}(${ctorParams.join(', ')}) 
        {
        ${assignments.join('')}   
        }
        `;

        const edit = new WorkspaceEdit();
        const edits = new Array<TextEdit>();

        const pos = new Position(firstPropertyLine, 0);
        const range = new Range(pos, pos);
        const ctorEdit = new TextEdit(range, ctorStatement);

        edits.push(ctorEdit);

        await this.formatDocument(args.document.uri, edit, edits);
    }

    private async formatDocument(documentUri: Uri, edit: WorkspaceEdit, edits: Array<TextEdit>) {
        edit.set(documentUri, edits);

        const reFormatAfterChange = workspace.getConfiguration().get('csharpextensions.reFormatAfterChange', true);

        await workspace.applyEdit(edit);

        if (reFormatAfterChange) {
            try {
                const formattingEdits = await commands.executeCommand<TextEdit[]>('executeFormatDocumentProvider', documentUri);

                if (formattingEdits !== undefined) {
                    const formatEdit = new WorkspaceEdit();

                    formatEdit.set(documentUri, formattingEdits);

                    workspace.applyEdit(formatEdit);
                }
            } catch (err) {
                console.error('Error trying to format document - ', err);
            }
        }
    }

    private getCtorpAction(document: TextDocument): CodeAction | undefined {
        const editor = window.activeTextEditor;

        if (!editor) return;

        const position = editor.selection.active;
        const withinClass = this.findClassFromLine(document, position.line);

        if (!withinClass) return;

        const properties = new Array<CSharpPropertyDefinition>();
        let lineNo = 0;

        while (lineNo < document.lineCount) {
            const textLine = document.lineAt(lineNo);
            const match = CodeActionProvider.ReadonlyRegex.exec(textLine.text);

            if (match) {
                const foundClass = this.findClassFromLine(document, lineNo);

                if (foundClass && foundClass.className === withinClass.className) {
                    const prop: CSharpPropertyDefinition = {
                        lineNumber: lineNo,
                        class: foundClass,
                        modifier: match[1],
                        type: match[2],
                        name: match[3],
                        statement: match[0]
                    };

                    properties.push(prop);
                }
            }

            lineNo++;
        }

        if (!properties.length) return;

        const classDefinition = this.findClassFromLine(document, position.line);

        if (!classDefinition) return;

        const parameter: ConstructorFromPropertiesArgument = {
            properties: properties,
            classDefinition: classDefinition,
            document: document
        };

        const codeAction = new CodeAction('Initialize ctor from properties...', CodeActionKind.RefactorExtract);

        codeAction.command = {
            title: codeAction.title,
            command: this._commandIds.ctorFromProperties,
            arguments: [parameter]
        };

        return codeAction;
    }

    private findClassFromLine(document: TextDocument, lineNo: number): CSharpClassDefinition | null {
        if (!lineNo) lineNo = document.lineCount - 1;
        if (lineNo >= document.lineCount) lineNo = document.lineCount - 1;

        while (lineNo >= 0) {
            const line = document.lineAt(lineNo);
            const match = CodeActionProvider.ClassRegex.exec(line.text);

            if (match) {
                return {
                    startLine: lineNo,
                    endLine: -1,
                    className: match[3],
                    modifier: match[1],
                    statement: match[0]
                };
            }

            lineNo--;
        }

        return null;
    }
}

interface CSharpClassDefinition {
    startLine: number,
    endLine: number,
    className: string,
    modifier: string,
    statement: string
}

interface CSharpPropertyDefinition {
    class: CSharpClassDefinition,
    modifier: string,
    type: string,
    name: string,
    statement: string,
    lineNumber: number
}

interface ConstructorFromPropertiesArgument {
    document: TextDocument,
    classDefinition: CSharpClassDefinition,
    properties: CSharpPropertyDefinition[]
}