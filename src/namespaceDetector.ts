import * as path from 'path';

import { workspace } from 'vscode';

import CsprojReader from './project/csprojReader';
import ProjectJsonReader from './project/projectJsonReader';
import ProjectReader from './project/projectReader';

export default class NamespaceDetector {
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async getNamespace(): Promise<string> {
        let fullNamespace = await this.fromCsproj();

        if (fullNamespace) return fullNamespace;

        fullNamespace = await this.fromProjectJson();

        if (fullNamespace) return fullNamespace;

        return await this.fromFilepath();
    }

    private async fromCsproj(): Promise<string | undefined> {
        const csprojReader = await CsprojReader.CreateReaderFromPath(this.filePath);

        return await this.getRootNamespace(csprojReader);
    }

    private async fromProjectJson(): Promise<string | undefined> {
        const projectJsonReader = await ProjectJsonReader.CreateReaderFromPath(this.filePath);

        return await this.getRootNamespace(projectJsonReader);
    }

    private async getRootNamespace(projectReader: ProjectReader | undefined): Promise<string | undefined> {
        if (!projectReader) return;

        const rootNamespace = await projectReader.getRootNamespace();

        if (!rootNamespace) return;

        return this.calculateFullNamespace(rootNamespace, path.dirname(projectReader.getFilePath()));
    }

    private async getRootPath(): Promise<string> {
        const projectPath = await ProjectReader.FindProjectPath(this.filePath);

        if (projectPath) {
            const projectPathSplit = projectPath.split(path.sep);

            return projectPathSplit.slice(0, projectPathSplit.length - 2).join(path.sep);
        }

        return workspace.workspaceFolders && workspace.workspaceFolders.length ? workspace.workspaceFolders[0].uri.fsPath : '';
    }

    private async fromFilepath(): Promise<string> {
        const rootPath = await this.getRootPath();
        const namespaceWithLeadingDot = this.calculateFullNamespace('', rootPath);

        return namespaceWithLeadingDot.slice(1);
    }

    private calculateFullNamespace(rootNamespace: string, rootDirectory: string): string {
        const filePathSegments: string[] = path.dirname(this.filePath).split(path.sep);
        const rootDirSegments: string[] = rootDirectory.split(path.sep);
        
        let fullNamespace = rootNamespace;

        // Remove rootDirSegments from filePathSegments
        // Then append filePathSegments to full namespace
        for (let index = rootDirSegments.length; index < filePathSegments.length; index++) {
            fullNamespace += '.' + filePathSegments[index];
        }

        return fullNamespace;
    }
}
