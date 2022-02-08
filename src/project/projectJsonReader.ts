import { Uri, workspace } from 'vscode';
import ProjectReader from './projectReader';

export default class ProjectJsonReader extends ProjectReader {
    /**
     * Initializes a new instance for a project.json file
     *
     * @param filePath - The path to the project.json file
     */
    constructor(filePath: string) {
        super(filePath);
        //TODO: Check if project.json file
    }

    /**
     * @inheritdoc
     */
    public async getRootNamespace(): Promise<string | undefined> {
        try {
            const document = await workspace.openTextDocument(Uri.file(this.filePath));
            const jsonContent = JSON.parse(document.getText());

            return jsonContent.tooling?.defaultNamespace;
        } catch (errParsingJson) {
            console.error('Error parsing project json', errParsingJson);
        }

        return;
    }

    /**
     * @inheritdoc
     */
    protected _getSupportedExtensions(): Array<string> {
        return ['.json'];
    }

    /**
     * Tries to create a new project.json reader from the given path, searched upwards
     *
     * @param findFromPath The path from where to start looking for a project.json file
     * @returns A new project.json reader if a file is found, or undefined
     */
    public static async CreateReaderFromPath(findFromPath: string): Promise<ProjectJsonReader | undefined> {
        return await this.CreateProjectFromPath(findFromPath, 'project.json');
    }
}
