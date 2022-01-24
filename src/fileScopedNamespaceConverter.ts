import CsprojReader from './csprojReader';
import { Uri, workspace } from 'vscode';
import * as path from 'path';
import * as findupglob from 'find-up-glob';

export class FileScopedNamespaceConverter {
    /**
     * If the file to be created is a C# file, 
     * and the TargetFramework version of the current project is .NET 6.0+, 
     * and this feature is enabled in settings, 
     * then return the file-scoped namespace form of the template. 
     * 
     * Else return the original template.
     * 
     * @param template The content of the C# template file.
     * @param filePath The path of the C# file that is being created. Used to locate the .csproj file and get the TargetFramework version.
     */

    public async getFileScopedNamespaceFormOfTemplateIfNecessary(template: string, filePath: string): Promise<string> {
        const useFileScopedNamespace = 
            workspace.getConfiguration().get<boolean>('csharpextensions.useFileScopedNamespace', false) &&
            filePath.endsWith('.cs') &&
            await this.targetFrameworkHigherThanOrEqualToDotNet6(filePath);

        return useFileScopedNamespace ? this.getFileScopedNamespaceFormOfTemplate(template) : template;
    }

    private async targetFrameworkHigherThanOrEqualToDotNet6(filePath: string): Promise<boolean> {
        const csprojs: string[] = await findupglob('*.csproj', { cwd: path.dirname(filePath) });

        if (csprojs === null || csprojs.length < 1) {
            return false;
        }

        const csprojFile = csprojs[0];
        const csprojDocument =  await workspace.openTextDocument(Uri.file(csprojFile))
        const fileContent = csprojDocument.getText();
        const projectReader = new CsprojReader(fileContent);
        const targetFramework = await projectReader.getTargetFramework();

        if (targetFramework === undefined) {
            return false;
        }
        
        const versionString = targetFramework.match(/(?<=net)\d+(\.\d+)*/i); // Match .NET version string like "net6.0"

        if (versionString === null) {
            return false;
        }

        const version = +versionString[0];

        return version >= 6;
    }

    /**
     * Get the file-scoped namespace form of the template.
     * 
     * From:
     * ```csharp
     * namespace ${namespace}
     * {
     *    // Template content
     *    // Template content
     * }
     * ```
     * 
     * To:
     * ```csharp
     * namespace ${namespace};
     * 
     * // Template content
     * // Template content
     * ```
     * 
     * @param template The content of the C# template file.
     */
    private getFileScopedNamespaceFormOfTemplate(template: string): string {
        const result = template
            .replace(new RegExp(/(?<=^)({|}| {4})/, 'gm'), '')
            .replace(new RegExp(/(?<=\${namespace})/), ';');

        return result;
    }
}

export default new FileScopedNamespaceConverter();